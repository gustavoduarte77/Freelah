import { describe, expect, it, vi } from "vitest";
import {
  JobsApiError,
  createJobsApi,
  createJobsListController,
  createResourceController,
  type JobsApi,
  type PublicFetch,
} from "./jobs-client";
import type { JobDetail, JobSummary, JobsResponse } from "./jobs";

const job = (id: string, overrides: Partial<JobSummary> = {}): JobSummary => ({
  id,
  title: `Oportunidade ${id}`,
  excerpt: "Descrição",
  category: { slug: "construcao-civil", name: "Construção Civil" },
  city: "Cataguases",
  state: "MG",
  scheduledDate: "2026-12-12",
  startTime: "08:00",
  proposedPriceCents: 20000,
  negotiable: true,
  status: "PUBLISHED",
  isDemo: true,
  publishedAt: "2026-10-01T10:00:00.000Z",
  ...overrides,
});
const page = (ids: string[], nextCursor: string | null = null): JobsResponse => ({
  jobs: ids.map((id) => job(id)),
  nextCursor,
});

const respond = (status: number, body?: unknown, jsonFails = false) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (jsonFails) throw new SyntaxError("x");
    return body;
  },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function kind(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(JobsApiError);
    return (error as JobsApiError).kind;
  }
  throw new Error("esperava um erro");
}

describe("createJobsApi", () => {
  function apiWith(impl: PublicFetch) {
    const fetchFn = vi.fn(impl);
    return { api: createJobsApi({ baseUrl: "http://api.test/", fetch: fetchFn }), fetchFn };
  }

  it("monta as URLs, valida e devolve os dados", async () => {
    const { api, fetchFn } = apiWith(async (url) =>
      url.endsWith("/categories")
        ? respond(200, { categories: [{ id: "1", slug: "a", name: "A" }] })
        : respond(200, page(["1"], "abc")),
    );
    expect(await api.listCategories()).toEqual([{ id: "1", slug: "a", name: "A" }]);
    const result = await api.listJobs({ q: "pintar sala", category: "construcao-civil", maxPriceCents: 5000 });
    expect(result.nextCursor).toBe("abc");
    expect(fetchFn).toHaveBeenNthCalledWith(1, "http://api.test/categories");
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "http://api.test/jobs?q=pintar%20sala&category=construcao-civil&maxPriceCents=5000",
    );
  });

  it("detalhe codifica o id", async () => {
    const detail: JobDetail = {
      ...job("x"),
      description: "d",
      additionalInfo: null,
      expiresAt: "2026-11-01T00:00:00.000Z",
      owner: { name: "Ana", city: "C", isDemo: true },
      acceptingInterests: true,
      statusMessage: null,
    };
    const { api, fetchFn } = apiWith(async () => respond(200, detail));
    expect((await api.getJob("a/b")).id).toBe("x");
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/jobs/a%2Fb");
  });

  it.each([
    ["rede", async () => Promise.reject(new TypeError("Failed to fetch")), "network"],
    ["404", async () => respond(404, {}), "not_found"],
    ["500", async () => respond(500, {}), "server"],
    ["503", async () => respond(503, {}), "server"],
    ["400", async () => respond(400, {}), "rejected"],
    ["JSON ilegível", async () => respond(200, undefined, true), "invalid_response"],
    ["fora do contrato", async () => respond(200, { jobs: "x" }), "invalid_response"],
    ["rascunho no meio da lista", async () => respond(200, { jobs: [{ ...job("1"), status: "DRAFT" }], nextCursor: null }), "invalid_response"],
  ] as [string, PublicFetch, string][])("%s vira erro explícito %s, nunca lista vazia", async (_n, impl, expected) => {
    const { api } = apiWith(impl);
    expect(await kind(api.listJobs({}))).toBe(expected);
  });

  it("as mensagens são em português e diferentes por tipo", async () => {
    const messages = new Set<string>();
    for (const k of ["network", "server", "not_found", "rejected", "invalid_response"] as const) {
      const message = new JobsApiError(k).message;
      expect(message).toMatch(/\S/);
      messages.add(message);
    }
    expect(messages.size).toBe(5);
  });
});

