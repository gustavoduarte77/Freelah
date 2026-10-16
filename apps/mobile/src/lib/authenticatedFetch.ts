import type { HttpResponseLike } from "@freelah/shared";
import { Platform } from "react-native";
import { API_URL } from "./api";
import { authClient } from "./auth-client";

const TIMEOUT_MS = 8000;

export { API_URL };

/**
 * `fetch` já autenticado para as rotas privadas da API.
 *
 * Web: o cookie de sessão é HttpOnly e vai sozinho (credentials "include").
 * Celular: o Better Auth guarda o cookie no SecureStore; ele é enviado à mão no cabeçalho Cookie, e
 * sem "omit" o fetch nativo misturaria o cookie do sistema com o nosso.
 * Há um prazo para a resposta inteira, inclusive a leitura do corpo.
 */
export async function authenticatedFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<HttpResponseLike> {
  const headers = { ...init.headers };
  let credentials: "include" | "omit" = "include";
  if (Platform.OS !== "web") {
    credentials = "omit";
    const cookie = await authClient.getCookie();
    if (cookie) headers.Cookie = cookie;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body,
      credentials,
      signal: controller.signal,
    });
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
}
