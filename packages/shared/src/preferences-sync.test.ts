import { describe, expect, it, vi } from "vitest";
import { PreferencesApiError, type PreferencesApi } from "./preferences-api";
import type { Preferences } from "./preferences";
import {
  createPreferencesSyncController,
  syncPreferences,
  type PreferencesSyncState,
} from "./preferences-sync";
import { PreferencesStorageError, type LocalPreferencesStore } from "./preferences-storage";

const WORK: Preferences = { wantsWork: true, wantsToHire: false };
const HIRE: Preferences = { wantsWork: false, wantsToHire: true };
const BOTH: Preferences = { wantsWork: true, wantsToHire: true };

type Stored = Preferences | null | "invalid";

/** Armazenamento local em memória, com falhas injetáveis e registro das chamadas. */
function fakeLocal(initial: Stored = null) {
  let value: Stored = initial;
  const calls: string[] = [];
  const failures: { read?: Error; save?: Error; clear?: Error } = {};
  const store: LocalPreferencesStore = {
    async read() {
      calls.push("read");
      if (failures.read) throw failures.read;
      if (value === "invalid") {
        throw new PreferencesStorageError("invalid_data", "dado local inválido");
      }
      return value;
    },
    async save(preferences) {
      calls.push("save");
      if (failures.save) throw failures.save;
      value = preferences;
    },
    async clear() {
      calls.push("clear");
      if (failures.clear) throw failures.clear;
      value = null;
    },
  };
  return { store, calls, failures, value: () => value };
}

function fakeApi(account: Preferences | null | Error = null) {
  const calls: string[] = [];
  let accountValue = account;
  const api: PreferencesApi = {
    async get() {
      calls.push("get");
      if (accountValue instanceof Error) throw accountValue;
      return accountValue;
    },
    async put(preferences) {
      calls.push("put");
      if (putFailure) throw putFailure;
      accountValue = putResponse ?? preferences;
      return accountValue;
    },
  };
  let putFailure: Error | undefined;
  let putResponse: Preferences | undefined;
  return {
    api,
    calls,
    failPut: (e: Error) => (putFailure = e),
    respondPutWith: (p: Preferences) => (putResponse = p),
    account: () => accountValue,
  };
}

const apiError = (kind: ConstructorParameters<typeof PreferencesApiError>[0]) =>
  new PreferencesApiError(kind, `falha ${kind}`);

/** Promessa que o teste resolve na hora que quiser (para provocar corridas). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Deixa todas as promessas pendentes avançarem (as fakes só usam microtarefas). */
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function waitFor(controller: { getState(): PreferencesSyncState }, status: string) {
  for (let i = 0; i < 50 && controller.getState().status !== status; i++) await settle();
  expect(controller.getState().status).toBe(status);
}

