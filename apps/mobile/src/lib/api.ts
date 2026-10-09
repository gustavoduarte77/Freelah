import { healthResponseSchema, type HealthResponse } from "@freelah/shared";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333"
).replace(/\/$/, "");

/** Consulta GET /health e valida a resposta com o contrato compartilhado. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`, { signal });
  if (!res.ok) {
    throw new Error(`A API respondeu com o status ${res.status}.`);
  }
  return healthResponseSchema.parse(await res.json());
}
