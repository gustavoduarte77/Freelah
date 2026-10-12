import {
  buildJobsQueryString,
  categoriesResponseSchema,
  jobDetailSchema,
  jobsResponseSchema,
  type Category,
  type JobDetail,
  type JobSummary,
  type JobsQueryParams,
  type JobsResponse,
} from "./jobs";
import type { HttpResponseLike } from "./preferences-api";
import type { RecoveryCoordinator } from "./recovery";

// Cliente das rotas públicas de categorias e oportunidades, mais os controladores de estado das
// telas. Tudo recebe o `fetch` por parâmetro, então roda e é testado sem React nem rede.

export type JobsApiErrorKind =
  | "network" // sem conexão, tempo esgotado ou falha ao conectar
  | "server" // 5xx
  | "not_found" // 404
  | "rejected" // outro 4xx
  | "invalid_response"; // a API respondeu, mas fora do contrato

const MESSAGES: Record<JobsApiErrorKind, string> = {
  network: "Não foi possível conectar ao Freelah. Verifique sua conexão e tente de novo.",
  server: "O Freelah está com um problema no momento. Tente de novo em instantes.",
  not_found: "Oportunidade não encontrada. Ela pode ter sido removida.",
  rejected: "Não foi possível carregar com esses filtros. Ajuste a busca e tente de novo.",
  invalid_response: "Recebemos uma resposta inesperada do servidor. Tente de novo.",
};

/** Erro explícito: nunca é o mesmo que "nenhuma oportunidade encontrada". */
export class JobsApiError extends Error {
  readonly kind: JobsApiErrorKind;
  readonly status?: number;

  constructor(kind: JobsApiErrorKind, options?: { cause?: unknown; status?: number }) {
    super(MESSAGES[kind], options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "JobsApiError";
    this.kind = kind;
    if (options?.status !== undefined) this.status = options.status;
  }
}

export type PublicFetch = (url: string) => Promise<HttpResponseLike>;

export interface JobsApi {
  listCategories(): Promise<Category[]>;
  listJobs(params: JobsQueryParams): Promise<JobsResponse>;
  getJob(id: string): Promise<JobDetail>;
}

export function createJobsApi(options: { baseUrl: string; fetch: PublicFetch }): JobsApi {
  const base = options.baseUrl.replace(/\/$/, "");

  async function get<T>(
    path: string,
    parse: (body: unknown) => { success: true; data: T } | { success: false; error: unknown },
  ): Promise<T> {
    let response: HttpResponseLike;
    try {
      response = await options.fetch(`${base}${path}`);
    } catch (error) {
      throw new JobsApiError("network", { cause: error });
    }
    if (response.status === 404) throw new JobsApiError("not_found", { status: 404 });
    if (response.status >= 500) throw new JobsApiError("server", { status: response.status });
    if (!response.ok) throw new JobsApiError("rejected", { status: response.status });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new JobsApiError("invalid_response", { cause: error, status: response.status });
    }
    const parsed = parse(body);
    if (!parsed.success) {
      throw new JobsApiError("invalid_response", { cause: parsed.error, status: response.status });
    }
    return parsed.data;
  }

  return {
    async listCategories() {
      const body = await get("/categories", (b) => categoriesResponseSchema.safeParse(b));
      return body.categories;
    },
    listJobs(params) {
      return get(`/jobs${buildJobsQueryString(params)}`, (b) => jobsResponseSchema.safeParse(b));
    },
    getJob(id) {
      return get(`/jobs/${encodeURIComponent(id)}`, (b) => jobDetailSchema.safeParse(b));
    },
  };
}

// ---------------------------------------------------------------------------
// Controlador de recurso único (categorias, detalhe, saúde): carregando, pronto ou erro.
// Se uma atualização falha, os dados anteriores continuam na tela, marcados como desatualizados.
// ---------------------------------------------------------------------------

/** Falhas que podem passar sozinhas; o resto (404, 4xx, resposta inválida) não adianta repetir. */
export function isRecoverableError(error: JobsApiError): boolean {
  return error.kind === "network" || error.kind === "server";
}

export type ResourceState<T> =
  | { status: "loading" }
  | {
      status: "ready";
      data: T;
      /** Quando estes dados chegaram do servidor (milissegundos). */
      loadedAt: number;
      /** Há uma atualização em andamento (os dados mostrados ainda são os anteriores). */
      refreshing: boolean;
      /** A última atualização falhou: os dados são antigos e a tela precisa dizer isso. */
      refreshError: JobsApiError | null;
    }
  | { status: "error"; error: JobsApiError };