describe("syncPreferences", () => {
  it("conta com preferências e local divergente: a conta prevalece e atualiza o local", async () => {
    const local = fakeLocal(HIRE);
    const api = fakeApi(WORK);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({ status: "synced", preferences: WORK });
    expect(local.value()).toEqual(WORK);
    expect(api.calls).toEqual(["get"]); // nunca envia o local
  });

  it("conta com preferências e local igual: não regrava", async () => {
    const local = fakeLocal(WORK);
    const result = await syncPreferences({ api: fakeApi(WORK).api, local: local.store });
    expect(result.status).toBe("synced");
    expect(local.calls).toEqual(["read"]);
  });

  it("conta com preferências e nada local: grava o local", async () => {
    const local = fakeLocal(null);
    await syncPreferences({ api: fakeApi(BOTH).api, local: local.store });
    expect(local.value()).toEqual(BOTH);
  });

  it("conta sem preferências e local válido: envia com PUT e só então conclui", async () => {
    const local = fakeLocal(HIRE);
    const api = fakeApi(null);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({ status: "synced", preferences: HIRE });
    expect(api.calls).toEqual(["get", "put"]);
    expect(api.account()).toEqual(HIRE);
    expect(local.value()).toEqual(HIRE);
  });

  it("nada na conta nem no aparelho: precisa de onboarding, sem gravar nem enviar", async () => {
    const local = fakeLocal(null);
    const api = fakeApi(null);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result.status).toBe("needs_onboarding");
    expect(api.calls).toEqual(["get"]);
    expect(local.calls).toEqual(["read"]);
  });

  it.each(["network", "unauthorized", "server", "rejected", "invalid_response"] as const)(
    "falha da API (%s) é erro, preserva o local e não envia nada",
    async (kind) => {
      const local = fakeLocal(HIRE);
      const api = fakeApi(apiError(kind));
      const result = await syncPreferences({ api: api.api, local: local.store });
      expect(result).toMatchObject({ status: "error", error: { source: "account", kind } });
      expect(result.status).not.toBe("needs_onboarding");
      expect(api.calls).toEqual(["get"]);
      expect(local.calls).toEqual([]); // nem leu, nem gravou, nem apagou
      expect(local.value()).toEqual(HIRE);
    },
  );

  it("falha da API sem preferências locais também é erro (não é onboarding)", async () => {
    const result = await syncPreferences({
      api: fakeApi(apiError("network")).api,
      local: fakeLocal(null).store,
    });
    expect(result.status).toBe("error");
  });

  it("erro inesperado vindo da API vira kind unexpected", async () => {
    const result = await syncPreferences({
      api: fakeApi(new TypeError("boom")).api,
      local: fakeLocal(WORK).store,
    });
    expect(result).toMatchObject({ status: "error", error: { source: "account", kind: "unexpected" } });
  });

  it("local inválido e conta com preferências: erro explícito com as da conta, sem apagar nem sobrescrever", async () => {
    const local = fakeLocal("invalid");
    const api = fakeApi(WORK);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({
      status: "error",
      error: { source: "device", kind: "invalid_data" },
      accountPreferences: WORK,
    });
    expect(local.calls).toEqual(["read"]);
    expect(local.value()).toBe("invalid");
    expect(api.calls).toEqual(["get"]);
  });

  it("local inválido e conta sem preferências: erro, nada enviado, nada apagado", async () => {
    const local = fakeLocal("invalid");
    const api = fakeApi(null);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({
      status: "error",
      error: { kind: "invalid_data" },
      accountPreferences: null,
    });
    expect(api.calls).toEqual(["get"]);
    expect(local.value()).toBe("invalid");
  });

  it("local ilegível (read_failed) também não envia nada para a conta", async () => {
    const local = fakeLocal(WORK);
    local.failures.read = new PreferencesStorageError("read_failed", "falhou");
    const api = fakeApi(null);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({ status: "error", error: { kind: "read_failed" } });
    expect(api.calls).toEqual(["get"]);
  });

  it("falha ao gravar o local: erro com as preferências da conta, não conclui", async () => {
    const local = fakeLocal(HIRE);
    local.failures.save = new PreferencesStorageError("write_failed", "cota");
    const result = await syncPreferences({ api: fakeApi(WORK).api, local: local.store });
    expect(result).toMatchObject({
      status: "error",
      error: { source: "device", kind: "write_failed" },
      accountPreferences: WORK,
    });
    expect(local.value()).toEqual(HIRE);
  });

  it("falha ao salvar na API: erro, não conclui, local preservado", async () => {
    const local = fakeLocal(HIRE);
    const api = fakeApi(null);
    api.failPut(apiError("server"));
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({ status: "error", error: { source: "account", kind: "server" } });
    expect(local.value()).toEqual(HIRE);
    expect(local.calls).toEqual(["read"]);
  });

  it("PUT devolveu valor diferente e o local não pôde ser atualizado: não conclui", async () => {
    const local = fakeLocal(HIRE);
    local.failures.save = new PreferencesStorageError("write_failed", "cota");
    const api = fakeApi(null);
    api.respondPutWith(BOTH);
    const result = await syncPreferences({ api: api.api, local: local.store });
    expect(result).toMatchObject({ status: "error", error: { kind: "write_failed" } });
  });

  it("cancelada depois do GET: não lê, não grava, não envia", async () => {
    const local = fakeLocal(HIRE);
    const api = fakeApi(null);
    let cancelled = false;
    const wrapped: PreferencesApi = {
      ...api.api,
      get: async () => {
        const v = await api.api.get();
        cancelled = true;
        return v;
      },
    };
    await syncPreferences({ api: wrapped, local: local.store, isCancelled: () => cancelled });
    expect(local.calls).toEqual([]);
    expect(api.calls).toEqual(["get"]);
  });

  it("cancelada depois de ler o local: não envia nem grava", async () => {
    const api = fakeApi(null);
    const local = fakeLocal(HIRE);
    let cancelled = false;
    const wrapped: LocalPreferencesStore = {
      ...local.store,
      read: async () => {
        const v = await local.store.read();
        cancelled = true;
        return v;
      },
    };
    await syncPreferences({ api: api.api, local: wrapped, isCancelled: () => cancelled });
    expect(api.calls).toEqual(["get"]);
    expect(local.calls).toEqual(["read"]);
  });
});

