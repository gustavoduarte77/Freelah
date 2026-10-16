import { createMyJobsApi, createSubmissionController } from "@freelah/shared";
import { API_URL, authenticatedFetch } from "../../lib/authenticatedFetch";

/** Cliente das rotas privadas /me/jobs (sempre com a sessão da pessoa). */
export const myJobsApi = createMyJobsApi({ baseUrl: API_URL, fetch: authenticatedFetch });

/**
 * Envio da nova oportunidade. É único no app (em memória): sobrevive à ida ao login ou a "Minhas
 * oportunidades" e de volta, então um resultado desconhecido não é esquecido e um envio nunca é
 * repetido sem a confirmação da pessoa.
 */
export const submission = createSubmissionController({ api: myJobsApi });
