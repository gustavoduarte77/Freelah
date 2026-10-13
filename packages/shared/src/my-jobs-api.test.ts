import { describe, expect, it, vi } from "vitest";
import type { HttpResponseLike } from "./preferences-api";
import { createMyJobsApi, MyJobsApiError, type MyJobsFetch } from "./my-jobs-api";

const ID = "01990000-0000-7000-8000-000000000001";
const job = {
  id: ID,
  title: "Pintura de sala",
  description: "Preciso pintar uma sala.",
  additionalInfo: null,
  category: { id: "c1", slug: "construcao-civil", name: "Construção Civil" },
  city: "Cataguases",
  state: "MG",
  scheduledDate: "2026-10-20",
  startTime: "08:00",
  proposedPriceCents: 20000,
  negotiable: true,
  status: "DRAFT",
  isDemo: false,
  expiresAt: "2026-10-19T23:59:00.000Z",
  publishedAt: null,
  cancelledAt: null,
  createdAt: "2026-10-12T15:00:00.000Z",
  updatedAt: "2026-10-12T15:00:00.000Z",
  interestCount: 0,
  canComplete: false,
  hiredWorkerName: null,
  canEdit: true,
  canPublish: true,
  canCancel: true,
};

const json = (status: number, body: unknown): HttpResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const unreadable = (status: number): HttpResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    throw new SyntaxError("Unexpected token");
  },
});

function setup(response: HttpResponseLike | Error) {
  const fetch = vi.fn<MyJobsFetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetch, api: createMyJobsApi({ baseUrl: "http://api.test/", fetch }) };
}

const request = {
  title: "Pintura de sala",
  description: "Preciso pintar uma sala.",
  categoryId: "01990000-0000-7000-8000-0000000000aa",
  city: "Cataguases",
  state: "MG",
  scheduledDate: "2026-10-20",
  startTime: "08:00",
  proposedPriceCents: 20000,
  expiresAt: "2026-10-20T02:59:00.000Z",
};

const caught = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as MyJobsApiError;
  }
  throw new Error("era esperado um erro");
};