export interface ResourceController<T> {
  getState(): ResourceState<T>;
  subscribe(listener: () => void): () => void;
  /**
   * Garante dados: a primeira chamada carrega; depois, só atualiza em segundo plano se os dados
   * já passaram de `freshMs` (ou tenta de novo se o último carregamento deu erro). Chamadas
   * repetidas enquanto carrega não geram requisições.
   */
  load(): void;
  /** Tenta de novo o que falhou (carga inicial ou atualização). Sem efeito se nada falhou. */
  retry(): void;
}

export interface ResourceOptions {
  now?: () => number;
  /** Idade máxima dos dados para `load()` não atualizar de novo (padrão 30 s). */
  freshMs?: number;
}

function asApiError(error: unknown): JobsApiError {
  return error instanceof JobsApiError ? error : new JobsApiError("network", { cause: error });
}

export function createResourceController<T>(
  load: () => Promise<T>,
  options: ResourceOptions = {},
): ResourceController<T> {
  const now = options.now ?? (() => Date.now());
  const freshMs = options.freshMs ?? 30_000;
  let state: ResourceState<T> = { status: "loading" };
  let started = false;
  let requestId = 0;
  const listeners = new Set<() => void>();

  const setState = (next: ResourceState<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  function run() {
    const id = ++requestId;
    started = true;
    const previous = state.status === "ready" ? state : null;
    setState(
      previous
        ? { ...previous, refreshing: true }
        : { status: "loading" },
    );
    load().then(
      (data) => {
        if (id === requestId) {
          setState({ status: "ready", data, loadedAt: now(), refreshing: false, refreshError: null });
        }
      },
      (error: unknown) => {
        if (id !== requestId) return;
        const apiError = asApiError(error);
        setState(
          previous
            ? { ...previous, refreshing: false, refreshError: apiError }
            : { status: "error", error: apiError },
        );
      },
    );
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      if (!started) {
        run();
      } else if (state.status === "error") {
        run(); // quem reabre a tela depois de um erro quer uma nova tentativa
      } else if (
        state.status === "ready" &&
        !state.refreshing &&
        now() - state.loadedAt > freshMs
      ) {
        run();
      }
    },
    retry() {
      if (!started) return;
      if (state.status === "error" || (state.status === "ready" && !state.refreshing && state.refreshError)) {
        run();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Controlador da lista paginada com busca e filtros
// ---------------------------------------------------------------------------

/** Filtros da lista; a paginação (`cursor`) é cuidada pelo controlador. */
export type JobsListParams = Omit<JobsQueryParams, "cursor">;

export type JobsListState =
  | { status: "loading"; params: JobsListParams }
  | { status: "error"; params: JobsListParams; error: JobsApiError }
  | {
      status: "ready";
      params: JobsListParams;
      /** Lista vazia é `ready` com `jobs: []`: nunca se confunde com erro. */
      jobs: JobSummary[];
      nextCursor: string | null;
      loadingMore: boolean;
      loadMoreError: JobsApiError | null;
      /** Quando a primeira página chegou do servidor (milissegundos). */
      loadedAt: number;
      /** Uma atualização está em andamento (a lista mostrada ainda é a anterior). */
      refreshing: boolean;
      /** A última atualização falhou: a lista é antiga e a tela precisa dizer isso. */
      refreshError: JobsApiError | null;
    };

export interface JobsListController {
  getState(): JobsListState;
  subscribe(listener: () => void): () => void;
  /**
   * Aplica filtros. Filtros iguais aos atuais não geram requisição, a não ser que os dados já
   * tenham passado de `freshMs` (aí atualiza em segundo plano, mantendo a lista na tela).
   */
  setParams(params: JobsListParams): void;
  /** Próxima página. Ignorada se não há mais, se já está carregando ou se há erro na primeira página. */
  loadMore(): void;
  /** Atualiza a primeira página mantendo a lista atual até a resposta chegar. */
  refresh(): void;
  /** Tenta de novo o que falhou (primeira página, atualização ou a próxima página). */
  retry(): void;
}

/** Vazio, só espaços e ausente significam a mesma coisa. */
const normalize = (value: string | number | undefined) =>
  typeof value === "string" ? value.trim() || undefined : value;

const sameParams = (a: JobsListParams, b: JobsListParams) =>
  (Object.keys({ ...a, ...b }) as (keyof JobsListParams)[]).every(
    (key) => normalize(a[key]) === normalize(b[key]),
  );

export function createJobsListController(deps: {
  api: Pick<JobsApi, "listJobs">;
  initialParams?: JobsListParams;
  now?: () => number;
  freshMs?: number;
}): JobsListController {
  const now = deps.now ?? (() => Date.now());
  const freshMs = deps.freshMs ?? 30_000;
  let params: JobsListParams = deps.initialParams ?? {};
  let state: JobsListState = { status: "loading", params };
  let requestId = 0;
  let started = false;
  const listeners = new Set<() => void>();

  const setState = (next: JobsListState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  /** Carrega a primeira página. Com uma lista já na tela (mesmos filtros), ela é mantida. */
  function loadFirstPage() {
    const id = ++requestId;
    started = true;
    const forParams = params;
    const previous = state.status === "ready" && sameParams(state.params, forParams) ? state : null;
    setState(
      previous
        ? { ...previous, loadingMore: false, loadMoreError: null, refreshing: true }
        : { status: "loading", params: forParams },
    );
    deps.api.listJobs(forParams).then(
      (page) => {
        if (id !== requestId) return; // resposta de uma busca que já foi substituída
        setState({
          status: "ready",
          params: forParams,
          jobs: dedupe(page.jobs),
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreError: null,
          loadedAt: now(),
          refreshing: false,
          refreshError: null,
        });
      },
      (error: unknown) => {
        if (id !== requestId) return;
        const apiError = asApiError(error);
        setState(
          previous
            ? { ...previous, loadingMore: false, loadMoreError: null, refreshing: false, refreshError: apiError }
            : { status: "error", params: forParams, error: apiError },
        );
      },
    );
  }

  function loadNextPage() {
    if (state.status !== "ready" || state.loadingMore || state.refreshing || state.nextCursor === null) return;
    const id = ++requestId;
    const current = state;
    const cursor = state.nextCursor;
    setState({ ...current, loadingMore: true, loadMoreError: null });
    deps.api.listJobs({ ...current.params, cursor }).then(
      (page) => {
        if (id !== requestId) return;
        setState({
          ...current,
          jobs: dedupe([...current.jobs, ...page.jobs]),
          nextCursor: page.nextCursor,
          loadingMore: false,
          loadMoreError: null,
        });
      },
      (error: unknown) => {
        if (id === requestId) {
          setState({ ...current, loadingMore: false, loadMoreError: asApiError(error) });
        }
      },
    );
  }

  const isStale = () => state.status === "ready" && !state.refreshing && now() - state.loadedAt > freshMs;

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setParams(next) {
      if (started && sameParams(params, next)) {
        if (state.status === "error" || isStale()) loadFirstPage();
        return;
      }
      params = next;
      loadFirstPage();
    },
    loadMore: loadNextPage,
    refresh() {
      if (started && state.status !== "loading" && !(state.status === "ready" && state.refreshing)) {
        loadFirstPage();
      }
    },
    retry() {
      if (state.status === "error") loadFirstPage();
      else if (state.status === "ready" && !state.refreshing) {
        if (state.refreshError) loadFirstPage();
        else if (state.loadMoreError) loadNextPage();
      }
    },
  };
}

function dedupe(jobs: JobSummary[]): JobSummary[] {
  const seen = new Set<string>();
  return jobs.filter((job) => (seen.has(job.id) ? false : (seen.add(job.id), true)));
}

// ---------------------------------------------------------------------------
// Ligação com o coordenador de recuperação
// ---------------------------------------------------------------------------

/** Estado de qualquer controlador visto pelo coordenador. */
export function recoverableStatus(state: ResourceState<unknown> | JobsListState): "ok" | "failed" | "pending" {
  if (state.status === "loading") return "pending";
  if (state.status === "error") return isRecoverableError(state.error) ? "failed" : "ok";
  if (state.status === "ready") {
    if (state.refreshing) return "pending";
    if ("loadingMore" in state && state.loadingMore) return "pending";
    const failures = [state.refreshError, "loadMoreError" in state ? state.loadMoreError : null];
    return failures.some((error) => error && isRecoverableError(error)) ? "failed" : "ok";
  }
  return "ok";
}

/**
 * Registra um controlador no coordenador: falhas recuperáveis disparam a recuperação e, quando a
 * API volta, o coordenador chama `retry()` uma vez. Devolve a função que desfaz a ligação.
 */
export function attachToRecovery(
  coordinator: Pick<RecoveryCoordinator, "register" | "notifyChange">,
  controller: {
    getState(): ResourceState<unknown> | JobsListState;
    subscribe(listener: () => void): () => void;
    retry(): void;
  },
): () => void {
  const unregister = coordinator.register({
    status: () => recoverableStatus(controller.getState()),
    recover: () => controller.retry(),
  });
  const unsubscribe = controller.subscribe(() => coordinator.notifyChange());
  return () => {
    unsubscribe();
    unregister();
  };
}
