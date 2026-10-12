import {
  JOB_VALIDATION_MESSAGE,
  OWN_JOB_STATE_MESSAGES,
  canCancelJob,
  canEditJob,
  canPublishJob,
  createJobSchema,
  jobFieldErrors,
  ownJobEffectiveStatus,
  updateJobSchema,
  validateJobSchedule,
  type JobSchedule,
  type OwnJob,
  type OwnJobResponse,
  type OwnJobStatus,
  type OwnJobsResponse,
} from "@freelah/shared";
import { Router, type Response } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import { expireOverdueJobs } from "../expiry";
import { getSession, requireAuth } from "../middleware/require-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MY_JOBS_LIMIT = 100;
const INVALID_CATEGORY_MESSAGE = "Escolha uma categoria válida.";
const NOT_FOUND_MESSAGE = "Oportunidade não encontrada.";
const CONFLICT_MESSAGE =
  "Esta oportunidade foi alterada em outro lugar. Recarregue a tela e tente de novo.";
const ALREADY_PUBLISHED_MESSAGE = "Esta oportunidade já foi publicada.";

const ownSelect = {
  id: true,
  title: true,
  description: true,
  additionalInfo: true,
  city: true,
  state: true,
  scheduledDate: true,
  startTime: true,
  proposedPriceCents: true,
  negotiable: true,
  status: true,
  isDemo: true,
  expiresAt: true,
  publishedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, name: true } },
} as const;

type OwnRow = NonNullable<Awaited<ReturnType<typeof findOwn>>>;

// Busca sempre limitada ao dono: quem não é dono recebe o mesmo resultado de quem procura um id
// que não existe.
function findOwn(prisma: PrismaClient, id: string, ownerId: string) {
  return prisma.job.findFirst({ where: { id, ownerId }, select: ownSelect });
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const dayToDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function toOwnJob(row: OwnRow, now: Date): OwnJob {
  const status = ownJobEffectiveStatus(row.status as OwnJobStatus, row.expiresAt, now);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    additionalInfo: row.additionalInfo,
    category: row.category,
    city: row.city,
    state: row.state,
    scheduledDate: day(row.scheduledDate),
    startTime: row.startTime,
    proposedPriceCents: row.proposedPriceCents,
    negotiable: row.negotiable,
    status,
    isDemo: row.isDemo,
    expiresAt: row.expiresAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canEditJob(status),
    canPublish: canPublishJob(status),
    canCancel: canCancelJob(status),
  };
}

const scheduleOf = (row: OwnRow): JobSchedule => ({
  scheduledDate: day(row.scheduledDate),
  startTime: row.startTime,
  expiresAt: row.expiresAt.toISOString(),
});

function sendValidation(res: Response, fields: Record<string, string>) {
  res.status(400).json({ error: "validation_error", message: JOB_VALIDATION_MESSAGE, fields });
}

const sendNotFound = (res: Response) =>
  res.status(404).json({ error: "not_found", message: NOT_FOUND_MESSAGE });

const sendInvalidState = (res: Response, message: string) =>
  res.status(409).json({ error: "invalid_state", message });

/**
 * Oportunidades do próprio usuário (PRD 14, 15 e 16): criar, listar, editar, publicar e cancelar.
 *
 * - Toda rota exige sessão. O dono vem SEMPRE da sessão; `ownerId`, `status` e `isDemo` enviados
 *   pelo cliente são rejeitados como campos desconhecidos.
 * - Preferências ("Encontrar trabalho", "Contratar alguém") não entram aqui: não são permissões.
 * - Cada mudança de estado é um UPDATE condicional ao estado e ao dono (e, na edição, à versão
 *   lida), então duas requisições simultâneas nunca produzem um estado inválido: só uma vence.
 * - O prazo e a data são validados em horário de Brasília, e a lista pública só mostra o que está
 *   publicado e dentro do prazo (não muda).
 */