describe("controlador de sincronização", () => {
  function setup(opts: { account?: Preferences | null | Error; local?: Stored } = {}) {
    const api = fakeApi(opts.account ?? null);
    const local = fakeLocal(opts.local ?? null);
    const controller = createPreferencesSyncController({ api: api.api, local: local.store });
    return { api, local, controller };
  }

  it("começa deslogado e notifica as mudanças", async () => {
    const { controller } = setup({ account: WORK });
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getState().status));
    expect(controller.getState()).toEqual({ status: "signed_out" });
    controller.start("a");
    await waitFor(controller, "synced");
    expect(seen).toEqual(["syncing", "synced"]);
    expect(controller.getState()).toEqual({ status: "synced", userId: "a", preferences: WORK });
  });

  it("repetir start para o mesmo usuário não duplica requisições", async () => {
    const { controller, api } = setup({ account: WORK });
    controller.start("a");
    controller.start("a");
    await waitFor(controller, "synced");
    controller.start("a");
    await settle();
    expect(api.calls).toEqual(["get"]);
  });

  it("deixa de notificar quem cancelou a assinatura", async () => {
    const { controller } = setup({ account: WORK });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    controller.start("a");
    await waitFor(controller, "synced");
    expect(listener).not.toHaveBeenCalled();
  });

  it("falha de rede vira error (não onboarding) e retry tenta de novo", async () => {
    const api = fakeApi(apiError("network"));
    const local = fakeLocal(HIRE);
    const controller = createPreferencesSyncController({ api: api.api, local: local.store });
    controller.start("a");
    await waitFor(controller, "error");
    expect(controller.getState()).toMatchObject({ error: { kind: "network" }, accountPreferences: null });
    expect(local.value()).toEqual(HIRE);
    expect(api.calls).toEqual(["get"]);

    controller.retry();
    await waitFor(controller, "error");
    expect(api.calls).toEqual(["get", "get"]);
  });

  it("retry fora do estado de erro não faz nada", async () => {
    const { controller, api } = setup({ account: WORK });
    controller.retry();
    controller.start("a");
    await waitFor(controller, "synced");
    controller.retry();
    await settle();
    expect(api.calls).toEqual(["get"]);
  });

  it("retry depois de recuperar a rede conclui a sincronização", async () => {
    const calls: string[] = [];
    let online = false;
    const api: PreferencesApi = {
      async get() {
        calls.push("get");
        if (!online) throw apiError("network");
        return null;
      },
      async put(p) {
        calls.push("put");
        return p;
      },
    };
    const local = fakeLocal(WORK);
    const controller = createPreferencesSyncController({ api, local: local.store });
    controller.start("a");
    await waitFor(controller, "error");
    online = true;
    controller.retry();
    await waitFor(controller, "synced");
    expect(calls).toEqual(["get", "get", "put"]);
  });

  it("estado needs_onboarding só quando a API confirmou ausência e não há local", async () => {
    const { controller } = setup({ account: null, local: null });
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
  });

  it("logout depois de sincronizar apaga só a cópia local", async () => {
    const { controller, local } = setup({ account: WORK, local: HIRE });
    controller.start("a");
    await waitFor(controller, "synced");
    controller.stop();
    await settle();
    expect(controller.getState()).toEqual({ status: "signed_out" });
    expect(local.value()).toBeNull();
    expect(local.calls.filter((c) => c === "clear")).toHaveLength(1);
  });

  it("logout depois de erro preserva o dado local", async () => {
    const api = fakeApi(apiError("network"));
    const local = fakeLocal(HIRE);
    const controller = createPreferencesSyncController({ api: api.api, local: local.store });
    controller.start("a");
    await waitFor(controller, "error");
    controller.stop();
    await settle();
    expect(local.value()).toEqual(HIRE);
    expect(local.calls).not.toContain("clear");
  });

  it("logout com dado local inválido não apaga o dado", async () => {
    const { controller, local } = setup({ account: WORK, local: "invalid" });
    controller.start("a");
    await waitFor(controller, "error");
    controller.stop();
    await settle();
    expect(local.value()).toBe("invalid");
    expect(local.calls).not.toContain("clear");
  });

  it("logout durante a sincronização preserva o local e ignora o resultado atrasado", async () => {
    const gate = deferred<Preferences | null>();
    const calls: string[] = [];
    const api: PreferencesApi = {
      get: () => gate.promise,
      put: async (p) => {
        calls.push("put");
        return p;
      },
    };
    const local = fakeLocal(HIRE);
    const controller = createPreferencesSyncController({ api, local: local.store });
    controller.start("a");
    controller.stop();
    gate.resolve(null);
    await settle();
    await settle();
    expect(controller.getState()).toEqual({ status: "signed_out" });
    expect(calls).toEqual([]); // nada foi enviado depois do logout
    expect(local.calls).toEqual([]);
    expect(local.value()).toEqual(HIRE);
  });

  it("stop sem sessão iniciada é inofensivo", async () => {
    const { controller, local, api } = setup({ account: WORK, local: HIRE });
    controller.stop();
    await settle();
    expect(controller.getState()).toEqual({ status: "signed_out" });
    expect(local.calls).toEqual([]);
    expect(api.calls).toEqual([]);
  });

  it("troca de usuário: a cópia de A é removida e nunca é enviada para a conta de B", async () => {
    const accounts: Record<string, Preferences | null> = { a: WORK, b: null };
    let current = "a";
    const calls: string[] = [];
    const api: PreferencesApi = {
      async get() {
        calls.push(`get:${current}`);
        return accounts[current] ?? null;
      },
      async put(p) {
        calls.push(`put:${current}`);
        accounts[current] = p;
        return p;
      },
    };
    const local = fakeLocal(null);
    const controller = createPreferencesSyncController({ api, local: local.store });

    controller.start("a");
    await waitFor(controller, "synced");
    expect(local.value()).toEqual(WORK);

    controller.stop();
    current = "b";
    controller.start("b");
    await waitFor(controller, "needs_onboarding");
    expect(calls).toEqual(["get:a", "get:b"]); // nenhum PUT
    expect(accounts.b).toBeNull();
    expect(local.value()).toBeNull();
  });

  it("troca direta de usuário sem logout passa pelas mesmas regras", async () => {
    const { controller, local, api } = setup({ account: WORK });
    controller.start("a");
    await waitFor(controller, "synced");
    controller.start("b");
    await waitFor(controller, "synced");
    expect(local.calls).toContain("clear");
    expect(api.calls.filter((c) => c === "put")).toEqual([]);
    expect(controller.getState()).toMatchObject({ userId: "b" });
  });

  it("resultado atrasado do usuário A não afeta o estado nem o local do usuário B", async () => {
    const gateA = deferred<Preferences | null>();
    let callCount = 0;
    const puts: Preferences[] = [];
    const api: PreferencesApi = {
      get: () => (callCount++ === 0 ? gateA.promise : Promise.resolve(HIRE)),
      put: async (p) => {
        puts.push(p);
        return p;
      },
    };
    const local = fakeLocal(null);
    const controller = createPreferencesSyncController({ api, local: local.store });
    controller.start("a");
    await settle(); // a requisição de A já está no ar
    controller.start("b");
    gateA.resolve(WORK); // A responde tarde, com outro valor; B espera A terminar antes de ler o local
    await waitFor(controller, "synced");
    expect(controller.getState()).toMatchObject({ userId: "b", preferences: HIRE });
    expect(local.value()).toEqual(HIRE);
    expect(puts).toEqual([]);
  });

  it("execução cancelada depois de gravar o local: a cópia é removida antes do próximo usuário", async () => {
    const saveGate = deferred<void>();
    const api = fakeApi(WORK);
    const local = fakeLocal(null);
    const originalSave = local.store.save;
    local.store.save = async (p) => {
      await originalSave(p);
      await saveGate.promise; // a gravação termina, mas a sessão já mudou
    };
    const controller = createPreferencesSyncController({ api: api.api, local: local.store });
    controller.start("a");
    for (let i = 0; i < 10 && local.value() === null; i++) await settle();
    expect(local.value()).toEqual(WORK);
    controller.stop(); // A ainda estava "syncing": nada é apagado agora
    expect(local.calls).not.toContain("clear");

    // B (conta sem preferências) entra antes de a execução de A terminar
    api.api.get = async () => null;
    controller.start("b");
    saveGate.resolve();
    await waitFor(controller, "needs_onboarding");
    expect(local.calls).toContain("clear");
    expect(local.value()).toBeNull();
    expect(controller.getState()).toMatchObject({ userId: "b" });
  });

  it("se apagar a cópia falhar, o próximo usuário não herda os dados e tenta de novo", async () => {
    const accounts: Record<string, Preferences | null> = { a: WORK, b: null };
    let current = "a";
    const puts: string[] = [];
    const api: PreferencesApi = {
      get: async () => accounts[current] ?? null,
      put: async (p) => {
        puts.push(current);
        return p;
      },
    };
    const local = fakeLocal(null);
    const controller = createPreferencesSyncController({ api, local: local.store });
    controller.start("a");
    await waitFor(controller, "synced");

    local.failures.clear = new PreferencesStorageError("write_failed", "não removeu");
    controller.stop();
    current = "b";
    controller.start("b");
    await waitFor(controller, "error");
    expect(controller.getState()).toMatchObject({ error: { source: "device", kind: "write_failed" } });
    expect(puts).toEqual([]);
    expect(local.value()).toEqual(WORK); // preservado, não perdido

    delete local.failures.clear;
    controller.retry();
    await waitFor(controller, "needs_onboarding");
    expect(puts).toEqual([]);
    expect(local.value()).toBeNull();
  });

  it("login de novo do mesmo usuário depois do logout sincroniza outra vez", async () => {
    const { controller, api, local } = setup({ account: WORK });
    controller.start("a");
    await waitFor(controller, "synced");
    controller.stop();
    await settle();
    controller.start("a");
    await waitFor(controller, "synced");
    expect(api.calls).toEqual(["get", "get"]);
    expect(local.value()).toEqual(WORK);
  });

  it("falha ao gravar local com conta já preenchida fica em erro com as preferências da conta", async () => {
    const { controller, local } = setup({ account: WORK, local: HIRE });
    local.failures.save = new PreferencesStorageError("write_failed", "cota");
    controller.start("a");
    await waitFor(controller, "error");
    expect(controller.getState()).toMatchObject({
      error: { kind: "write_failed" },
      accountPreferences: WORK,
    });
  });
});

