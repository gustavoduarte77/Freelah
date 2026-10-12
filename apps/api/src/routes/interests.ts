import {
  describeJobAvailability,
  ownJobEffectiveStatus,
  type InterestResponse,
  type JobInterest,
  type JobViewerResponse,
  type MyInterest,
  type OwnJobStatus,
  type PublicJobStatus,
} from "@freelah/shared";
import { Router, type Response } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import { getSession, requireAuth } from "../middleware/require-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 100;

const PENDING_ONLY_MESSAGE = "Só é possível selecionar quem está com o interesse pendente.";

/** Interrompe a transação de seleção: desfaz tudo o que ela já tivesse gravado. */
class NotSelectableError extends Error {}

const notFound = (res: Response, message = "Oportunidade não encontrada.") =>
  res.status(404).json({ error: "not_found", message });
const refuse = (res: Response, error: string, message: string) =>
  res.status(409).json({ error, message });

const asInterest = (row: { id: string; status: InterestResponse["interest"]["status"] }): InterestResponse["interest"] => ({
  id: row.id,
  status: row.status,
});

/**
 * Interesse em oportunidades (PRD 17): demonstrar, retirar, acompanhar e, para o contratante, ver
 * quem demonstrou.
 *
 * - A pessoa é SEMPRE a da sessão; nada vindo do cliente decide quem demonstra interesse.
 * - Demonstrar interesse trava a linha da oportunidade (FOR UPDATE) dentro de uma transação: assim o
 *   interesse nunca nasce depois de um cancelamento ou contratação concorrente, e pedidos
 *   simultâneos da mesma pessoa viram um interesse só (o resto recebe "já demonstrou").
 * - O primeiro interesse muda a oportunidade para "Em negociação".
 * - Nenhuma resposta traz telefone ou e-mail de ninguém.
 */
