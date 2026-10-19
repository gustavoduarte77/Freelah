import { z } from "zod";
import { publicJobStatusSchema } from "./jobs";

// Contrato do interesse em oportunidades (PRD 17): o trabalhador demonstra, retira e acompanha; o
// contratante vê quem demonstrou. Telefone e e-mail nunca saem nestas respostas.

export const interestStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"]);
export type InterestStatus = z.infer<typeof interestStatusSchema>;

/**
 * Convite formal de contratação: o contratante convida, o trabalhador aceita ou recusa.
 * NONE = sem convite; PENDING = aguardando resposta; DECLINED = recusado; ACCEPTED = aceito (contratado).
 */
export const inviteStateSchema = z.enum(["NONE", "PENDING", "DECLINED", "ACCEPTED"]);
export type InviteState = z.infer<typeof inviteStateSchema>;

export const INTEREST_STATUS_LABEL: Record<InterestStatus, string> = {
  PENDING: "Interesse registrado",
  ACCEPTED: "Você foi contratado",
  REJECTED: "Não selecionado",
  WITHDRAWN: "Interesse retirado",
};

/** Texto da situação do interesse na ótica do trabalhador, considerando o convite. */
export function workerInterestLabel(status: InterestStatus, invite: InviteState): string {
  if (status === "PENDING" && invite === "PENDING") return "Você recebeu um convite de contratação";
  if (status === "PENDING" && invite === "DECLINED") return "Você recusou o convite";
  return INTEREST_STATUS_LABEL[status];
}

/** Como a pessoa se relaciona com uma oportunidade: dona dela, ou com (ou sem) interesse. */
export const jobViewerResponseSchema = z.object({
  isOwner: z.boolean(),
  interest: z.object({ id: z.string(), status: interestStatusSchema, invite: inviteStateSchema.default("NONE") }).nullable(),
});
export type JobViewerResponse = z.infer<typeof jobViewerResponseSchema>;

export const interestResponseSchema = z.object({
  interest: z.object({ id: z.string(), status: interestStatusSchema, invite: inviteStateSchema.default("NONE") }),
});
export type InterestResponse = z.infer<typeof interestResponseSchema>;

/** "Meus interesses": o interesse e um resumo da oportunidade (com o estado atual dela). */
export const myInterestSchema = z.object({
  id: z.string(),
  status: interestStatusSchema,
  invite: inviteStateSchema.default("NONE"),
  createdAt: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    city: z.string(),
    state: z.string(),
    scheduledDate: z.string(),
    startTime: z.string(),
    proposedPriceCents: z.number().int().nonnegative().nullable(),
    negotiable: z.boolean(),
    status: publicJobStatusSchema,
    ownerName: z.string(),
  }),
});
export type MyInterest = z.infer<typeof myInterestSchema>;
export const myInterestsResponseSchema = z.object({ interests: z.array(myInterestSchema) });

/** Lista do contratante: só nome e cidade de quem demonstrou interesse. */
export const jobInterestSchema = z.object({
  id: z.string(),
  status: interestStatusSchema,
  invite: inviteStateSchema.default("NONE"),
  createdAt: z.string(),
  worker: z.object({ name: z.string(), city: z.string() }),
});
export type JobInterest = z.infer<typeof jobInterestSchema>;
export const jobInterestsResponseSchema = z.object({ interests: z.array(jobInterestSchema) });

/** Códigos de recusa (campo `error` da API) que a interface trata de forma própria. */
export const INTEREST_ERROR_CODES = [
  "already_interested",
  "not_accepting",
  "own_job",
  "not_withdrawable",
  "not_invitable",
  "no_pending_invite",
  "not_selectable",
] as const;