describe("modo visitante", () => {
  function setup(local: Stored = null, account: Preferences | null | Error = null) {
    const api = fakeApi(account);
    const store = fakeLocal(local);
    const controller = createPreferencesSyncController({ api: api.api, local: store.store });
    return { api, store, controller };
  }

  it("sem nada gravado: precisa de onboarding, sem tocar na API", async () => {
    const { controller, api } = setup(null);
    expect(controller.getState().status).toBe("signed_out");
    controller.startVisitor();
    expect(controller.getState().status).toBe("visitor_loading");
    await waitFor(controller, "visitor_needs_onboarding");
    expect(api.calls).toEqual([]);
  });

  it("com escolha válida gravada: pronto", async () => {
    const { controller, api } = setup(HIRE);
    controller.startVisitor();
    await waitFor(controller, "visitor_ready");
    expect(controller.getState()).toEqual({ status: "visitor_ready", preferences: HIRE });
    expect(api.calls).toEqual([]);
  });

  it("dado local inválido ou ilegível é erro, nunca onboarding, e não é apagado", async () => {
    const invalid = setup("invalid");
    invalid.controller.startVisitor();
    await waitFor(invalid.controller, "visitor_error");
    expect(invalid.controller.getState()).toMatchObject({ error: { kind: "invalid_data" } });
    expect(invalid.store.value()).toBe("invalid");
    expect(invalid.store.calls).toEqual(["read"]);

    const unreadable = setup(WORK);
    unreadable.store.failures.read = new PreferencesStorageError("unavailable", "bloqueado");
    unreadable.controller.startVisitor();
    await waitFor(unreadable.controller, "visitor_error");
    expect(unreadable.controller.getState()).toMatchObject({ error: { kind: "unavailable" } });
  });

  it("startVisitor repetido lê uma vez só; retry lê de novo depois de um erro", async () => {
    const { controller, store } = setup(null);
    store.failures.read = new PreferencesStorageError("read_failed", "falhou");
    controller.startVisitor();
    controller.startVisitor();
    await waitFor(controller, "visitor_error");
    expect(store.calls).toEqual(["read"]);
    delete store.failures.read;
    controller.retry();
    await waitFor(controller, "visitor_needs_onboarding");
    expect(store.calls).toEqual(["read", "read"]);
  });

  it("complete grava só no local (sem conta anônima nem chamada à API)", async () => {
    const { controller, api, store } = setup(null);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    const pending = controller.complete(BOTH);
    expect(controller.getState()).toMatchObject({ status: "visitor_needs_onboarding", saving: true });
    await pending;
    expect(controller.getState()).toEqual({ status: "visitor_ready", preferences: BOTH });
    expect(store.value()).toEqual(BOTH);
    expect(api.calls).toEqual([]);
  });

  it("complete sem nenhuma opção é recusado sem gravar", async () => {
    const { controller, store } = setup(null);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    await controller.complete({ wantsWork: false, wantsToHire: false });
    expect(controller.getState()).toMatchObject({
      status: "visitor_needs_onboarding",
      saving: false,
      saveError: { kind: "invalid_data" },
    });
    expect(store.calls).toEqual(["read"]);
  });

  it("complete duplicado grava uma vez", async () => {
    const { controller, store } = setup(null);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    await Promise.all([controller.complete(WORK), controller.complete(HIRE)]);
    expect(store.calls.filter((c) => c === "save")).toHaveLength(1);
    expect(store.value()).toEqual(WORK);
  });

  it("falha ao gravar: continua no onboarding com o erro, nunca vira pronto", async () => {
    const { controller, store } = setup(null);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    store.failures.save = new PreferencesStorageError("write_failed", "cota");
    await controller.complete(WORK);
    expect(controller.getState()).toMatchObject({
      status: "visitor_needs_onboarding",
      saving: false,
      saveError: { kind: "write_failed" },
    });
    delete store.failures.save;
    await controller.complete(WORK);
    expect(controller.getState().status).toBe("visitor_ready");
  });

  it("escolha de visitante e depois login: conta sem preferências recebe a local", async () => {
    const { controller, api, store } = setup(null, null);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    await controller.complete(HIRE);
    controller.start("a");
    await waitFor(controller, "synced");
    expect(api.calls).toEqual(["get", "put"]);
    expect(api.account()).toEqual(HIRE);
    expect(store.value()).toEqual(HIRE);
  });

  it("escolha de visitante e depois login: a conta com preferências prevalece", async () => {
    const { controller, api, store } = setup(null, WORK);
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    await controller.complete(HIRE);
    controller.start("a");
    await waitFor(controller, "synced");
    expect(controller.getState()).toMatchObject({ preferences: WORK });
    expect(api.calls).toEqual(["get"]);
    expect(store.value()).toEqual(WORK);
  });

  it("depois do logout, o visitante não vê a cópia do usuário anterior", async () => {
    const { controller, store } = setup(null, WORK);
    controller.start("a");
    await waitFor(controller, "synced");
    controller.stop();
    controller.startVisitor();
    await waitFor(controller, "visitor_needs_onboarding");
    expect(store.value()).toBeNull();
  });

  it("depois do logout, se apagar a cópia falhar, o visitante vê erro (não a escolha do anterior)", async () => {
    const { controller, store } = setup(null, WORK);
    controller.start("a");
    await waitFor(controller, "synced");
    store.failures.clear = new PreferencesStorageError("write_failed", "não removeu");
    controller.stop();
    controller.startVisitor();
    await waitFor(controller, "visitor_error");
    expect(controller.getState().status).not.toBe("visitor_ready");
  });
});

