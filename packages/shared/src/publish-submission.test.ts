import { describe, expect, it, vi } from "vitest";
import type { OwnJob } from "./jobs-write";
import { MyJobsApiError, type CreateJobRequest } from "./my-jobs-api";
import {
  PUBLISH_DRAFT_UNCONFIRMED_MESSAGE,
  RETRY_WARNING,
  UNCONFIRMED_MESSAGE,
  createSubmissionController,
  describeCheckDraftError,
  describePublishDraftError,
  describeSubmissionError,
  interpretCheckedJob,
} from "./publish-submission";

const request: CreateJobRequest = {
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
const job = { id: "j1", status: "PUBLISHED" } as OwnJob;

/** `create` controlável: o teste decide quando e como cada chamada termina. */
function setup() {
  const pending: Array<{ resolve: (job: OwnJob) => void; reject: (error: unknown) => void }> = [];
  const create = vi.fn(
    () => new Promise<OwnJob>((resolve, reject) => { pending.push({ resolve, reject }); }),
  );
  const controller = createSubmissionController({ api: { create } });
  return {
    controller,
    create,
    succeed: (j = job) => pending.shift()!.resolve(j),
    fail: (error: unknown) => pending.shift()!.reject(error),
  };
}

const networkError = () => new MyJobsApiError("network", { mutating: true });
const serverError = () => new MyJobsApiError("server", { status: 500, mutating: true });
const validationError = () =>
  new MyJobsApiError("validation", { status: 400, fields: { title: "Informe o título." }, mutating: true });
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("createSubmissionController", () => {
  it("começa parado e sucesso guarda a oportunidade criada", async () => {
    const { controller, succeed, create } = setup();
    expect(controller.getState()).toEqual({ status: "idle" });
    const done = controller.submit(request, "publish");
    expect(controller.getState()).toEqual({ status: "submitting", mode: "publish" });
    succeed();
    expect(await done).toEqual({ status: "succeeded", mode: "publish", job });
    expect(create).toHaveBeenCalledWith(request, { publish: true });
  });

  it("rascunho chama create sem publicar", async () => {
    const { controller, succeed, create } = setup();
    const done = controller.submit(request, "draft");
    succeed();
    await done;
    expect(create).toHaveBeenCalledWith(request, { publish: false });
  });

  it("cliques repetidos enquanto envia não geram outro envio", async () => {
    const { controller, succeed, create } = setup();
    const first = controller.submit(request, "publish");
    const second = controller.submit(request, "publish");
    const third = controller.submit(request, "draft");
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    succeed();
    await Promise.all([first, second, third]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("succeeded");
  });

  it("depois de sucesso, novos envios são ignorados até reset (sem duplicar)", async () => {
    const { controller, succeed, create } = setup();
    const done = controller.submit(request, "publish");
    succeed();
    await done;
    await controller.submit(request, "publish");
    await controller.submit(request, "draft", { confirmRetry: true });
    expect(create).toHaveBeenCalledTimes(1);
    controller.reset();
    expect(controller.getState()).toEqual({ status: "idle" });
    const again = controller.submit(request, "publish");
    expect(create).toHaveBeenCalledTimes(2);
    succeed();
    await again;
  });

  it("recusa da API (validação) é falha definitiva: nada foi salvo e dá para tentar de novo", async () => {
    const { controller, fail, succeed, create } = setup();
    const first = controller.submit(request, "publish");
    fail(validationError());
    const state = await first;
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.error.kind).toBe("validation");
    const second = controller.submit(request, "publish");
    expect(create).toHaveBeenCalledTimes(2);
    succeed();
    expect((await second).status).toBe("succeeded");
  });

  it.each([
    ["sessão (401)", new MyJobsApiError("unauthorized", { status: 401, mutating: true })],
    ["estado (409)", new MyJobsApiError("invalid_state", { status: 409, mutating: true })],
    ["pedido recusado (4xx)", new MyJobsApiError("rejected", { status: 422, mutating: true })],
  ])("%s também é falha definitiva", async (_name, error) => {
    const { controller, fail } = setup();
    const done = controller.submit(request, "publish");
    fail(error);
    expect((await done).status).toBe("failed");
  });

  it.each([
    ["falha de rede", networkError()],
    ["erro 5xx", serverError()],
    ["resposta ilegível", new MyJobsApiError("invalid_response", { status: 201, mutating: true })],
  ])("%s deixa o resultado desconhecido: não é sucesso nem falha", async (_name, error) => {
    const { controller, fail } = setup();
    const done = controller.submit(request, "publish");
    fail(error);
    const state = await done;
    expect(state.status).toBe("unconfirmed");
    expect(describeSubmissionError(error, "publish")).toBe(UNCONFIRMED_MESSAGE);
  });

  it("com resultado desconhecido, nenhum envio acontece sem confirmação explícita", async () => {
    const { controller, fail, succeed, create } = setup();
    const first = controller.submit(request, "publish");
    fail(networkError());
    await first;
    // Nenhum "tentar de novo" comum reenvia.
    await controller.submit(request, "publish");
    await controller.submit(request, "draft", { confirmRetry: false });
    await controller.submit(request, "publish", {});
    expect(create).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("unconfirmed");
    // Só a confirmação da pessoa reenvia.
    const retry = controller.submit(request, "publish", { confirmRetry: true });
    expect(create).toHaveBeenCalledTimes(2);
    succeed();
    expect((await retry).status).toBe("succeeded");
  });

  it("editar o formulário (outro corpo) não libera o reenvio sem confirmação", async () => {
    const { controller, fail, create } = setup();
    const first = controller.submit(request, "publish");
    fail(serverError());
    await first;
    await controller.submit({ ...request, title: "Outro título" }, "publish");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("um novo resultado desconhecido depois da confirmação continua exigindo confirmação", async () => {
    const { controller, fail, create } = setup();
    const first = controller.submit(request, "publish");
    fail(networkError());
    await first;
    const retry = controller.submit(request, "publish", { confirmRetry: true });
    fail(networkError());
    expect((await retry).status).toBe("unconfirmed");
    await controller.submit(request, "publish");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("erro que não é da API também conta como resultado desconhecido", async () => {
    const { controller, fail } = setup();
    const done = controller.submit(request, "publish");
    fail(new TypeError("algo inesperado"));
    expect((await done).status).toBe("unconfirmed");
  });

  it("reset durante o envio é ignorado; depois de falha ou de resultado desconhecido, limpa", async () => {
    const { controller, fail, succeed } = setup();
    const done = controller.submit(request, "publish");
    controller.reset();
    expect(controller.getState().status).toBe("submitting");
    fail(networkError());
    await done;
    controller.reset();
    expect(controller.getState()).toEqual({ status: "idle" });
    const next = controller.submit(request, "publish");
    succeed();
    await next;
  });

  it("notifica os ouvintes a cada mudança e permite cancelar a inscrição", async () => {
    const { controller, succeed } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const done = controller.submit(request, "publish");
    succeed();
    await done;
    expect(listener).toHaveBeenCalledTimes(2); // enviando, sucesso
    unsubscribe();
    controller.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("describeSubmissionError", () => {
  it("só afirma que nada foi salvo quando a API realmente recusou", () => {
    expect(describeSubmissionError(new MyJobsApiError("rejected", { status: 422, mutating: true }), "publish")).toMatch(/Nada foi salvo/);
    expect(describeSubmissionError(new MyJobsApiError("rejected", { status: 422, mutating: true }), "draft")).toMatch(/rascunho/);
    expect(describeSubmissionError(networkError(), "publish")).not.toMatch(/Nada foi salvo/);
    expect(describeSubmissionError(serverError(), "draft")).not.toMatch(/Nada foi salvo/);
  });

  it("mensagens específicas para sessão, validação e estado", () => {
    expect(describeSubmissionError(new MyJobsApiError("unauthorized", { status: 401, mutating: true }), "publish")).toMatch(/mantido/);
    expect(describeSubmissionError(validationError(), "publish")).toMatch(/campos destacados/);
    expect(describeSubmissionError(new MyJobsApiError("invalid_state", { message: "Já foi publicada.", mutating: true }), "publish")).toBe("Já foi publicada.");
  });

  it("o aviso de reenvio fala em duplicada", () => {
    expect(RETRY_WARNING).toMatch(/outra igual/);
    expect(UNCONFIRMED_MESSAGE).toMatch(/Minhas oportunidades/);
  });
});

describe("describePublishDraftError", () => {
  it("resultado desconhecido (rede, 5xx, resposta ilegível): manda conferir o estado, sem afirmar nada", () => {
    for (const error of [
      new MyJobsApiError("network", { mutating: true }),
      new MyJobsApiError("server", { status: 503, mutating: true }),
      new MyJobsApiError("invalid_response", { status: 200, mutating: true }),
    ]) {
      const failure = describePublishDraftError(error);
      expect(failure.checkNow).toBe(true);
      expect(failure.needsSignIn).toBe(false);
      expect(failure.message).toBe(PUBLISH_DRAFT_UNCONFIRMED_MESSAGE);
    }
  });

  it("sessão expirada pede para entrar de novo", () => {
    const failure = describePublishDraftError(new MyJobsApiError("unauthorized", { status: 401, mutating: true }));
    expect(failure).toMatchObject({ needsSignIn: true, checkNow: false });
    expect(failure.message).toMatch(/sessão/);
  });

  it("recusa por campo mostra o motivo e não manda conferir (nada mudou)", () => {
    const failure = describePublishDraftError(
      new MyJobsApiError("validation", { status: 400, fields: { expiresAt: "O prazo da publicação precisa estar no futuro." }, mutating: true }),
    );
    expect(failure.message).toContain("O prazo da publicação precisa estar no futuro.");
    expect(failure.message).toMatch(/não pode ser publicado/);
    expect(failure.checkNow).toBe(false);
  });

  it("já publicada, alterada em outro lugar ou removida: a lista precisa ser conferida", () => {
    expect(describePublishDraftError(new MyJobsApiError("invalid_state", { message: "Esta oportunidade já foi publicada.", status: 409, mutating: true }))).toEqual({
      message: "Esta oportunidade já foi publicada.",
      checkNow: true,
      needsSignIn: false,
    });
    expect(describePublishDraftError(new MyJobsApiError("conflict", { status: 409, mutating: true })).checkNow).toBe(true);
    expect(describePublishDraftError(new MyJobsApiError("not_found", { status: 404, mutating: true })).checkNow).toBe(true);
  });

  it("outro 4xx: mensagem genérica sem conferir", () => {
    const failure = describePublishDraftError(new MyJobsApiError("rejected", { status: 422, mutating: true }));
    expect(failure.checkNow).toBe(false);
    expect(failure.message).toMatch(/Nada foi alterado/);
  });
});

describe("interpretCheckedJob", () => {
  it("publicada e em negociação contam como publicadas; rascunho continua rascunho; o resto é outro estado", () => {
    expect(interpretCheckedJob({ status: "PUBLISHED" })).toBe("published");
    expect(interpretCheckedJob({ status: "NEGOTIATING" })).toBe("published");
    expect(interpretCheckedJob({ status: "DRAFT" })).toBe("still_draft");
    for (const status of ["HIRED", "COMPLETED", "CANCELLED", "EXPIRED"] as const) {
      expect(interpretCheckedJob({ status })).toBe("other");
    }
  });
});

describe("describeCheckDraftError", () => {
  it("falhas de conexão ou do servidor: estado continua desconhecido e dá para conferir de novo", () => {
    for (const kind of ["network", "server", "invalid_response"] as const) {
      const failure = describeCheckDraftError(new MyJobsApiError(kind));
      expect(failure.retryCheck, kind).toBe(true);
      expect(failure.needsSignIn).toBe(false);
      expect(failure.message).toMatch(/continua desconhecido/);
      expect(failure.message).not.toMatch(/publicada\.|rascunho/i);
    }
  });

  it("sessão expirada pede para entrar de novo, sem afirmar nada sobre a oportunidade", () => {
    const failure = describeCheckDraftError(new MyJobsApiError("unauthorized", { status: 401 }));
    expect(failure).toMatchObject({ needsSignIn: true, retryCheck: false });
  });

  it("404: a oportunidade não existe mais; manda atualizar a lista e não tentar de novo", () => {
    const failure = describeCheckDraftError(new MyJobsApiError("not_found", { status: 404 }));
    expect(failure).toMatchObject({ needsSignIn: false, retryCheck: false });
    expect(failure.message).toMatch(/Atualizar/);
  });

  it("outros erros: estado desconhecido", () => {
    expect(describeCheckDraftError(new MyJobsApiError("rejected", { status: 400 }))).toMatchObject({ retryCheck: true });
  });
});