describe("createMyJobsApi: pedidos", () => {
  it("create envia POST /me/jobs com JSON e devolve a oportunidade", async () => {
    const { api, fetch } = setup(json(201, { job }));
    const created = await api.create(request);
    expect(created).toEqual(job);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api.test/me/jobs");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body!)).toEqual(request);
  });

  it("create com publish:true inclui publish no corpo; sem a opção, não", async () => {
    const withPublish = setup(json(201, { job }));
    await withPublish.api.create(request, { publish: true });
    expect(JSON.parse(withPublish.fetch.mock.calls[0]![1].body!)).toEqual({ ...request, publish: true });
    const draft = setup(json(201, { job }));
    await draft.api.create(request, { publish: false });
    expect(JSON.parse(draft.fetch.mock.calls[0]![1].body!)).not.toHaveProperty("publish");
  });

  it("list e get fazem GET sem corpo", async () => {
    const list = setup(json(200, { jobs: [job] }));
    expect(await list.api.list()).toEqual([job]);
    expect(list.fetch.mock.calls[0]![0]).toBe("http://api.test/me/jobs");
    expect(list.fetch.mock.calls[0]![1].method).toBe("GET");
    expect(list.fetch.mock.calls[0]![1].body).toBeUndefined();

    const one = setup(json(200, { job }));
    expect(await one.api.get(ID)).toEqual(job);
    expect(one.fetch.mock.calls[0]![0]).toBe(`http://api.test/me/jobs/${ID}`);
  });

  it("publish faz POST /me/jobs/:id/publish", async () => {
    const { api, fetch } = setup(json(200, { job: { ...job, status: "PUBLISHED" } }));
    expect((await api.publish(ID)).status).toBe("PUBLISHED");
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/me/jobs/${ID}/publish`);
    expect(fetch.mock.calls[0]![1].method).toBe("POST");
  });

  it("cancel faz POST /me/jobs/:id/cancel e devolve o registro da API", async () => {
    const { api, fetch } = setup(json(200, { job: { ...job, status: "CANCELLED", canCancel: false } }));
    expect((await api.cancel(ID)).status).toBe("CANCELLED");
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/me/jobs/${ID}/cancel`);
    expect(fetch.mock.calls[0]![1].method).toBe("POST");
  });

  it("cancel: falha de rede é resultado desconhecido; 409 não é", async () => {
    const network = await caught(setup(new Error("offline")).api.cancel(ID));
    expect(network.kind).toBe("network");
    expect(network.outcomeUnknown).toBe(true);
    const invalid = await caught(setup(json(409, { error: "invalid_state", message: "Já cancelada." })).api.cancel(ID));
    expect(invalid.kind).toBe("invalid_state");
    expect(invalid.outcomeUnknown).toBe(false);
  });

  it("update faz PATCH só com as mudanças e a versão que a pessoa viu", async () => {
    const { api, fetch } = setup(json(200, { job: { ...job, title: "Novo" } }));
    expect((await api.update(ID, { title: "Novo" }, job.updatedAt)).title).toBe("Novo");
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/me/jobs/${ID}`);
    expect(fetch.mock.calls[0]![1].method).toBe("PATCH");
    expect(JSON.parse(fetch.mock.calls[0]![1].body!)).toEqual({ title: "Novo", expectedUpdatedAt: job.updatedAt });
  });

  it("update: rede é resultado desconhecido; 409 conflict e 400 por campo não são", async () => {
    const network = await caught(setup(new Error("offline")).api.update(ID, { title: "Novo" }, job.updatedAt));
    expect(network.outcomeUnknown).toBe(true);
    const conflict = await caught(setup(json(409, { error: "conflict" })).api.update(ID, { title: "Novo" }, job.updatedAt));
    expect(conflict.kind).toBe("conflict");
    expect(conflict.outcomeUnknown).toBe(false);
    const invalid = await caught(
      setup(json(400, { error: "validation_error", fields: { title: "Curto." } })).api.update(ID, { title: "x" }, job.updatedAt),
    );
    expect(invalid.kind).toBe("validation");
    expect(invalid.fields).toEqual({ title: "Curto." });
  });

  it("codifica o id na URL", async () => {
    const { api, fetch } = setup(json(404, { error: "not_found" }));
    await caught(api.get("a/b?c"));
    expect(fetch.mock.calls[0]![0]).toBe("http://api.test/me/jobs/a%2Fb%3Fc");
  });
});

describe("createMyJobsApi: erros", () => {
  it("401 é unauthorized e o servidor certamente não gravou", async () => {
    const error = await caught(setup(json(401, { error: "unauthorized" })).api.create(request));
    expect(error).toBeInstanceOf(MyJobsApiError);
    expect(error.kind).toBe("unauthorized");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("400 com campos é validation e traz as mensagens por campo", async () => {
    const error = await caught(
      setup(json(400, { error: "validation_error", message: "Confira", fields: { title: "Informe o título." } })).api.create(request),
    );
    expect(error.kind).toBe("validation");
    expect(error.fields).toEqual({ title: "Informe o título." });
    expect(error.outcomeUnknown).toBe(false);
  });

  it("400 sem campos (corpo ilegível) é rejected", async () => {
    const error = await caught(setup(json(400, { error: "bad_request", message: "Não foi possível ler." })).api.create(request));
    expect(error.kind).toBe("rejected");
    expect(error.message).toBe("Não foi possível ler.");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("404, 409 invalid_state e 409 conflict", async () => {
    expect((await caught(setup(json(404, { error: "not_found" })).api.get(ID))).kind).toBe("not_found");
    const invalid = await caught(setup(json(409, { error: "invalid_state", message: "Já foi publicada." })).api.publish(ID));
    expect(invalid.kind).toBe("invalid_state");
    expect(invalid.message).toBe("Já foi publicada.");
    expect((await caught(setup(json(409, { error: "conflict" })).api.publish(ID))).kind).toBe("conflict");
    expect(invalid.outcomeUnknown).toBe(false);
  });

  it("outros 4xx são rejected, mesmo com corpo ilegível", async () => {
    expect((await caught(setup(json(422, {})).api.create(request))).kind).toBe("rejected");
    const unread = await caught(setup(unreadable(403)).api.create(request));
    expect(unread.kind).toBe("rejected");
    expect(unread.outcomeUnknown).toBe(false);
  });

  it("5xx ao gravar tem resultado desconhecido; ao ler, não", async () => {
    const write = await caught(setup(json(500, { error: "internal_error" })).api.create(request));
    expect(write.kind).toBe("server");
    expect(write.status).toBe(500);
    expect(write.outcomeUnknown).toBe(true);
    const read = await caught(setup(json(503, {})).api.list());
    expect(read.kind).toBe("server");
    expect(read.outcomeUnknown).toBe(false);
  });

  it("falha de rede ao gravar tem resultado desconhecido; ao ler, não", async () => {
    const write = await caught(setup(new TypeError("Failed to fetch")).api.create(request));
    expect(write.kind).toBe("network");
    expect(write.outcomeUnknown).toBe(true);
    expect(write.cause).toBeInstanceOf(TypeError);
    const publish = await caught(setup(new Error("timeout")).api.publish(ID));
    expect(publish.outcomeUnknown).toBe(true);
    const read = await caught(setup(new Error("timeout")).api.list());
    expect(read.kind).toBe("network");
    expect(read.outcomeUnknown).toBe(false);
  });

  it("sucesso com resposta ilegível ou fora do contrato é invalid_response, com resultado desconhecido ao gravar", async () => {
    const unread = await caught(setup(unreadable(201)).api.create(request));
    expect(unread.kind).toBe("invalid_response");
    expect(unread.outcomeUnknown).toBe(true);
    const wrong = await caught(setup(json(201, { job: { id: ID } })).api.create(request));
    expect(wrong.kind).toBe("invalid_response");
    expect(wrong.outcomeUnknown).toBe(true);
    const wrongRead = await caught(setup(json(200, { jobs: "x" })).api.list());
    expect(wrongRead.kind).toBe("invalid_response");
    expect(wrongRead.outcomeUnknown).toBe(false);
  });

  it("as mensagens padrão estão em português", async () => {
    const error = await caught(setup(new Error("x")).api.create(request));
    expect(error.message).toMatch(/Não foi possível conectar/);
    expect((await caught(setup(json(401, {})).api.list())).message).toMatch(/sessão/);
  });
});

describe("createMyJobsApi: interesses", () => {
  it("expressInterest faz POST /jobs/:id/interest e devolve o interesse", async () => {
    const { api, fetch } = setup(json(201, { interest: { id: "i1", status: "PENDING" } }));
    expect(await api.expressInterest(ID)).toEqual({ id: "i1", status: "PENDING", invite: "NONE" });
    expect(fetch.mock.calls[0]![0]).toBe(`http://api.test/jobs/${ID}/interest`);
    expect(fetch.mock.calls[0]![1].method).toBe("POST");
  });

  it("recusa já demonstrou: kind invalid_state com code already_interested (e resultado conhecido)", async () => {
    const error = await caught(
      setup(json(409, { error: "already_interested", message: "Você já demonstrou interesse." })).api.expressInterest(ID),
    );
    expect(error.kind).toBe("invalid_state");
    expect(error.code).toBe("already_interested");
    expect(error.outcomeUnknown).toBe(false);
  });

  it("rede e 5xx ao demonstrar interesse são resultado desconhecido", async () => {
    expect((await caught(setup(new Error("offline")).api.expressInterest(ID))).outcomeUnknown).toBe(true);
    expect((await caught(setup(json(503, {})).api.expressInterest(ID))).outcomeUnknown).toBe(true);
  });

  it("withdrawInterest, jobViewer, myInterests e jobInterests usam as rotas certas", async () => {
    const withdraw = setup(json(200, { interest: { id: "i1", status: "WITHDRAWN" } }));
    expect((await withdraw.api.withdrawInterest("i1")).status).toBe("WITHDRAWN");
    expect(withdraw.fetch.mock.calls[0]![0]).toBe("http://api.test/me/interests/i1/withdraw");

    const viewer = setup(json(200, { isOwner: false, interest: null }));
    expect(await viewer.api.jobViewer(ID)).toEqual({ isOwner: false, interest: null });
    expect(viewer.fetch.mock.calls[0]![0]).toBe(`http://api.test/jobs/${ID}/viewer`);
    expect(viewer.fetch.mock.calls[0]![1].method).toBe("GET");

    const mine = setup(json(200, { interests: [] }));
    expect(await mine.api.myInterests()).toEqual([]);
    expect(mine.fetch.mock.calls[0]![0]).toBe("http://api.test/me/interests");

    const owned = setup(json(200, { interests: [{ id: "i1", status: "PENDING", createdAt: "2026-10-12T15:00:00.000Z", worker: { name: "Ana", city: "Muriaé" } }] }));
    expect((await owned.api.jobInterests(ID))[0]!.worker.name).toBe("Ana");
    expect(owned.fetch.mock.calls[0]![0]).toBe(`http://api.test/me/jobs/${ID}/interests`);
  });

  it("resposta fora do contrato vira invalid_response", async () => {
    expect((await caught(setup(json(200, { isOwner: "talvez" })).api.jobViewer(ID))).kind).toBe("invalid_response");
  });
});
