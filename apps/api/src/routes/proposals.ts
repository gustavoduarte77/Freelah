import {
  PROPOSAL_NOT_PENDING_MESSAGE,
  createProposalSchema,
  jobFieldErrors,
  negotiationClosedReason,
  ownJobEffectiveStatus,
  proposalActions,
  proposalEligibility,
  type NegotiationContext,
  type OwnJobStatus,
  type Proposal,
  type ProposalResponse,
  type ProposalsResponse,
} from "@freelah/shared";
import { Router, type RequestHandler, type Response } from "express";
import type { Auth } from "../auth";
import type { PrismaClient } from "../db";
import type { ProposalStatus } from "../generated/prisma/client";
import { getSession, requireAuth } from "../middleware/require-auth";
import { blockedReason } from "./chat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = { accept: "ACCEPTED", decline: "DECLINED", withdraw: "WITHDRAWN" } as const;
type Action = keyof typeof ACTIONS;

const notFound = (res: Response, message = "Proposta não encontrada.") =>
  res.status(404).json({ error: "not_found", message });
const forbidden = (res: Response, message: string) => res.status(403).json({ error: "forbidden", message });
const conflict = (res: Response, error: string, message: string) => res.status(409).json({ error, message });

/** Resultado de uma operação dentro da transação, traduzido para HTTP fora dela. */
type Outcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "not_found" }
  | { kind: "forbidden"; message: string }
  | { kind: "conflict"; error: string; message: string }
  | { kind: "invalid"; fields: Record<string, string> };

/**
 * Propostas de valor no chat (PRD 18.5).
 *
 * - A proposta pertence à conversa (que já é uma por interesse), então cada conversa é uma negociação
 *   independente, mesmo sobre a mesma oportunidade.
 * - Só quem participa da conversa lê ou envia (404 para quem não participa). Autora e destinatária vêm da
 *   sessão e da conversa, nunca do corpo do pedido.
 * - Só a destinatária aceita ou recusa; só a autora retira; só enquanto pendente e a negociação aberta.
 * - Criar e decidir travam a linha da oportunidade (FOR UPDATE), como a contratação: nunca nasce nem é
 *   decidida uma proposta depois que a contratação, o cancelamento ou a expiração valem.
 * - Uma pendente e uma aceita por conversa são garantidas por índices únicos parciais do banco.
 * - Nada aqui escreve em `Job`: a proposta (e a aceitação) não altera o valor publicado nem contrata.
 */
