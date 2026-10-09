import { z } from "zod";

/** Contrato da rota GET /health, usado pela API (resposta) e pelo app (leitura). */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("freelah-api"),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