describe("createResourceController", () => {
  it("carrega uma vez, vira pronto e não refaz com load repetido", async () => {
    const load = vi.fn(async () => [1, 2]);
    const c = createResourceController(load);
    expect(c.getState()).toEqual({ status: "loading" });
    c.load();
    c.load();
    await settle();
    c.load();
    expect(load).toHaveBeenCalledTimes(1);
    expect(c.getState()).toEqual({ status: "ready", data: [1, 2] });
  });

  it("erro é erro, e retry tenta de novo", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new JobsApiError("network");
      return "ok";
    });
    const c = createResourceController(load);
    c.load();
    await settle();
    expect(c.getState()).toMatchObject({ status: "error", error: { kind: "network" } });
    fail = false;
    c.retry();
    expect(c.getState().status).toBe("loading");
    await settle();
    expect(c.getState()).toEqual({ status: "ready", data: "ok" });
  });

  it("erro que não é JobsApiError vira network", async () => {
    const c = createResourceController(async () => {
      throw new Error("boom");
    });
    c.load();
    await settle();
    expect(c.getState()).toMatchObject({ status: "error", error: { kind: "network" } });
  });

  it("retry enquanto carrega não duplica; resposta antiga não vence a nova", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const c = createResourceController<string>(load);
    c.load();
    c.retry(); // ainda carregando: ignorado
    expect(load).toHaveBeenCalledTimes(1);
    first.reject(new JobsApiError("server"));
    await settle();
    c.retry();
    second.resolve("novo");
    await settle();
    expect(c.getState()).toEqual({ status: "ready", data: "novo" });
  });

  it("notifica quem assinou e para quando cancela", async () => {
    const c = createResourceController(async () => 1);
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.load();
    await settle();
    expect(listener).toHaveBeenCalled();
    off();
    const count = listener.mock.calls.length;
    c.retry();
    await settle();
    expect(listener).toHaveBeenCalledTimes(count);
  });
});

