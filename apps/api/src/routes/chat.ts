import {
  ownJobEffectiveStatus,
  sendMessageSchema,
  type ChatMessage,
  type Conversation,
  type ConversationListItem,
  type OwnJobStatus,
  type PublicJobStatus,
} from "@freelah/shared";
import { Router, type RequestHandler, type Response } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import { getSession, requireAuth } from "../middleware/require-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;

const notFound = (res: Response, message = "Conversa não encontrada.") =>
  res.status(404).json({ error: "not_found", message });
const refuse = (res: Response, error: string, message: string) => res.status(409).json({ error, message });

/** Marcador "createdAt|id" da última mensagem vista (ordem estável mesmo com datas iguais). */
function encodeCursor(message: { createdAt: Date; id: string }): string {
  return `${message.createdAt.toISOString()}|${message.id}`;
}
function decodeCursor(value: unknown): { createdAt: Date; id: string } | null {
  if (typeof value !== "string") return null;
  const [iso, id] = value.split("|");
  const createdAt = iso ? new Date(iso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id || !UUID.test(id)) return null;
  return { createdAt, id };
}

/**
 * Chat (PRD 18): uma conversa por interesse, entre quem demonstrou interesse e a dona da oportunidade.
 *
 * - Só quem participa da conversa lê ou envia mensagens: a API confere a participação a cada pedido
 *   (nunca confia em ids vindos do cliente) e responde 404 para quem não participa.
 * - A conversa é criada sob demanda, uma única vez por interesse (a unicidade é do banco).
 * - Cancelada, vencida, interesse retirado ou não selecionado: a conversa segue legível, sem envio.
 * - Atualização por consulta periódica: o app pede só as mensagens depois do último marcador.
 * - As respostas não trazem telefone, e-mail nem ids de outras pessoas.
 */