export function createMyJobsRouter(
  auth: Auth,
  prisma: PrismaClient,
  options: { now?: () => Date } = {},
): Router {
  const now = options.now ?? (() => new Date());
  const router = Router();

  router.use("/me/jobs", requireAuth(auth), (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  async function categoryIsActive(id: string): Promise<boolean> {
    return (await prisma.category.count({ where: { id, active: true } })) > 0;
  }

  // ------------------------------------------------------------------ criar
  router.post("/me/jobs", async (req, res, next) => {
    try {
      const parsed = createJobSchema.safeParse(req.body);
      if (!parsed.success) {
        sendValidation(res, jobFieldErrors(parsed.error));
        return;
      }
      const { publish, ...input } = parsed.data;
      const moment = now();
      const scheduleErrors = validateJobSchedule(input, moment, true);
      if (Object.keys(scheduleErrors).length > 0) {
        sendValidation(res, scheduleErrors);
        return;
      }
      if (!(await categoryIsActive(input.categoryId))) {
        sendValidation(res, { categoryId: INVALID_CATEGORY_MESSAGE });
        return;
      }

      const created = await prisma.job.create({
        data: {
          title: input.title,
          description: input.description,
          additionalInfo: input.additionalInfo ?? null,
          categoryId: input.categoryId,
          ownerId: getSession(res).user.id,
          city: input.city,
          state: input.state,
          scheduledDate: dayToDate(input.scheduledDate),
          startTime: input.startTime,
          proposedPriceCents: input.proposedPriceCents,
          negotiable: input.negotiable ?? false,
          isDemo: false,
          expiresAt: new Date(input.expiresAt),
          status: publish ? "PUBLISHED" : "DRAFT",
          publishedAt: publish ? moment : null,
        },
        select: ownSelect,
      });
      const body: OwnJobResponse = { job: toOwnJob(created, moment) };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------------ ler
  router.get("/me/jobs", async (_req, res, next) => {
    try {
      const ownerId = getSession(res).user.id;
      // Deixa o banco igual ao que a pessoa vai ver. Se falhar, a lista sai mesmo assim: o estado
      // "expirada" também é calculado na leitura (toOwnJob).
      await expireOverdueJobs(prisma, now(), ownerId).catch((error: unknown) => {
        console.error("Falha ao marcar oportunidades expiradas:", error);
      });
      const rows = await prisma.job.findMany({
        where: { ownerId },
        select: ownSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MY_JOBS_LIMIT,
      });
      const moment = now();
      const body: OwnJobsResponse = { jobs: rows.map((row) => toOwnJob(row, moment)) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/me/jobs/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const row = UUID.test(id) ? await findOwn(prisma, id, getSession(res).user.id) : null;
      if (!row) {
        sendNotFound(res);
        return;
      }
      const body: OwnJobResponse = { job: toOwnJob(row, now()) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------------ editar
  router.patch("/me/jobs/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const ownerId = getSession(res).user.id;
      const row = UUID.test(id) ? await findOwn(prisma, id, ownerId) : null;
      if (!row) {
        sendNotFound(res);
        return;
      }
      const moment = now();
      const current = toOwnJob(row, moment);
      if (!current.canEdit) {
        sendInvalidState(res, OWN_JOB_STATE_MESSAGES[current.status]);
        return;
      }

      // Versão que a pessoa estava vendo (opcional): se a oportunidade mudou desde então, nada é
      // alterado, em vez de misturar a edição com a de outra tela.
      let payload: unknown = req.body;
      if (typeof payload === "object" && payload !== null && !Array.isArray(payload) && "expectedUpdatedAt" in payload) {
        const { expectedUpdatedAt, ...rest } = payload as Record<string, unknown>;
        if (typeof expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(expectedUpdatedAt))) {
          sendValidation(res, { expectedUpdatedAt: "Informe a versão que você estava vendo." });
          return;
        }
        if (Date.parse(expectedUpdatedAt) !== row.updatedAt.getTime()) {
          res.status(409).json({ error: "conflict", message: CONFLICT_MESSAGE });
          return;
        }
        payload = rest;
      }

      const parsed = updateJobSchema.safeParse(payload);
      if (!parsed.success) {
        sendValidation(res, jobFieldErrors(parsed.error));
        return;
      }
      const patch = parsed.data;

      // Só confere "no futuro / até 60 dias" quando a pessoa mexeu no calendário.
      const touchesCalendar =
        patch.scheduledDate !== undefined ||
        patch.startTime !== undefined ||
        patch.expiresAt !== undefined;
      const errors = validateJobSchedule(
        {
          scheduledDate: patch.scheduledDate ?? day(row.scheduledDate),
          startTime: patch.startTime ?? row.startTime,
          expiresAt: patch.expiresAt ?? row.expiresAt.toISOString(),
        },
        moment,
        touchesCalendar,
      );
      if (Object.keys(errors).length > 0) {
        sendValidation(res, errors);
        return;
      }
      if (patch.categoryId !== undefined && !(await categoryIsActive(patch.categoryId))) {
        sendValidation(res, { categoryId: INVALID_CATEGORY_MESSAGE });
        return;
      }

      const { scheduledDate, expiresAt, ...rest } = patch;
      const result = await prisma.job.updateMany({
        where: {
          id,
          ownerId,
          // Mesma versão que foi lida e mesmo estado: outra edição ou mudança de estado no meio
          // do caminho faz esta falhar em vez de sobrescrever.
          updatedAt: row.updatedAt,
          status: row.status,
          ...(row.status === "DRAFT" ? {} : { expiresAt: { gt: moment } }),
        },
        data: {
          ...rest,
          // Nova versão sempre maior que a lida, mesmo no mesmo milissegundo ou com o relógio
          // atrasado: sem isso, outra edição que leu a versão antiga poderia passar na comparação.
          updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
          ...(scheduledDate !== undefined ? { scheduledDate: dayToDate(scheduledDate) } : {}),
          ...(expiresAt !== undefined ? { expiresAt: new Date(expiresAt) } : {}),
        },
      });
      if (result.count === 0) {
        await respondAfterLostRace(res, await findOwn(prisma, id, ownerId), moment, "edit");
        return;
      }
      const updated = await findOwn(prisma, id, ownerId);
      if (!updated) {
        sendNotFound(res);
        return;
      }
      const body: OwnJobResponse = { job: toOwnJob(updated, moment) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------------ publicar
  router.post("/me/jobs/:id/publish", async (req, res, next) => {
    try {
      const id = req.params.id;
      const ownerId = getSession(res).user.id;
      const row = UUID.test(id) ? await findOwn(prisma, id, ownerId) : null;
      if (!row) {
        sendNotFound(res);
        return;
      }
      const moment = now();
      if (row.status !== "DRAFT") {
        sendInvalidState(
          res,
          row.status === "PUBLISHED" || row.status === "NEGOTIATING"
            ? ALREADY_PUBLISHED_MESSAGE
            : OWN_JOB_STATE_MESSAGES[toOwnJob(row, moment).status],
        );
        return;
      }
      // Um rascunho antigo pode ter ficado com data ou prazo no passado: confere de novo.
      const errors = validateJobSchedule(scheduleOf(row), moment, true);
      if (Object.keys(errors).length > 0) {
        sendValidation(res, errors);
        return;
      }
      if (!(await categoryIsActive(row.category.id))) {
        sendValidation(res, { categoryId: INVALID_CATEGORY_MESSAGE });
        return;
      }

      const result = await prisma.job.updateMany({
        where: { id, ownerId, status: "DRAFT", updatedAt: row.updatedAt },
        data: { status: "PUBLISHED", publishedAt: moment },
      });
      if (result.count === 0) {
        await respondAfterLostRace(res, await findOwn(prisma, id, ownerId), moment, "publish");
        return;
      }
      const published = await findOwn(prisma, id, ownerId);
      if (!published) {
        sendNotFound(res);
        return;
      }
      const body: OwnJobResponse = { job: toOwnJob(published, moment) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------------ cancelar
  router.post("/me/jobs/:id/cancel", async (req, res, next) => {
    try {
      const id = req.params.id;
      const ownerId = getSession(res).user.id;
      const row = UUID.test(id) ? await findOwn(prisma, id, ownerId) : null;
      if (!row) {
        sendNotFound(res);
        return;
      }
      const moment = now();
      const current = toOwnJob(row, moment);
      if (!current.canCancel) {
        sendInvalidState(res, cancelMessage(current.status));
        return;
      }

      const result = await prisma.job.updateMany({
        where: {
          id,
          ownerId,
          status: { in: ["DRAFT", "PUBLISHED", "NEGOTIATING"] },
          // Rascunho nunca expira; uma publicada vencida já é "expirada" e não se cancela.
          OR: [{ status: "DRAFT" }, { expiresAt: { gt: moment } }],
        },
        data: { status: "CANCELLED", cancelledAt: moment },
      });
      if (result.count === 0) {
        await respondAfterLostRace(res, await findOwn(prisma, id, ownerId), moment, "cancel");
        return;
      }
      const cancelled = await findOwn(prisma, id, ownerId);
      if (!cancelled) {
        sendNotFound(res);
        return;
      }
      const body: OwnJobResponse = { job: toOwnJob(cancelled, moment) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function cancelMessage(status: OwnJobStatus): string {
  return status === "CANCELLED" ? "Esta oportunidade já foi cancelada." : OWN_JOB_STATE_MESSAGES[status];
}

/**
 * O UPDATE condicional não encontrou a linha: ela mudou entre a leitura e a escrita (ou sumiu).
 * Responde com o estado real, em vez de fingir sucesso.
 */
async function respondAfterLostRace(
  res: Response,
  fresh: OwnRow | null,
  moment: Date,
  action: "edit" | "publish" | "cancel",
): Promise<void> {
  if (!fresh) {
    sendNotFound(res);
    return;
  }
  const current = toOwnJob(fresh, moment);
  if (action === "cancel") {
    sendInvalidState(res, current.canCancel ? CONFLICT_MESSAGE : cancelMessage(current.status));
  } else if (action === "publish") {
    sendInvalidState(
      res,
      current.status === "PUBLISHED" || current.status === "NEGOTIATING"
        ? ALREADY_PUBLISHED_MESSAGE
        : current.canPublish
          ? CONFLICT_MESSAGE
          : OWN_JOB_STATE_MESSAGES[current.status],
    );
  } else {
    res.status(409).json({
      error: current.canEdit ? "conflict" : "invalid_state",
      message: current.canEdit ? CONFLICT_MESSAGE : OWN_JOB_STATE_MESSAGES[current.status],
    });
  }
}
