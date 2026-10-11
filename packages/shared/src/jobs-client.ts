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
// Controlador de recurso único (categorias, detalhe): carregando, pronto ou erro
// ---------------------------------------------------------------------------

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: JobsApiError };

export interface ResourceController<T> {
  getState(): ResourceState<T>;
  subscribe(listener: () => void): () => void;
  /** Carrega uma vez; chamadas repetidas enquanto carrega ou depois de pronto não refazem. */
  load(): void;
  /** Tenta de novo depois de um erro (ou recarrega os dados). */
  retry(): void;
}

function asApiError(error: unknown): JobsApiError {
  return error instanceof JobsApiError ? error : new JobsApiError("network", { cause: error });
}

export function createResourceController<T>(load: () => Promise<T>): ResourceController<T> {
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
    setState({ status: "loading" });
    load().then(
      (data) => {
        if (id === requestId) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (id === requestId) setState({ status: "error", error: asApiError(error) });
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
      if (!started) run();
    },
    retry() {
      if (started && state.status !== "loading") run();
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
    };

export interface JobsListController {
  getState(): JobsListState;
  subscribe(listener: () => void): () => void;
  /** Aplica novos filtros. Parâmetros iguais aos atuais não geram nova requisição. */
  setParams(params: JobsListParams): void;
  /** Próxima página. Ignorada se não há mais, se já está carregando ou se há erro na primeira página. */
  loadMore(): void;
  /** Recarrega a primeira página com os mesmos filtros. */
  refresh(): void;
  /** Tenta de novo o que falhou (primeira página ou a próxima). */
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
}): JobsListController {
  let params: JobsListParams = deps.initialParams ?? {};
  let state: JobsListState = { status: "loading", params };
  let requestId = 0;
  let started = false;
  const listeners = new Set<() => void>();

  const setState = (next: JobsListState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  function loadFirstPage() {
    const id = ++requestId;
    started = true;
    const forParams = params;
    setState({ status: "loading", params: forParams });
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
        });
      },
      (error: unknown) => {
        if (id === requestId) setState({ status: "error", params: forParams, error: asApiError(error) });
      },
    );
  }

  function loadNextPage() {
    if (state.status !== "ready" || state.loadingMore || state.nextCursor === null) return;
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

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setParams(next) {
      if (started && sameParams(params, next)) return;
      params = next;
      loadFirstPage();
    },
    loadMore: loadNextPage,
    refresh() {
      if (started) loadFirstPage();
    },
    retry() {
      if (state.status === "error") loadFirstPage();
      else if (state.status === "ready" && state.loadMoreError) loadNextPage();
    },
  };
}

function dedupe(jobs: JobSummary[]): JobSummary[] {
  const seen = new Set<string>();
  return jobs.filter((job) => (seen.has(job.id) ? false : (seen.add(job.id), true)));
}