describe("onboarding com sessão", () => {
  function setup(account: Preferences | null | Error = null, local: Stored = null) {
    const api = fakeApi(account);
    const store = fakeLocal(local);
    const controller = createPreferencesSyncController({ api: api.api, local: store.store });
    return { api, store, controller };
  }

  it("PUT e depois grava o local; só então fica sincronizado", async () => {
    const { controller, api, store } = setup();
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
    const pending = controller.complete(BOTH);
    expect(controller.getState()).toMatchObject({ status: "needs_onboarding", saving: true });
    await pending;
    expect(controller.getState()).toEqual({ status: "synced", userId: "a", preferences: BOTH });
    expect(api.calls).toEqual(["get", "put"]);
    expect(api.account()).toEqual(BOTH);
    expect(store.value()).toEqual(BOTH);
  });

  it("PUT falhou: continua no onboarding com o erro, local intacto, e dá para tentar de novo", async () => {
    const api = fakeApi(null);
    const store = fakeLocal(null);
    let failing = true;
    const flaky: PreferencesApi = {
      get: api.api.get,
      put: async (p) => {
        if (failing) throw apiError("network");
        return api.api.put(p);
      },
    };
    const controller = createPreferencesSyncController({ api: flaky, local: store.store });
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
    await controller.complete(WORK);
    expect(controller.getState()).toMatchObject({
      status: "needs_onboarding",
      saving: false,
      saveError: { source: "account", kind: "network" },
    });
    expect(store.value()).toBeNull();
    failing = false;
    await controller.complete(WORK);
    expect(controller.getState().status).toBe("synced");
  });

  it("PUT funcionou e o local falhou: erro explícito com as preferências já salvas na conta", async () => {
    const { controller, api, store } = setup();
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
    store.failures.save = new PreferencesStorageError("write_failed", "cota");
    await controller.complete(HIRE);
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: { source: "device", kind: "write_failed" },
      accountPreferences: HIRE,
    });
    expect(api.account()).toEqual(HIRE);
    // tentar de novo sincroniza: a conta agora tem preferências e o local é regravado
    delete store.failures.save;
    controller.retry();
    await waitFor(controller, "synced");
    expect(store.value()).toEqual(HIRE);
  });

  it("complete duplicado faz um PUT só; sem opção nenhuma não faz PUT", async () => {
    const { controller, api } = setup();
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
    await controller.complete({ wantsWork: false, wantsToHire: false });
    expect(api.calls).toEqual(["get"]);
    await Promise.all([controller.complete(WORK), controller.complete(HIRE)]);
    expect(api.calls.filter((c) => c === "put")).toHaveLength(1);
  });

  it("complete fora do onboarding é ignorado", async () => {
    const { controller, api } = setup(WORK);
    await controller.complete(HIRE);
    controller.start("a");
    await waitFor(controller, "synced");
    await controller.complete(HIRE);
    expect(api.calls).toEqual(["get"]);
    expect(api.account()).toEqual(WORK);
  });

  it("logout durante o PUT: nada é gravado no local e o próximo usuário não herda a escolha", async () => {
    const gate = deferred<void>();
    const puts: string[] = [];
    let current = "a";
    const api: PreferencesApi = {
      get: async () => null,
      put: async (p) => {
        puts.push(current);
        await gate.promise;
        return p;
      },
    };
    const store = fakeLocal(null);
    const controller = createPreferencesSyncController({ api, local: store.store });
    controller.start("a");
    await waitFor(controller, "needs_onboarding");
    const pending = controller.complete(WORK);
    await settle();
    controller.stop();
    current = "b";
    controller.start("b");
    gate.resolve();
    await pending;
    await waitFor(controller, "needs_onboarding");
    expect(controller.getState()).toMatchObject({ userId: "b" });
    expect(puts).toEqual(["a"]); // B nunca recebeu PUT
    expect(store.value()).toBeNull();
  });
});

