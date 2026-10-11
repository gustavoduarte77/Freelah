import { describe, expect, it, vi } from "vitest";
import {
  PreferencesApiError,
  createPreferencesApi,
  type HttpFetch,
  type HttpResponseLike,
} from "./preferences-api";

const respond = (status: number, body?: unknown, jsonFails = false): HttpResponseLike => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (jsonFails) throw new SyntaxError("Unexpected token");
    return body;
  },
});

function apiWith(fetchImpl: HttpFetch) {
  const fetchFn = vi.fn(fetchImpl);
  return { api: createPreferencesApi({ baseUrl: "http://api.test/", fetch: fetchFn }), fetchFn };
}

async function kindOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PreferencesApiError);
    return (error as PreferencesApiError).kind;
  }
  throw new Error("esperava um erro");
}

describe("GET /me/preferences", () => {
  it("devolve as preferências da conta e usa a URL correta", async () => {
    const { api, fetchFn } = apiWith(async () =>
      respond(200, { preferences: { wantsWork: true, wantsToHire: false } }),
    );
    expect(await api.get()).toEqual({ wantsWork: true, wantsToHire: false });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/me/preferences", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("200 com preferences null é a única forma de devolver null", async () => {
    const { api } = apiWith(async () => respond(200, { preferences: null }));
    expect(await api.get()).toBeNull();
  });

  it.each([
    ["falha de rede", async () => Promise.reject(new TypeError("Failed to fetch")), "network"],
    ["401", async () => respond(401, { error: "unauthorized" }), "unauthorized"],
    ["500", async () => respond(500, {}), "server"],
    ["503", async () => respond(503, {}), "server"],
    ["400", async () => respond(400, {}), "rejected"],
    ["404", async () => respond(404, {}), "rejected"],
    ["JSON ilegível", async () => respond(200, undefined, true), "invalid_response"],
    ["corpo sem o campo", async () => respond(200, {}), "invalid_response"],
    ["corpo inválido", async () => respond(200, { preferences: { wantsWork: "sim" } }), "invalid_response"],
    ["flag com tipo errado", async () => respond(200, { preferences: { wantsWork: true, wantsToHire: 1 } }), "invalid_response"],
    ["200 vazio", async () => respond(200, null), "invalid_response"],
  ] as [string, HttpFetch, string][])("%s é erro explícito, nunca null", async (_n, impl, kind) => {
    const { api } = apiWith(impl);
    expect(await kindOf(api.get())).toBe(kind);
  });
});

describe("PUT /me/preferences", () => {
  it("envia o JSON do contrato e devolve o que a API salvou", async () => {
    const { api, fetchFn } = apiWith(async () =>
      respond(200, { preferences: { wantsWork: true, wantsToHire: true } }),
    );
    expect(await api.put({ wantsWork: true, wantsToHire: true })).toEqual({
      wantsWork: true,
      wantsToHire: true,
    });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/me/preferences", {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"wantsWork":true,"wantsToHire":true}',
    });
  });

  it("não faz requisição com preferências inválidas", async () => {
    const { api, fetchFn } = apiWith(async () => respond(200, {}));
    expect(await kindOf(api.put({ wantsWork: false, wantsToHire: false }))).toBe("rejected");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("resposta com preferences null é inválida", async () => {
    const { api } = apiWith(async () => respond(200, { preferences: null }));
    expect(await kindOf(api.put({ wantsWork: true, wantsToHire: false }))).toBe("invalid_response");
  });

  it.each([
    [401, "unauthorized"],
    [400, "rejected"],
    [500, "server"],
  ] as [number, string][])("status %i vira %s", async (status, kind) => {
    const { api } = apiWith(async () => respond(status, {}));
    expect(await kindOf(api.put({ wantsWork: true, wantsToHire: false }))).toBe(kind);
  });

  it("falha de rede vira network", async () => {
    const { api } = apiWith(async () => Promise.reject(new Error("offline")));
    expect(await kindOf(api.put({ wantsWork: true, wantsToHire: false }))).toBe("network");
  });
});
