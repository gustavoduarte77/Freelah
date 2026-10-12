import { z } from "zod";
import { publicJobStatusSchema } from "./jobs";

// Contrato do interesse em oportunidades (PRD 17): o trabalhador demonstra, retira e acompanha; o
// contratante vê quem demonstrou. Telefone e e-mail nunca saem nestas respostas.

export const interestStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"]);
export type InterestStatus = z.infer<typeof interestStatusSchema>;

export const INTEREST_STATUS_LABEL: Record<InterestStatus, string> = {
  PENDING: "Interesse registrado",
  ACCEPTED: "Você foi selecionado",
  REJECTED: "Não selecionado",
  WITHDRAWN: "Interesse retirado",
};

/** Como a pessoa se relaciona com uma oportunidade: dona dela, ou com (ou sem) interesse. */
export const jobViewerResponseSchema = z.object({
  isOwner: z.boolean(),
  interest: z.object({ id: z.string(), status: interestStatusSchema }).nullable(),
});
export type JobViewerResponse = z.infer<typeof jobViewerResponseSchema>;

export const interestResponseSchema = z.object({
  interest: z.object({ id: z.string(), status: interestStatusSchema }),
});
export type InterestResponse = z.infer<typeof interestResponseSchema>;

/** "Meus interesses": o interesse e um resumo da oportunidade (com o estado atual dela). */
export const myInterestSchema = z.object({
  id: z.string(),
  status: interestStatusSchema,
  createdAt: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    city: z.string(),
    state: z.string(),
    scheduledDate: z.string(),
    startTime: z.string(),
    proposedPriceCents: z.number().int().nonnegative(),
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
  createdAt: z.string(),
  worker: z.object({ name: z.string(), city: z.string() }),
});
export type JobInterest = z.infer<typeof jobInterestSchema>;
export const jobInterestsResponseSchema = z.object({ interests: z.array(jobInterestSchema) });

/** Códigos de recusa (campo `error` da API) que a interface trata de forma própria. */
export const INTEREST_ERROR_CODES = ["already_interested", "not_accepting", "own_job", "not_withdrawable"] as const;
