import { createJobsApi, type PublicFetch } from "@freelah/shared";
import { API_URL } from "../../lib/api";

const TIMEOUT_MS = 8000;

// Rotas públicas: sem cookie nem credenciais. O prazo vale também para a leitura do corpo.
export const publicFetch: PublicFetch = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "omit", signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => {
        try {
          return (await response.json()) as unknown;
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
};

export const jobsApi = createJobsApi({ baseUrl: API_URL, fetch: publicFetch });