export function createInterestsRouter(
  auth: Auth,
  prisma: PrismaClient,
  options: { now?: () => Date } = {},
): Router {
  const now = options.now ?? (() => new Date());
  const router = Router();
  const guard = requireAuth(auth);
  const noStore: import("express").RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };

  // ------------------------------------------------------------ relação com a oportunidade
  router.get("/jobs/:id/viewer", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const me = getSession(res).user.id;
      const job = UUID.test(id)
        ? await prisma.job.findFirst({
            where: { id, status: { not: "DRAFT" } },
            select: { ownerId: true, interests: { where: { workerId: me }, select: { id: true, status: true } } },
          })
        : null;
      if (!job) {
        notFound(res);
        return;
      }
      const mine = job.interests[0];
      const body: JobViewerResponse = { isOwner: job.ownerId === me, interest: mine ? asInterest(mine) : null };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ demonstrar interesse
  router.post("/jobs/:id/interest", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const workerId = getSession(res).user.id;
      if (!UUID.test(id)) {
        notFound(res);
        return;
      }
      const moment = now();

      const outcome = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { ownerId: string; status: OwnJobStatus; expiresAt: Date }[]
        >`SELECT "ownerId", "status", "expiresAt" FROM "Job" WHERE "id" = ${id} FOR UPDATE`;
        const job = rows[0];
        if (!job || job.status === "DRAFT") return { kind: "not_found" as const };
        if (job.ownerId === workerId) return { kind: "own_job" as const };
        const effective = ownJobEffectiveStatus(job.status, job.expiresAt, moment);
        if (effective !== "PUBLISHED" && effective !== "NEGOTIATING") {
          return { kind: "not_accepting" as const, status: effective as PublicJobStatus };
        }

        const existing = await tx.interest.findUnique({ where: { jobId_workerId: { jobId: id, workerId } } });
        let interest: { id: string; status: InterestResponse["interest"]["status"] };
        if (existing && existing.status !== "WITHDRAWN") {
          return { kind: "duplicate" as const, interest: asInterest(existing) };
        }
        if (existing) {
          // Quem retirou o interesse pode voltar a demonstrá-lo: a mesma linha volta a pendente.
          interest = await tx.interest.update({ where: { id: existing.id }, data: { status: "PENDING" } });
        } else {
          interest = await tx.interest.create({ data: { jobId: id, workerId } });
        }
        if (job.status === "PUBLISHED") {
          await tx.job.update({ where: { id }, data: { status: "NEGOTIATING" } });
        }
        return { kind: "created" as const, interest: asInterest(interest) };
      });

      switch (outcome.kind) {
        case "not_found":
          notFound(res);
          return;
        case "own_job":
          refuse(res, "own_job", "Esta é a sua oportunidade: você não pode demonstrar interesse nela.");
          return;
        case "not_accepting":
          refuse(
            res,
            "not_accepting",
            describeJobAvailability(outcome.status).message ?? "Esta oportunidade não aceita novos interessados.",
          );
          return;
        case "duplicate":
          res.status(409).json({
            error: "already_interested",
            message: "Você já demonstrou interesse nesta oportunidade.",
            interest: outcome.interest,
          });
          return;
        case "created": {
          const body: InterestResponse = { interest: outcome.interest };
          res.status(201).json(body);
          return;
        }
      }
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ retirar interesse
  router.post("/me/interests/:id/withdraw", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const workerId = getSession(res).user.id;
      const row = UUID.test(id) ? await prisma.interest.findFirst({ where: { id, workerId } }) : null;
      if (!row) {
        notFound(res, "Interesse não encontrado.");
        return;
      }
      // Só enquanto pendente: quem já foi selecionado ou recusado não retira por aqui.
      const result = await prisma.interest.updateMany({ where: { id, workerId, status: "PENDING" }, data: { status: "WITHDRAWN" } });
      if (result.count === 0) {
        refuse(res, "not_withdrawable", "Este interesse não pode mais ser retirado.");
        return;
      }
      const body: InterestResponse = { interest: { id, status: "WITHDRAWN" } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ selecionar o trabalhador (só a dona)
  router.post("/me/interests/:id/select", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const me = getSession(res).user.id;
      const target = UUID.test(id)
        ? await prisma.interest.findFirst({ where: { id, job: { ownerId: me } }, select: { id: true, jobId: true } })
        : null;
      if (!target) {
        notFound(res, "Interesse não encontrado.");
        return;
      }
      const moment = now();

      const outcome = await prisma
        .$transaction(async (tx) => {
          // Trava a oportunidade: duas seleções ao mesmo tempo viram fila, e a segunda já a encontra contratada.
          const rows = await tx.$queryRaw<
            { status: OwnJobStatus; expiresAt: Date }[]
          >`SELECT "status", "expiresAt" FROM "Job" WHERE "id" = ${target.jobId} FOR UPDATE`;
          const job = rows[0];
          if (!job) return { kind: "not_found" as const };
          const effective = ownJobEffectiveStatus(job.status, job.expiresAt, moment);
          if (effective !== "PUBLISHED" && effective !== "NEGOTIATING") {
            return {
              kind: "closed" as const,
              message:
                effective === "HIRED" || effective === "COMPLETED"
                  ? "Esta oportunidade já tem uma pessoa selecionada."
                  : effective === "CANCELLED"
                    ? "Esta oportunidade foi cancelada."
                    : "Não é possível selecionar agora: a oportunidade não está aberta.",
            };
          }
          const interest = await tx.interest.findUnique({ where: { id: target.id }, select: { status: true } });
          if (!interest || interest.status !== "PENDING") {
            return { kind: "closed" as const, message: PENDING_ONLY_MESSAGE };
          }
          // Atualização condicional: se a pessoa retirou o interesse entre a leitura e a escrita, nenhuma
          // linha muda e a transação inteira é desfeita (nada de contratar quem acabou de desistir).
          const accepted = await tx.interest.updateMany({
            where: { id: target.id, jobId: target.jobId, status: "PENDING" },
            data: { status: "ACCEPTED" },
          });
          if (accepted.count !== 1) throw new NotSelectableError(PENDING_ONLY_MESSAGE);
          await tx.interest.updateMany({
            where: { jobId: target.jobId, id: { not: target.id }, status: "PENDING" },
            data: { status: "REJECTED" },
          });
          await tx.job.update({
            where: { id: target.jobId },
            data: { status: "HIRED", selectedInterestId: target.id, hiredAt: moment },
          });
          return { kind: "selected" as const };
        })
        .catch((error: unknown) => {
          if (error instanceof NotSelectableError) return { kind: "closed" as const, message: error.message };
          throw error;
        });

      if (outcome.kind === "not_found") {
        notFound(res, "Interesse não encontrado.");
        return;
      }
      if (outcome.kind === "closed") {
        refuse(res, "not_selectable", outcome.message);
        return;
      }
      const body: InterestResponse = { interest: { id: target.id, status: "ACCEPTED" } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ meus interesses
  router.get("/me/interests", guard, noStore, async (_req, res, next) => {
    try {
      const rows = await prisma.interest.findMany({
        where: { workerId: getSession(res).user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
        select: {
          id: true,
          status: true,
          createdAt: true,
          job: {
            select: {
              id: true,
              title: true,
              city: true,
              state: true,
              scheduledDate: true,
              startTime: true,
              proposedPriceCents: true,
              negotiable: true,
              status: true,
              expiresAt: true,
              category: { select: { name: true } },
              owner: { select: { name: true } },
            },
          },
        },
      });
      const moment = now();
      const interests: MyInterest[] = rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        job: {
          id: row.job.id,
          title: row.job.title,
          category: row.job.category.name,
          city: row.job.city,
          state: row.job.state,
          scheduledDate: row.job.scheduledDate.toISOString().slice(0, 10),
          startTime: row.job.startTime,
          proposedPriceCents: row.job.proposedPriceCents,
          negotiable: row.job.negotiable,
          status: ownJobEffectiveStatus(row.job.status, row.job.expiresAt, moment) as PublicJobStatus,
          ownerName: row.job.owner.name,
        },
      }));
      res.json({ interests });
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ interessados (só a dona)
  router.get("/me/jobs/:id/interests", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const ownerId = getSession(res).user.id;
      const job = UUID.test(id) ? await prisma.job.findFirst({ where: { id, ownerId }, select: { id: true } }) : null;
      if (!job) {
        notFound(res);
        return;
      }
      const rows = await prisma.interest.findMany({
        where: { jobId: id, status: { not: "WITHDRAWN" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
        select: { id: true, status: true, createdAt: true, worker: { select: { name: true, city: true } } },
      });
      const interests: JobInterest[] = rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        worker: { name: row.worker.name, city: row.worker.city },
      }));
      res.json({ interests });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