describe("createJobsListController", () => {
  function setup(listJobs: JobsApi["listJobs"]) {
    const fn = vi.fn(listJobs);
    const controller = createJobsListController({ api: { listJobs: fn } });
    return { fn, controller };
  }

  it("carrega a primeira página e vira pronto", async () => {
    const { controller, fn } = setup(async () => page(["1", "2"], "c1"));
    expect(controller.getState().status).toBe("loading");
    controller.setParams({ q: "pintar" });
    expect(controller.getState()).toMatchObject({ status: "loading", params: { q: "pintar" } });
    await settle();
    expect(controller.getState()).toMatchObject({ status: "ready", nextCursor: "c1", loadingMore: false });
    expect(fn).toHaveBeenCalledWith({ q: "pintar" });
  });

  it("lista vazia é pronto com zero itens, e erro nunca vira lista vazia", async () => {
    const empty = setup(async () => page([]));
    empty.controller.setParams({});
    await settle();
    expect(empty.controller.getState()).toMatchObject({ status: "ready", jobs: [] });

    const broken = setup(async () => {
      throw new JobsApiError("server");
    });
    broken.controller.setParams({});
    await settle();
    expect(broken.controller.getState()).toMatchObject({ status: "error", error: { kind: "server" } });
    expect(broken.controller.getState()).not.toHaveProperty("jobs");
  });

  it("filtros iguais não repetem a requisição; filtros novos sim", async () => {
    const { controller, fn } = setup(async () => page(["1"]));
    controller.setParams({ q: "a", city: "" });
    controller.setParams({ q: "a" }); // equivalente (vazio = ausente)
    await settle();
    controller.setParams({ q: "a" });
    expect(fn).toHaveBeenCalledTimes(1);
    controller.setParams({ q: "ab" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("resposta atrasada de uma busca antiga não sobrescreve a mais recente", async () => {
    const slow = deferred<JobsResponse>();
    const fast = deferred<JobsResponse>();
    const fn = vi.fn<JobsApi["listJobs"]>().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const controller = createJobsListController({ api: { listJobs: fn } });
    controller.setParams({ q: "velha" });
    controller.setParams({ q: "nova" });
    fast.resolve(page(["nova"]));
    await settle();
    slow.resolve(page(["velha"]));
    await settle();
    const state = controller.getState();
    expect(state).toMatchObject({ status: "ready", params: { q: "nova" } });
    expect(state.status === "ready" && state.jobs.map((j) => j.id)).toEqual(["nova"]);
  });

  it("erro de uma busca antiga também é ignorado", async () => {
    const slow = deferred<JobsResponse>();
    const fn = vi.fn<JobsApi["listJobs"]>().mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(["ok"]));
    const controller = createJobsListController({ api: { listJobs: fn } });
    controller.setParams({ q: "a" });
    controller.setParams({ q: "b" });
    await settle();
    slow.reject(new JobsApiError("network"));
    await settle();
    expect(controller.getState().status).toBe("ready");
  });

  it("loadMore acrescenta a próxima página usando o cursor e os mesmos filtros", async () => {
    const { controller, fn } = setup(async (params) =>
      params.cursor ? page(["3", "4"], null) : page(["1", "2"], "c1"),
    );
    controller.setParams({ category: "aulas-particulares" });
    await settle();
    controller.loadMore();
    expect(controller.getState()).toMatchObject({ status: "ready", loadingMore: true });
    await settle();
    const state = controller.getState();
    expect(state.status === "ready" && state.jobs.map((j) => j.id)).toEqual(["1", "2", "3", "4"]);
    expect(state).toMatchObject({ nextCursor: null, loadingMore: false });
    expect(fn).toHaveBeenLastCalledWith({ category: "aulas-particulares", cursor: "c1" });
  });

  it("loadMore repetido, sem mais páginas ou durante erro não faz requisição", async () => {
    const gate = deferred<JobsResponse>();
    const fn = vi
      .fn<JobsApi["listJobs"]>()
      .mockResolvedValueOnce(page(["1"], "c1"))
      .mockReturnValueOnce(gate.promise);
    const controller = createJobsListController({ api: { listJobs: fn } });
    controller.loadMore(); // ainda sem dados
    controller.setParams({});
    await settle();
    controller.loadMore();
    controller.loadMore();
    controller.loadMore();
    expect(fn).toHaveBeenCalledTimes(2);
    gate.resolve(page(["2"], null));
    await settle();
    controller.loadMore(); // sem cursor
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("não repete itens se o servidor devolver o mesmo id de novo", async () => {
    const { controller } = setup(async (params) => (params.cursor ? page(["2", "3"]) : page(["1", "2"], "c")));
    controller.setParams({});
    await settle();
    controller.loadMore();
    await settle();
    const state = controller.getState();
    expect(state.status === "ready" && state.jobs.map((j) => j.id)).toEqual(["1", "2", "3"]);
  });

  it("falha ao carregar mais mantém a lista e permite tentar de novo", async () => {
    let fail = true;
    const { controller } = setup(async (params) => {
      if (params.cursor) {
        if (fail) throw new JobsApiError("network");
        return page(["2"]);
      }
      return page(["1"], "c1");
    });
    controller.setParams({});
    await settle();
    controller.loadMore();
    await settle();
    expect(controller.getState()).toMatchObject({
      status: "ready",
      loadingMore: false,
      loadMoreError: { kind: "network" },
      nextCursor: "c1",
    });
    expect(controller.getState().status === "ready" && (controller.getState() as { jobs: unknown[] }).jobs).toHaveLength(1);
    fail = false;
    controller.retry();
    await settle();
    const state = controller.getState();
    expect(state.status === "ready" && state.jobs.map((j) => j.id)).toEqual(["1", "2"]);
    expect(state).toMatchObject({ loadMoreError: null });
  });

  it("retry depois de erro na primeira página recarrega; refresh recarrega do zero", async () => {
    let fail = true;
    const { controller, fn } = setup(async () => {
      if (fail) throw new JobsApiError("server");
      return page(["1"], "c");
    });
    controller.setParams({});
    await settle();
    expect(controller.getState().status).toBe("error");
    fail = false;
    controller.retry();
    await settle();
    expect(controller.getState().status).toBe("ready");
    controller.retry(); // nada para tentar de novo
    expect(fn).toHaveBeenCalledTimes(2);
    controller.refresh();
    await settle();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenLastCalledWith({});
  });

  it("mudar os filtros durante o carregamento de mais descarta a página antiga", async () => {
    const more = deferred<JobsResponse>();
    const fn = vi
      .fn<JobsApi["listJobs"]>()
      .mockResolvedValueOnce(page(["1"], "c1"))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce(page(["9"]));
    const controller = createJobsListController({ api: { listJobs: fn } });
    controller.setParams({ q: "a" });
    await settle();
    controller.loadMore();
    controller.setParams({ q: "b" });
    await settle();
    more.resolve(page(["2"]));
    await settle();
    const state = controller.getState();
    expect(state).toMatchObject({ status: "ready", params: { q: "b" } });
    expect(state.status === "ready" && state.jobs.map((j) => j.id)).toEqual(["9"]);
  });
});
