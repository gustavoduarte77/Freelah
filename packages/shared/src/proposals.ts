import { z } from "zod";
import { JOB_PRICE_MAX_CENTS } from "./jobs-write";

// ---------------------------------------------------------------------------
// Proposta de valor no chat (PRD 18.5). Cada conversa é uma negociação independente: a proposta
// pertence à conversa, nunca altera o valor publicado da oportunidade e a aceitação não contrata.
// As regras daqui são as mesmas da API e da demonstração offline.
// ---------------------------------------------------------------------------

export const PROPOSAL_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const;
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  PENDING: "Aguardando resposta",
  ACCEPTED: "Aceita",
  DECLINED: "Recusada",
  WITHDRAWN: "Retirada",
};

/** Corpo de POST /me/conversations/:id/proposals. Só o valor: nada de observações nesta versão. */
export const createProposalSchema = z.strictObject({
  amountCents: z
    .number({ error: "Informe o valor da proposta." })
    .int("O valor precisa ser em centavos inteiros.")
    .min(1, "O valor precisa ser maior que zero.")
    .max(JOB_PRICE_MAX_CENTS, "O valor é maior que o permitido."),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

/** Proposta como a pessoa que consulta a vê (o servidor já diz o que ela pode fazer agora). */
export const proposalSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  amountCents: z.number().int().positive(),
  status: proposalStatusSchema,
  /** A pessoa que consulta é a autora. */
  fromMe: z.boolean(),
  authorName: z.string(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  canAccept: z.boolean(),
  canDecline: z.boolean(),
  canWithdraw: z.boolean(),
  /** Pendente que não pode mais ser decidida porque a negociação fechou (cancelada, contratada...). */
  closedReason: z.string().nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposalResponseSchema = z.object({ proposal: proposalSchema });
export type ProposalResponse = z.infer<typeof proposalResponseSchema>;

export const proposalsResponseSchema = z.object({
  proposals: z.array(proposalSchema),
  /** Dá para enviar uma nova proposta agora. */
  canPropose: z.boolean(),
  /** Por que não dá (ou `null` quando dá). */
  proposeBlockedReason: z.string().nullable(),
});
export type ProposalsResponse = z.infer<typeof proposalsResponseSchema>;

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export const NOT_NEGOTIABLE_MESSAGE = "Esta oportunidade tem valor fixo e não aceita propostas de valor.";
export const PENDING_EXISTS_MESSAGE = "Já existe uma proposta aguardando resposta nesta conversa.";
export const AGREEMENT_FINAL_MESSAGE = "O valor desta conversa já foi combinado. O acordo é final nesta versão.";
export const NEGOTIATION_HIRED_MESSAGE = "A oportunidade já foi contratada. Não há mais propostas de valor nesta conversa.";
export const NEGOTIATION_COMPLETED_MESSAGE = "A oportunidade já foi concluída. Não há mais propostas de valor nesta conversa.";
export const PROPOSAL_NOT_PENDING_MESSAGE = "Esta proposta já foi respondida e não pode mais ser alterada.";

/** O que a negociação precisa saber da conversa e da oportunidade. */
export interface NegotiationContext {
  /** Estado atual da oportunidade (já com a expiração aplicada). */
  jobStatus: string;
  /** Estado do interesse que originou a conversa. */
  interestStatus: string;
  /** A oportunidade aceita propostas de valor (marcada como negociável, inclusive "A negociar"). */
  negotiable: boolean;
  /**
   * Motivo de a conversa estar fechada para envio (cancelada, expirada, interesse retirado ou outra
   * pessoa selecionada); `null` se está aberta.
   */
  conversationBlockedReason: string | null;
}

/**
 * Por que a negociação está fechada (ninguém mais decide nem propõe), ou `null` se está aberta.
 * Contratada e concluída fecham a negociação; a contratação em si continua separada.
 */
export function negotiationClosedReason(context: NegotiationContext): string | null {
  if (context.conversationBlockedReason) return context.conversationBlockedReason;
  if (context.jobStatus === "COMPLETED") return NEGOTIATION_COMPLETED_MESSAGE;
  if (context.jobStatus === "HIRED" || context.interestStatus === "ACCEPTED") return NEGOTIATION_HIRED_MESSAGE;
  return null;
}

/** Dá para enviar uma nova proposta nesta conversa agora? (As regras 1, 5 e 7 do PRD 18.5.) */
export function proposalEligibility(
  context: NegotiationContext,
  existing: ReadonlyArray<{ status: ProposalStatus }>,
): { canPropose: boolean; reason: string | null } {
  const closed = negotiationClosedReason(context);
  if (closed) return { canPropose: false, reason: closed };
  if (!context.negotiable) return { canPropose: false, reason: NOT_NEGOTIABLE_MESSAGE };
  if (existing.some((proposal) => proposal.status === "ACCEPTED")) return { canPropose: false, reason: AGREEMENT_FINAL_MESSAGE };
  if (existing.some((proposal) => proposal.status === "PENDING")) return { canPropose: false, reason: PENDING_EXISTS_MESSAGE };
  return { canPropose: true, reason: null };
}

/** O que a pessoa pode fazer com uma proposta: só a outra aceita ou recusa, só a autora retira, só pendente e aberta. */
export function proposalActions(
  status: ProposalStatus,
  viewerIsAuthor: boolean,
  closedReason: string | null,
): { canAccept: boolean; canDecline: boolean; canWithdraw: boolean } {
  const open = status === "PENDING" && closedReason === null;
  return { canAccept: open && !viewerIsAuthor, canDecline: open && !viewerIsAuthor, canWithdraw: open && viewerIsAuthor };
}