export function createProposalsRouter(
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

  const conversationSelect = {
    id: true,
    job: { select: { id: true, status: true, expiresAt: true, negotiable: true } },
    interest: { select: { status: true } },
    participants: { select: { userId: true } },
  } as const;

  type DbClient = Pick<PrismaClient, "conversation" | "proposal" | "$queryRaw">;

  /** A conversa, só se a pessoa participa dela. */
  async function findConversation(db: DbClient, id: string, me: string) {
    if (!UUID.test(id)) return null;
    return db.conversation.findFirst({ where: { id, participants: { some: { userId: me } } }, select: conversationSelect });
  }
  type Conv = NonNullable<Awaited<ReturnType<typeof findConversation>>>;

  function contextOf(conversation: Conv): NegotiationContext {
    const jobStatus: OwnJobStatus = ownJobEffectiveStatus(conversation.job.status, conversation.job.expiresAt, now());
    return {
      jobStatus,
      interestStatus: conversation.interest.status,
      negotiable: conversation.job.negotiable,
      conversationBlockedReason: blockedReason(conversation.interest.status, jobStatus),
    };
  }

  /** Trava a oportunidade (a mesma ordem de travas da contratação) e relê a situação dentro da transação. */
  async function lockJobOf(tx: DbClient, conversation: Conv) {
    await tx.$queryRaw`SELECT "id" FROM "Job" WHERE "id" = ${conversation.job.id} FOR UPDATE`;
  }

  const proposalSelect = {
    id: true,
    conversationId: true,
    authorId: true,
    recipientId: true,
    amountCents: true,
    status: true,
    createdAt: true,
    decidedAt: true,
    author: { select: { name: true } },
  } as const;
  type Row = {
    id: string;
    conversationId: string;
    authorId: string;
    recipientId: string;
    amountCents: number;
    status: ProposalStatus;
    createdAt: Date;
    decidedAt: Date | null;
    author: { name: string };
  };

  function toProposal(row: Row, me: string, context: NegotiationContext): Proposal {
    const closedReason = row.status === "PENDING" ? negotiationClosedReason(context) : null;
    const fromMe = row.authorId === me;
    return {
      id: row.id,
      conversationId: row.conversationId,
      amountCents: row.amountCents,
      status: row.status,
      fromMe,
      authorName: row.author.name,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      ...proposalActions(row.status, fromMe, closedReason),
      closedReason,
    };
  }

  // ------------------------------------------------------------ ler o histórico
  router.get("/me/conversations/:id/proposals", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const conversation = await findConversation(prisma, req.params.id as string, me);
      if (!conversation) {
        notFound(res, "Conversa não encontrada.");
        return;
      }
      const rows = await prisma.proposal.findMany({
        where: { conversationId: conversation.id },
        select: proposalSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const context = contextOf(conversation);
      const { canPropose, reason } = proposalEligibility(context, rows);
      const body: ProposalsResponse = {
        proposals: rows.map((row) => toProposal(row, me, context)),
        canPropose,
        proposeBlockedReason: reason,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------ propor
  router.post("/me/conversations/:id/proposals", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const conversationId = req.params.id as string;
      // Quem não participa recebe 404 antes de qualquer outra coisa (nem a validação do corpo revela a conversa).
      if (!(await findConversation(prisma, conversationId, me))) {
        notFound(res, "Conversa não encontrada.");
        return;
      }
      const parsed = createProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "validation_error", message: "Confira o valor da proposta e tente de novo.", fields: jobFieldErrors(parsed.error) });
        return;
      }

      const outcome = await prisma
        .$transaction(async (tx): Promise<Outcome<Proposal>> => {
          const conversation = await findConversation(tx, conversationId, me);
          if (!conversation) return { kind: "not_found" };
          await lockJobOf(tx, conversation);
          // Relê tudo já com a oportunidade travada: contratar/cancelar não passam entre a conferência e a criação.
          const fresh = await findConversation(tx, conversationId, me);
          if (!fresh) return { kind: "not_found" };
          const existing = await tx.proposal.findMany({ where: { conversationId }, select: { status: true } });
          const context = contextOf(fresh);
          const { canPropose, reason } = proposalEligibility(context, existing);
          if (!canPropose) return { kind: "conflict", error: "proposal_not_allowed", message: reason ?? "Não é possível enviar uma proposta agora." };
          const recipientId = fresh.participants.map((participant) => participant.userId).find((userId) => userId !== me);
          if (!recipientId) return { kind: "not_found" };
          const created = await tx.proposal.create({
            data: { conversationId, authorId: me, recipientId, amountCents: parsed.data.amountCents },
            select: proposalSelect,
          });
          return { kind: "ok", value: toProposal(created, me, context) };
        })
        .catch((error: unknown) => {
          // Duas criações simultâneas: o índice parcial do banco deixa passar só uma.
          if ((error as { code?: string }).code === "P2002") {
            return { kind: "conflict", error: "proposal_not_allowed", message: "Já existe uma proposta aguardando resposta nesta conversa." } as Outcome<Proposal>;
          }
          throw error;
        });

      if (outcome.kind === "ok") {
        const body: ProposalResponse = { proposal: outcome.value };
        res.status(201).json(body);
        return;
      }
      send(res, outcome);
    } catch (error) {
      next(error);
    }
  });

  function send<T>(res: Response, outcome: Exclude<Outcome<T>, { kind: "ok" }>) {
    if (outcome.kind === "not_found") notFound(res);
    else if (outcome.kind === "forbidden") forbidden(res, outcome.message);
    else if (outcome.kind === "conflict") conflict(res, outcome.error, outcome.message);
    else res.status(400).json({ error: "validation_error", fields: outcome.fields });
  }

  // ------------------------------------------------------------ aceitar, recusar e retirar
  router.post("/me/proposals/:id/:action", guard, noStore, async (req, res, next) => {
    try {
      const me = getSession(res).user.id;
      const id = req.params.id as string;
      const action = req.params.action as string;
      if (!(action in ACTIONS)) {
        notFound(res, "Rota não encontrada.");
        return;
      }
      const next_ = ACTIONS[action as Action];

      // A proposta só é visível para quem participa da conversa dela.
      const visible = UUID.test(id)
        ? await prisma.proposal.findFirst({
            where: { id, conversation: { participants: { some: { userId: me } } } },
            select: { id: true, conversationId: true },
          })
        : null;
      if (!visible) {
        notFound(res);
        return;
      }

      const outcome = await prisma.$transaction(async (tx): Promise<Outcome<Proposal>> => {
        const conversation = await findConversation(tx, visible.conversationId, me);
        if (!conversation) return { kind: "not_found" };
        await lockJobOf(tx, conversation);
        const fresh = await findConversation(tx, visible.conversationId, me);
        const row = fresh ? await tx.proposal.findUnique({ where: { id }, select: proposalSelect }) : null;
        if (!fresh || !row) return { kind: "not_found" };

        const iAmAuthor = row.authorId === me;
        if (next_ === "WITHDRAWN" && !iAmAuthor) return { kind: "forbidden", message: "Só quem enviou a proposta pode retirá-la." };
        if (next_ !== "WITHDRAWN" && (iAmAuthor || row.recipientId !== me)) {
          return { kind: "forbidden", message: "Só a outra pessoa da conversa pode responder à proposta." };
        }
        if (row.status !== "PENDING") return { kind: "conflict", error: "proposal_not_pending", message: PROPOSAL_NOT_PENDING_MESSAGE };
        const context = contextOf(fresh);
        const closed = negotiationClosedReason(context);
        if (closed) return { kind: "conflict", error: "negotiation_closed", message: closed };

        // Atualização condicional: se outra ação decidiu no meio do caminho, nenhuma linha muda.
        const decided = await tx.proposal.updateMany({
          where: { id, status: "PENDING", ...(next_ === "WITHDRAWN" ? { authorId: me } : { recipientId: me }) },
          data: { status: next_, decidedAt: now() },
        });
        if (decided.count !== 1) return { kind: "conflict", error: "proposal_not_pending", message: PROPOSAL_NOT_PENDING_MESSAGE };
        const updated = await tx.proposal.findUniqueOrThrow({ where: { id }, select: proposalSelect });
        return { kind: "ok", value: toProposal(updated, me, context) };
      });

      if (outcome.kind === "ok") {
        const body: ProposalResponse = { proposal: outcome.value };
        res.json(body);
        return;
      }
      send(res, outcome);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