export function createChatRouter(
  auth: Auth,
  prisma: PrismaClient,
  options: { now?: () => Date } = {},
): Router {
  const now = options.now ?? (() => new Date());
  const router = Router();
  const guard = requireAuth(auth);
  const noStore: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };

  /** Por que não dá mais para enviar nesta conversa (ou `null` se dá). */
  function blockedReason(interestStatus: string, jobStatus: OwnJobStatus): string | null {
    if (jobStatus === "CANCELLED") return "O contratante cancelou esta oportunidade. A conversa ficou só para consulta.";
    if (jobStatus === "EXPIRED") return "O prazo desta oportunidade terminou. A conversa ficou só para consulta.";
    if (interestStatus === "WITHDRAWN") return "O interesse foi retirado. A conversa ficou só para consulta.";
    if (interestStatus === "REJECTED") return "Outra pessoa foi selecionada. A conversa ficou só para consulta.";
    return null;
  }

  const conversationSelect = {
    id: true,
    job: { select: { id: true, title: true, status: true, expiresAt: true, ownerId: true } },
    interest: { select: { status: true, workerId: true, worker: { select: { name: true } } } },
    participants: { select: { userId: true } },
  } as const;

  /** A conversa, só se a pessoa participa dela. */
  async function findMine(id: string, me: string) {
    if (!UUID.test(id)) return null;
    const row = await prisma.conversation.findFirst({
      where: { id, participants: { some: { userId: me } } },
      select: { ...conversationSelect, job: { select: { ...conversationSelect.job.select, owner: { select: { name: true } } } } },
    });
    return row;
  }

  type Mine = NonNullable<Awaited<ReturnType<typeof findMine>>>;

  const jobStatusOf = (row: Mine): OwnJobStatus => ownJobEffectiveStatus(row.job.status, row.job.expiresAt, now());
  const otherName = (row: Mine, me: string) => (row.job.ownerId === me ? row.interest.worker.name : row.job.owner.name);

  function toConversation(row: Mine, me: string): Conversation {
    const status = jobStatusOf(row);
    const reason = blockedReason(row.interest.status, status);
    return {
      id: row.id,
      job: { id: row.job.id, title: row.job.title, status: status as PublicJobStatus },
      other: { name: otherName(row, me) },
      canSend: reason === null,
      blockedReason: reason,
    };
  }

  // ------------------------------------------------------------ abrir (criar se ainda não existe)
  router.post("/me/interests/:id/conversation", guard, noStore, async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const me = getSession(res).user.id;
      const interest = UUID.test(id)
        ? await prisma.interest.findFirst({
            where: { id, OR: [{ workerId: me }, { job: { ownerId: me } }] },
            select: {
              id: true,
              status: true,
              workerId: true,
              job: { select: { id: true, ownerId: true, status: true, expiresAt: true } },
              conversation: { select: { id: true } },
            },
          })
        : null;
      if (!interest) {
        notFound(res, "Interesse não encontrado.");
        return;
      }
      if (interest.conversation) {
        res.json({ conversation: { id: interest.conversation.id } });
        return;
      }
      const status = ownJobEffectiveStatus(interest.job.status, interest.job.expiresAt, now());
      const reason = blockedReason(interest.status, status);
      if (reason) {
        refuse(res, "not_available", reason.replace(" A conversa ficou só para consulta.", ""));
        return;
      }
      try {
        const created = await prisma.conversation.create({
          data: {
            jobId: interest.job.id,
            interestId: interest.id,
            participants: { create: [{ userId: interest.workerId }, { userId: interest.job.ownerId }] },
          },
          select: { id: true },
        });
        res.status(201).json({ conversation: { id: created.id } });
      } catch (error) {
        // Dois pedidos ao mesmo tempo: o banco garante uma só conversa por interesse; devolve a que venceu.
        if ((error as { code?: string }).code !== "P2002") throw error;
        const existing = await prisma.conversation.findUnique({ where: { interestId: interest.id }, select: { id: true } });
        if (!existing) throw error;
        res.json({ conversation: { id: existing.id } });
      }
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ minhas conversas
  router.get("/me/conversations", guard, noStore, async (_req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const rows = await prisma.conversation.findMany({
        where: { participants: { some: { userId: me } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: PAGE,
        select: {
          id: true,
          job: { select: { id: true, title: true, status: true, expiresAt: true, ownerId: true, owner: { select: { name: true } } } },
          interest: { select: { status: true, worker: { select: { name: true } } } },
          messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { content: true, createdAt: true, senderId: true } },
        },
      });
      const moment = now();
      const conversations: ConversationListItem[] = rows.map((row) => ({
        id: row.id,
        job: {
          id: row.job.id,
          title: row.job.title,
          status: ownJobEffectiveStatus(row.job.status, row.job.expiresAt, moment) as PublicJobStatus,
        },
        other: { name: row.job.ownerId === me ? row.interest.worker.name : row.job.owner.name },
        interestStatus: row.interest.status,
        lastMessage: row.messages[0]
          ? { content: row.messages[0].content, createdAt: row.messages[0].createdAt.toISOString(), fromMe: row.messages[0].senderId === me }
          : null,
      }));
      res.json({ conversations });
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ uma conversa
  router.get("/me/conversations/:id", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const row = await findMine(req.params.id as string, me);
      if (!row) {
        notFound(res);
        return;
      }
      res.json({ conversation: toConversation(row, me) });
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ ler mensagens (todas ou só as novas)
  router.get("/me/conversations/:id/messages", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const row = await findMine(req.params.id as string, me);
      if (!row) {
        notFound(res);
        return;
      }
      const after = req.query.after === undefined ? null : decodeCursor(req.query.after);
      if (req.query.after !== undefined && !after) {
        res.status(400).json({ error: "invalid_cursor", message: "Marcador inválido." });
        return;
      }
      const select = { id: true, senderId: true, content: true, createdAt: true } as const;
      const messages = after
        ? await prisma.message.findMany({
            where: {
              conversationId: row.id,
              OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }],
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: PAGE,
            select,
          })
        : (
            await prisma.message.findMany({
              where: { conversationId: row.id },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: PAGE,
              select,
            })
          ).reverse();
      const last = messages[messages.length - 1];
      const body = {
        messages: messages.map((m): ChatMessage => ({
          id: m.id,
          fromMe: m.senderId === me,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        cursor: last ? encodeCursor(last) : (req.query.after as string | undefined) ?? null,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ enviar
  router.post("/me/conversations/:id/messages", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const row = await findMine(req.params.id as string, me);
      if (!row) {
        notFound(res);
        return;
      }
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) fields[typeof issue.path[0] === "string" ? issue.path[0] : "_"] ??= issue.message;
        res.status(400).json({ error: "validation_error", message: "Confira a mensagem e tente de novo.", fields });
        return;
      }
      const reason = blockedReason(row.interest.status, jobStatusOf(row));
      if (reason) {
        refuse(res, "not_available", reason);
        return;
      }
      const message = await prisma.message.create({
        data: { conversationId: row.id, senderId: me, content: parsed.data.content },
        select: { id: true, content: true, createdAt: true },
      });
      await prisma.conversation.update({ where: { id: row.id }, data: { updatedAt: message.createdAt } });
      const body: { message: ChatMessage } = {
        message: { id: message.id, fromMe: true, content: message.content, createdAt: message.createdAt.toISOString() },
      };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
