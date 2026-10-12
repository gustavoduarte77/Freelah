import { z } from "zod";
import {
  ownJobResponseSchema,
  ownJobsResponseSchema,
  type createJobSchema,
  type updateJobSchema,
  type OwnJob,
} from "./jobs-write";
import type { HttpResponseLike } from "./preferences-api";

// Cliente das rotas privadas `/me/jobs` (criar, listar, ler, editar, publicar e cancelar as próprias oportunidades).
// Recebe o `fetch` já autenticado por parâmetro, então roda e é testado sem React nem rede.

export type MyJobsApiErrorKind =
  | "network" // sem conexão, tempo esgotado ou falha ao conectar
  | "unauthorized" // 401: não há sessão válida
  | "validation" // 400 com mensagens por campo
  | "not_found" // 404
  | "invalid_state" // 409: o estado atual não permite a ação
  | "conflict" // 409: alterada em outro lugar
  | "rejected" // outro 4xx
  | "server" // 5xx
  | "invalid_response"; // a API respondeu, mas fora do contrato

const MESSAGES: Record<MyJobsApiErrorKind, string> = {
  network: "Não foi possível conectar ao Freelah. Verifique sua conexão.",
  unauthorized: "Sua sessão terminou. Entre de novo para continuar.",
  validation: "Confira os campos destacados e tente de novo.",
  not_found: "Oportunidade não encontrada.",
  invalid_state: "O estado atual da oportunidade não permite essa ação.",
  conflict: "Esta oportunidade foi alterada em outro lugar. Recarregue e tente de novo.",
  rejected: "O Freelah não aceitou o pedido. Confira os dados e tente de novo.",
  server: "O Freelah está com um problema no momento.",
  invalid_response: "Recebemos uma resposta inesperada do servidor.",
};

/** Falhas depois das quais não dá para saber se o servidor chegou a gravar. */
const UNKNOWN_OUTCOME_KINDS: readonly MyJobsApiErrorKind[] = ["network", "server", "invalid_response"];

/**
 * Erro explícito da API de oportunidades próprias.
 *
 * `outcomeUnknown` só vale para pedidos que gravam (criar, publicar): `true` quando a conexão ou a
 * resposta falhou e, por isso, o servidor PODE ter salvo. Nesse caso nada deve ser reenviado
 * automaticamente nem declarado como sucesso ou falha.
 */
export class MyJobsApiError extends Error {
  readonly kind: MyJobsApiErrorKind;
  readonly status?: number;
  /** Mensagens por campo (só em `validation`), com os nomes de campo da API. */
  readonly fields: Record<string, string>;
  readonly outcomeUnknown: boolean;

  constructor(
    kind: MyJobsApiErrorKind,
    options: {
      message?: string;
      cause?: unknown;
      status?: number;
      fields?: Record<string, string>;
      mutating?: boolean;
    } = {},
  ) {
    super(options.message ?? MESSAGES[kind], options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "MyJobsApiError";
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    this.fields = options.fields ?? {};
    this.outcomeUnknown = Boolean(options.mutating) && UNKNOWN_OUTCOME_KINDS.includes(kind);
  }
}

export type MyJobsMethod = "GET" | "POST" | "PATCH";

/** `fetch` já autenticado (cookie/credenciais) fornecido pelo app. */
export type MyJobsFetch = (
  url: string,
  init: { method: MyJobsMethod; headers: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

/** Corpo aceito por `POST /me/jobs` (antes da normalização feita pela API). */
export type CreateJobRequest = z.input<typeof createJobSchema>;

/** Campos que mudam em `PATCH /me/jobs/:id` (só os enviados são alterados). */
export type UpdateJobRequest = z.input<typeof updateJobSchema>;

export interface MyJobsApi {
  /** Cria como rascunho, ou já publicada com `publish: true`. */
  create(request: CreateJobRequest, options?: { publish?: boolean }): Promise<OwnJob>;
  list(): Promise<OwnJob[]>;
  get(id: string): Promise<OwnJob>;
  /** Publica um rascunho. */
  publish(id: string): Promise<OwnJob>;
  /**
   * Edita só os campos de `changes`. `expectedUpdatedAt` é a versão que a pessoa estava vendo: se a
   * oportunidade mudou desde então, a API recusa (conflict) em vez de misturar as edições.
   */
  update(id: string, changes: UpdateJobRequest, expectedUpdatedAt: string): Promise<OwnJob>;
  /** Cancela a própria oportunidade (rascunho, publicada ou em negociação). */
  cancel(id: string): Promise<OwnJob>;
}

const errorBodySchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
});

async function readJson(response: HttpResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function toError(response: HttpResponseLike, mutating: boolean): Promise<MyJobsApiError> {
  const status = response.status;
  if (status === 401) return new MyJobsApiError("unauthorized", { status, mutating });
  if (status >= 500) return new MyJobsApiError("server", { status, mutating });
  const parsed = errorBodySchema.safeParse(await readJson(response));
  const body = parsed.success ? parsed.data : {};
  const options = { status, mutating, ...(body.message ? { message: body.message } : {}) };
  if (status === 404) return new MyJobsApiError("not_found", options);
  if (status === 400 && body.error === "validation_error" && body.fields) {
    return new MyJobsApiError("validation", { ...options, fields: body.fields });
  }
  if (status === 409) {
    return new MyJobsApiError(body.error === "conflict" ? "conflict" : "invalid_state", options);
  }
  return new MyJobsApiError("rejected", options);
}

export function createMyJobsApi(options: { baseUrl: string; fetch: MyJobsFetch }): MyJobsApi {
  const base = `${options.baseUrl.replace(/\/$/, "")}/me/jobs`;

  async function call<T>(
    method: MyJobsMethod,
    path: string,
    body: unknown,
    parse: (json: unknown) => { success: true; data: T } | { success: false; error: unknown },
  ): Promise<T> {
    const mutating = method !== "GET";
    let response: HttpResponseLike;
    try {
      response = await options.fetch(`${base}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new MyJobsApiError("network", { cause: error, mutating });
    }
    if (!response.ok) throw await toError(response, mutating);
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new MyJobsApiError("invalid_response", { cause: error, status: response.status, mutating });
    }
    const parsed = parse(json);
    if (!parsed.success) {
      throw new MyJobsApiError("invalid_response", { cause: parsed.error, status: response.status, mutating });
    }
    return parsed.data;
  }

  const one = (json: unknown) => {
    const parsed = ownJobResponseSchema.safeParse(json);
    return parsed.success ? { success: true as const, data: parsed.data.job } : parsed;
  };

  return {
    create(request, createOptions) {
      const body = createOptions?.publish ? { ...request, publish: true } : request;
      return call("POST", "", body, one);
    },
    async list() {
      const result = await call("GET", "", undefined, (json) => ownJobsResponseSchema.safeParse(json));
      return result.jobs;
    },
    get(id) {
      return call("GET", `/${encodeURIComponent(id)}`, undefined, one);
    },
    publish(id) {
      return call("POST", `/${encodeURIComponent(id)}/publish`, {}, one);
    },
    update(id, changes, expectedUpdatedAt) {
      return call("PATCH", `/${encodeURIComponent(id)}`, { ...changes, expectedUpdatedAt }, one);
    },
    cancel(id) {
      return call("POST", `/${encodeURIComponent(id)}/cancel`, {}, one);
    },
  };
}
