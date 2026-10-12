import { describe, expect, it } from "vitest";
import { classifySession, sessionRetryDelayMs } from "./session-state";

const user = { user: { id: "u1" } };

describe("classifySession", () => {
  it("autenticado: há sessão", () => {
    expect(classifySession({ data: user, isPending: false, error: null })).toEqual({
      status: "authenticated",
      session: user,
    });
  });

  it("sem sessão confirmada pela API: resposta vazia, sem erro", () => {
    expect(classifySession({ data: null, isPending: false, error: null })).toEqual({
      status: "unauthenticated",
    });
    expect(classifySession({ data: undefined, isPending: false, error: null }).status).toBe(
      "unauthenticated",
    );
  });

  it("401 confirma que não há sessão (expirada ou encerrada)", () => {
    expect(classifySession({ data: null, isPending: false, error: { status: 401 } }).status).toBe(
      "unauthenticated",
    );
  });

  it.each([
    ["falha de rede (TypeError)", new TypeError("Failed to fetch")],
    ["erro sem status", new Error("boom")],
    ["status 0", { status: 0, message: "network" }],
    ["500", { status: 500 }],
    ["502", { status: 502 }],
    ["503", { status: 503 }],
    ["504", { status: 504 }],
    ["429", { status: 429 }],
    ["texto solto", "falhou"],
  ])("%s é desconhecido, nunca 'sem sessão'", (_name, error) => {
    const state = classifySession({ data: null, isPending: false, error });
    expect(state.status).toBe("unknown");
  });

  it("sessão já conhecida é preservada mesmo se a revalidação falhar por rede ou 5xx", () => {
    for (const error of [new TypeError("x"), { status: 503 }]) {
      expect(classifySession({ data: user, isPending: false, error }).status).toBe("authenticated");
    }
  });

  it("primeira consulta em andamento é carregando", () => {
    expect(classifySession({ data: null, isPending: true, error: null })).toEqual({
      status: "loading",
    });
  });

  it("nova tentativa depois de 'desconhecido' continua desconhecida (não pisca para carregando)", () => {
    expect(
      classifySession({ data: null, isPending: true, error: null }, { wasUnknown: true }).status,
    ).toBe("unknown");
  });

  it("a nova tentativa que dá certo resolve o estado", () => {
    const ok = { data: user, isPending: false, error: null };
    expect(classifySession(ok, { wasUnknown: true }).status).toBe("authenticated");
    expect(
      classifySession({ data: null, isPending: false, error: null }, { wasUnknown: true }).status,
    ).toBe("unauthenticated");
  });

  it("erro tem prioridade sobre 'pendente' (a consulta terminou com falha)", () => {
    expect(
      classifySession({ data: null, isPending: true, error: { status: 500 } }).status,
    ).toBe("unknown");
  });
});

describe("sessionRetryDelayMs", () => {
  it("aumenta e depois fica limitado", () => {
    const delays = [0, 1, 2, 3, 4, 5].map((n) => sessionRetryDelayMs(n)!);
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]!);
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
  });

  it("para de tentar sozinho depois de algumas vezes (sem laço infinito)", () => {
    expect(sessionRetryDelayMs(6)).toBeNull();
    expect(sessionRetryDelayMs(100)).toBeNull();
    expect(sessionRetryDelayMs(-1)).toBeNull();
  });
});