describe("recuperação de dado local inválido", () => {
  function setup(account: Preferences | null, visitor = false) {
    const api = fakeApi(account);
    const store = fakeLocal("invalid");
    const controller = createPreferencesSyncController({ api: api.api, local: store.store });
    if (visitor) controller.startVisitor();
    else controller.start("a");
    return { api, store, controller };
  }

  it("nada é apagado sozinho", async () => {
    const { controller, store } = setup(WORK);
    await waitFor(controller, "error");
    await settle();
    expect(store.calls).toEqual(["read"]);
    expect(store.value()).toBe("invalid");
  });

  it("usar as da conta: regrava o local, sem apagar e sem nova requisição", async () => {
    const { controller, store, api } = setup(WORK);
    await waitFor(controller, "error");
    await controller.resolveInvalidLocal("use_account");
    expect(controller.getState()).toEqual({ status: "synced", userId: "a", preferences: WORK });
    expect(store.value()).toEqual(WORK);
    expect(store.calls).not.toContain("clear");
    expect(api.calls).toEqual(["get"]);
    expect(api.account()).toEqual(WORK);
  });

  it("usar as da conta não existe quando a conta não tem preferências", async () => {
    const { controller, store } = setup(null);
    await waitFor(controller, "error");
    await controller.resolveInvalidLocal("use_account");
    expect(controller.getState()).toMatchObject({ status: "error", busy: false });
    expect(store.value()).toBe("invalid");
  });

  it("descartar com conta sem preferências: apaga só o local e pede onboarding", async () => {
    const { controller, store, api } = setup(null);
    await waitFor(controller, "error");
    await controller.resolveInvalidLocal("discard");
    await waitFor(controller, "needs_onboarding");
    expect(store.value()).toBeNull();
    expect(api.calls).not.toContain("put");
  });

  it("descartar com conta com preferências: a conta continua e volta para o local", async () => {
    const { controller, store, api } = setup(WORK);
    await waitFor(controller, "error");
    await controller.resolveInvalidLocal("discard");
    await waitFor(controller, "synced");
    expect(controller.getState()).toMatchObject({ preferences: WORK });
    expect(store.value()).toEqual(WORK);
    expect(api.account()).toEqual(WORK);
    expect(api.calls).not.toContain("put");
  });

  it("falha ao apagar ou regravar: continua em erro, com o motivo, dado intacto", async () => {
    const { controller, store } = setup(WORK);
    await waitFor(controller, "error");
    store.failures.clear = new PreferencesStorageError("write_failed", "não removeu");
    await controller.resolveInvalidLocal("discard");
    expect(controller.getState()).toMatchObject({
      status: "error",
      busy: false,
      error: { kind: "invalid_data" },
      actionError: { kind: "write_failed" },
    });
    expect(store.value()).toBe("invalid");
    delete store.failures.clear;
    store.failures.save = new PreferencesStorageError("write_failed", "cota");
    await controller.resolveInvalidLocal("use_account");
    expect(controller.getState()).toMatchObject({ status: "error", actionError: { kind: "write_failed" } });
    expect(store.value()).toBe("invalid");
  });

  it("não age em erros que não são de dado inválido", async () => {
    const api = fakeApi(apiError("network"));
    const store = fakeLocal(WORK);
    const controller = createPreferencesSyncController({ api: api.api, local: store.store });
    controller.start("a");
    await waitFor(controller, "error");
    await controller.resolveInvalidLocal("discard");
    expect(store.calls).toEqual([]);
    expect(store.value()).toEqual(WORK);
  });

  it("visitante: descartar leva ao onboarding; nada de requisição", async () => {
    const { controller, store, api } = setup(null, true);
    await waitFor(controller, "visitor_error");
    await controller.resolveInvalidLocal("use_account"); // não existe para visitante
    expect(store.value()).toBe("invalid");
    await controller.resolveInvalidLocal("discard");
    await waitFor(controller, "visitor_needs_onboarding");
    expect(store.value()).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("chamada repetida enquanto ocupado não duplica", async () => {
    const { controller, store } = setup(WORK);
    await waitFor(controller, "error");
    await Promise.all([
      controller.resolveInvalidLocal("discard"),
      controller.resolveInvalidLocal("discard"),
    ]);
    await waitFor(controller, "synced");
    expect(store.calls.filter((c) => c === "clear")).toHaveLength(1);
  });
});
