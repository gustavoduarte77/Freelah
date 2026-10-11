import { createPreferencesApi, type HttpFetch } from "@freelah/shared";
import { Platform } from "react-native";
import { API_URL } from "../../lib/api";
import { authClient } from "../../lib/auth-client";

const TIMEOUT_MS = 8000;

// Web: o cookie de sessão é HttpOnly e vai sozinho (credentials "include").
// Celular: o Better Auth guarda o cookie no SecureStore; ele é enviado à mão no cabeçalho
// Cookie, e sem "omit" o fetch nativo misturaria o cookie do sistema com o nosso.
const authenticatedFetch: HttpFetch = async (url, init) => {
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
    // O prazo também vale para a leitura do corpo.
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

export const preferencesApi = createPreferencesApi({ baseUrl: API_URL, fetch: authenticatedFetch });
