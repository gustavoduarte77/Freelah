import {
  preferencesResponseSchema,
  updatePreferencesSchema,
  type Preferences,
} from "./preferences";

export const PREFERENCES_PATH = "/me/preferences";

export type PreferencesApiErrorKind =
  | "network" // não foi possível falar com a API (sem rede, tempo esgotado, falha de conexão)
  | "unauthorized" // 401: não há sessão válida
  | "server" // 5xx
  | "rejected" // outro status de erro (4xx), inclusive pedido recusado como inválido
  | "invalid_response"; // a API respondeu, mas não no formato do contrato

/** Erro explícito da API de preferências: nunca é o mesmo que "a conta não tem preferências". */
export class PreferencesApiError extends Error {
  readonly kind: PreferencesApiErrorKind;
  readonly status?: number;

  constructor(
    kind: PreferencesApiErrorKind,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PreferencesApiError";
    this.kind = kind;
    if (options?.status !== undefined) this.status = options.status;
  }
}

/** Parte da resposta HTTP que o cliente usa (compatível com a `Response` do fetch). */
export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** `fetch` já autenticado (cookie/credenciais) fornecido pelo app. */
export type HttpFetch = (
  url: string,
  init: { method: "GET" | "PUT"; headers: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

export interface PreferencesApi {
  /** `null` somente quando a API confirmou (200) que a conta ainda não tem preferências. */
  get(): Promise<Preferences | null>;
  put(preferences: Preferences): Promise<Preferences>;
}

async function readPreferences(response: HttpResponseLike): Promise<Preferences | null> {
  if (response.status === 401) {
    throw new PreferencesApiError("unauthorized", "Sua sessão não é válida.", { status: 401 });
  }
  if (response.status >= 500) {
    throw new PreferencesApiError("server", "A API falhou ao tratar as preferências.", {
      status: response.status,
    });
  }
  if (!response.ok) {
    throw new PreferencesApiError("rejected", "A API recusou o pedido de preferências.", {
      status: response.status,
    });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new PreferencesApiError("invalid_response", "A resposta da API não pôde ser lida.", {
      cause: error,
      status: response.status,
    });
  }
  const parsed = preferencesResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PreferencesApiError("invalid_response", "A resposta da API não segue o contrato.", {
      cause: parsed.error,
      status: response.status,
    });
  }
  return parsed.data.preferences;
}

export function createPreferencesApi(options: {
  baseUrl: string;
  fetch: HttpFetch;
}): PreferencesApi {
  const url = `${options.baseUrl.replace(/\/$/, "")}${PREFERENCES_PATH}`;

  async function call(init: Parameters<HttpFetch>[1]): Promise<HttpResponseLike> {
    try {
      return await options.fetch(url, init);
    } catch (error) {
      throw new PreferencesApiError("network", "Não foi possível falar com a API.", {
        cause: error,
      });
    }
  }

  return {
    async get() {
      return readPreferences(await call({ method: "GET", headers: { Accept: "application/json" } }));
    },

    async put(preferences) {
      const valid = updatePreferencesSchema.safeParse(preferences);
      if (!valid.success) {
        throw new PreferencesApiError("rejected", "Essas preferências não seguem o formato esperado.", {
          cause: valid.error,
        });
      }
      const saved = await readPreferences(
        await call({
          method: "PUT",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(valid.data),
        }),
      );
      if (saved === null) {
        throw new PreferencesApiError(
          "invalid_response",
          "A API não devolveu as preferências salvas.",
        );
      }
      return saved;
    },
  };
}
