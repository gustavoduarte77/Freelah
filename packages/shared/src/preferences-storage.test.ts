import { describe, expect, it, vi } from "vitest";
import {
  PREFERENCES_STORAGE_KEY,
  PreferencesStorageError,
  createLocalPreferencesStore,
  createSecureKeyValueStore,
  createWebKeyValueStore,
  type KeyValueStore,
  type SecureStoreLike,
  type StorageLike,
} from "./preferences-storage";

/** Chaves que outras partes do app já usam e que nunca podem ser tocadas. */
const FOREIGN_ENTRIES: Record<string, string> = {
  freelah_cookie: '{"better-auth.session_token":{"value":"x"}}',
  freelah_session_data: '{"user":{"id":"1"}}',
  "better-auth.message": '{"event":"x"}',
};

const BOTH: [boolean, boolean][] = [
  [true, false],
  [false, true],
  [true, true],
];

/** KeyValueStore em memória que registra cada chave tocada. */
function memoryKv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const touched = new Set<string>();
  const kv: KeyValueStore = {
    async getItem(key) {
      touched.add(key);
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      touched.add(key);
      data.set(key, value);
    },
    async removeItem(key) {
      touched.add(key);
      data.delete(key);
    },
  };
  return { kv, data, touched };
}

async function failure(promise: Promise<unknown>): Promise<PreferencesStorageError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PreferencesStorageError);
    return error as PreferencesStorageError;
  }
  throw new Error("era esperado um erro, mas a operação teve sucesso");
}

describe("chave de armazenamento", () => {
  it("é freelah.preferences e respeita a regra de chaves do SecureStore", () => {
    expect(PREFERENCES_STORAGE_KEY).toBe("freelah.preferences");
    expect(/^[\w.-]+$/.test(PREFERENCES_STORAGE_KEY)).toBe(true);
  });

  it("não coincide com nenhuma chave de autenticação", () => {
    expect(Object.keys(FOREIGN_ENTRIES)).not.toContain(PREFERENCES_STORAGE_KEY);
  });
});

describe("createLocalPreferencesStore", () => {
  describe("leitura", () => {
    it("devolve null somente quando nada foi gravado", async () => {
      const { kv } = memoryKv();
      expect(await createLocalPreferencesStore(kv).read()).toBeNull();
    });

    it.each(BOTH)("lê wantsWork=%s e wantsToHire=%s", async (wantsWork, wantsToHire) => {
      const { kv } = memoryKv({
        [PREFERENCES_STORAGE_KEY]: JSON.stringify({ wantsWork, wantsToHire }),
      });
      expect(await createLocalPreferencesStore(kv).read()).toEqual({ wantsWork, wantsToHire });
    });
  });

  describe("gravação, ida e volta e remoção", () => {
    it.each(BOTH)("grava e relê %s/%s", async (wantsWork, wantsToHire) => {
      const { kv } = memoryKv();
      const store = createLocalPreferencesStore(kv);
      await store.save({ wantsWork, wantsToHire });
      expect(await store.read()).toEqual({ wantsWork, wantsToHire });
    });

    it("grava exatamente o JSON do contrato compartilhado, sem campos extras", async () => {
      const { kv, data } = memoryKv();
      await createLocalPreferencesStore(kv).save({ wantsWork: true, wantsToHire: false });
      expect(data.get(PREFERENCES_STORAGE_KEY)).toBe('{"wantsWork":true,"wantsToHire":false}');
      expect(data.size).toBe(1);
    });

    it("sobrescreve o valor anterior", async () => {
      const { kv } = memoryKv();
      const store = createLocalPreferencesStore(kv);
      await store.save({ wantsWork: true, wantsToHire: false });
      await store.save({ wantsWork: false, wantsToHire: true });
      expect(await store.read()).toEqual({ wantsWork: false, wantsToHire: true });
    });

    it("clear remove as preferências e pode ser repetido sem erro", async () => {
      const { kv } = memoryKv();
      const store = createLocalPreferencesStore(kv);
      await store.save({ wantsWork: true, wantsToHire: true });
      await store.clear();
      expect(await store.read()).toBeNull();
      await expect(store.clear()).resolves.toBeUndefined();
    });
  });

  describe("dados inválidos gravados", () => {
    const invalid: [string, string][] = [
      ["JSON quebrado", "{wantsWork:"],
      ["texto vazio", ""],
      ["texto que não é JSON", "sim"],
      ["JSON nulo", "null"],
      ["lista", "[]"],
      ["número", "1"],
      ["objeto vazio", "{}"],
      ["campo ausente", '{"wantsWork":true}'],
      ["tipos errados", '{"wantsWork":"true","wantsToHire":false}'],
      ["as duas opções desativadas", '{"wantsWork":false,"wantsToHire":false}'],
      ["campo extra (userId)", '{"wantsWork":true,"wantsToHire":false,"userId":"x"}'],
    ];

    it.each(invalid)("%s: read lança invalid_data (não devolve null)", async (_name, raw) => {
      const { kv } = memoryKv({ [PREFERENCES_STORAGE_KEY]: raw });
      const error = await failure(createLocalPreferencesStore(kv).read());
      expect(error.kind).toBe("invalid_data");
    });

    it("não apaga nem altera o dado inválido ao lê-lo", async () => {
      const { kv, data } = memoryKv({ [PREFERENCES_STORAGE_KEY]: "{quebrado" });
      const store = createLocalPreferencesStore(kv);
      await failure(store.read());
      await failure(store.read());
      expect(data.get(PREFERENCES_STORAGE_KEY)).toBe("{quebrado");
    });

    it("trata um valor que não é texto como inválido, nunca como ausente", async () => {
      const kv: KeyValueStore = {
        getItem: async () => undefined as unknown as string,
        setItem: async () => {},
        removeItem: async () => {},
      };
      const error = await failure(createLocalPreferencesStore(kv).read());
      expect(error.kind).toBe("invalid_data");
    });

    it("permite recuperar-se explicitamente com clear", async () => {
      const { kv } = memoryKv({ [PREFERENCES_STORAGE_KEY]: "{quebrado" });
      const store = createLocalPreferencesStore(kv);
      await failure(store.read());
      await store.clear();
      expect(await store.read()).toBeNull();
    });
  });

  describe("save valida antes de acessar o armazenamento", () => {
    const invalidInputs: [string, unknown][] = [
      ["as duas desativadas", { wantsWork: false, wantsToHire: false }],
      ["campo extra", { wantsWork: true, wantsToHire: false, userId: "x" }],
      ["tipos errados", { wantsWork: "sim", wantsToHire: false }],
      ["campo ausente", { wantsWork: true }],
      ["nulo", null],
    ];

    it.each(invalidInputs)("%s: lança invalid_data sem tocar no armazenamento", async (_n, input) => {
      const kv: KeyValueStore = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      const error = await failure(
        createLocalPreferencesStore(kv).save(input as { wantsWork: boolean; wantsToHire: boolean }),
      );
      expect(error.kind).toBe("invalid_data");
      expect(kv.getItem).not.toHaveBeenCalled();
      expect(kv.setItem).not.toHaveBeenCalled();
      expect(kv.removeItem).not.toHaveBeenCalled();
    });

    it("mantém o valor anterior quando recusa uma gravação inválida", async () => {
      const { kv } = memoryKv();
      const store = createLocalPreferencesStore(kv);
      await store.save({ wantsWork: true, wantsToHire: false });
      await failure(store.save({ wantsWork: false, wantsToHire: false }));
      expect(await store.read()).toEqual({ wantsWork: true, wantsToHire: false });
    });
  });

  describe("falhas de armazenamento nunca viram ausência de dados", () => {
    const boom = new Error("falha do dispositivo");

    it("falha na leitura rejeita com read_failed e preserva a causa", async () => {
      const kv: KeyValueStore = {
        getItem: async () => {
          throw boom;
        },
        setItem: async () => {},
        removeItem: async () => {},
      };
      const error = await failure(createLocalPreferencesStore(kv).read());
      expect(error.kind).toBe("read_failed");
      expect(error.cause).toBe(boom);
    });

    it("falha na gravação rejeita com write_failed e não parece sucesso", async () => {
      const kv: KeyValueStore = {
        getItem: async () => null,
        setItem: async () => {
          throw boom;
        },
        removeItem: async () => {},
      };
      const error = await failure(
        createLocalPreferencesStore(kv).save({ wantsWork: true, wantsToHire: true }),
      );
      expect(error.kind).toBe("write_failed");
      expect(error.cause).toBe(boom);
    });

    it("falha na remoção rejeita com write_failed", async () => {
      const kv: KeyValueStore = {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {
          throw boom;
        },
      };
      const error = await failure(createLocalPreferencesStore(kv).clear());
      expect(error.kind).toBe("write_failed");
    });

    it("uma gravação que falha não altera o que já estava salvo", async () => {
      const { kv, data } = memoryKv();
      const store = createLocalPreferencesStore(kv);
      await store.save({ wantsWork: true, wantsToHire: false });
      const failing: KeyValueStore = {
        ...kv,
        setItem: async () => {
          throw boom;
        },
      };
      await failure(
        createLocalPreferencesStore(failing).save({ wantsWork: false, wantsToHire: true }),
      );
      expect(data.get(PREFERENCES_STORAGE_KEY)).toBe('{"wantsWork":true,"wantsToHire":false}');
      expect(await store.read()).toEqual({ wantsWork: true, wantsToHire: false });
    });

    it("mantém o tipo e o tipo de falha de erros que o adaptador já classificou", async () => {
      const kv: KeyValueStore = {
        getItem: async () => {
          throw new PreferencesStorageError("unavailable", "bloqueado");
        },
        setItem: async () => {},
        removeItem: async () => {},
      };
      const error = await failure(createLocalPreferencesStore(kv).read());
      expect(error.kind).toBe("unavailable");
    });
  });

  describe("isolamento: só a chave freelah.preferences é tocada", () => {
    it("ler, salvar, sobrescrever e limpar não alteram as chaves de autenticação", async () => {
      const { kv, data, touched } = memoryKv(FOREIGN_ENTRIES);
      const store = createLocalPreferencesStore(kv);
      await store.read();
      await store.save({ wantsWork: true, wantsToHire: false });
      await store.save({ wantsWork: false, wantsToHire: true });
      await store.clear();
      await store.clear();

      expect([...touched]).toEqual([PREFERENCES_STORAGE_KEY]);
      expect(Object.fromEntries(data)).toEqual(FOREIGN_ENTRIES);
    });

    it("limpar com dado inválido também preserva as outras chaves", async () => {
      const { kv, data } = memoryKv({ ...FOREIGN_ENTRIES, [PREFERENCES_STORAGE_KEY]: "{x" });
      await createLocalPreferencesStore(kv).clear();
      expect(Object.fromEntries(data)).toEqual(FOREIGN_ENTRIES);
    });
  });
});

describe("createWebKeyValueStore (localStorage)", () => {
  function fakeLocalStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    const storage: StorageLike = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    };
    return { storage, data };
  }

  it("usa getItem, setItem e removeItem do localStorage com a chave de preferências", async () => {
    const { storage, data } = fakeLocalStorage(FOREIGN_ENTRIES);
    const store = createLocalPreferencesStore(createWebKeyValueStore(() => storage));

    expect(await store.read()).toBeNull();
    await store.save({ wantsWork: true, wantsToHire: true });
    expect(data.get("freelah.preferences")).toBe('{"wantsWork":true,"wantsToHire":true}');
    expect(await store.read()).toEqual({ wantsWork: true, wantsToHire: true });
    await store.clear();
    expect(data.has("freelah.preferences")).toBe(false);
    expect(Object.fromEntries(data)).toEqual(FOREIGN_ENTRIES);
  });

  it("localStorage ausente: unavailable em read, save e clear, nunca null", async () => {
    const store = createLocalPreferencesStore(createWebKeyValueStore(() => undefined));
    expect((await failure(store.read())).kind).toBe("unavailable");
    expect((await failure(store.save({ wantsWork: true, wantsToHire: false }))).kind).toBe(
      "unavailable",
    );
    expect((await failure(store.clear())).kind).toBe("unavailable");
  });

  it("acesso bloqueado pelo navegador (SecurityError): unavailable com a causa", async () => {
    const securityError = Object.assign(new Error("blocked"), { name: "SecurityError" });
    const store = createLocalPreferencesStore(
      createWebKeyValueStore(() => {
        throw securityError;
      }),
    );
    const error = await failure(store.read());
    expect(error.kind).toBe("unavailable");
    expect(error.cause).toBe(securityError);
  });

  it("cota estourada ao gravar: write_failed, e o valor anterior continua", async () => {
    const { storage, data } = fakeLocalStorage();
    const store = createLocalPreferencesStore(createWebKeyValueStore(() => storage));
    await store.save({ wantsWork: true, wantsToHire: false });

    const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const full: StorageLike = {
      ...storage,
      setItem: () => {
        throw quota;
      },
    };
    const error = await failure(
      createLocalPreferencesStore(createWebKeyValueStore(() => full)).save({
        wantsWork: false,
        wantsToHire: true,
      }),
    );
    expect(error.kind).toBe("write_failed");
    expect(error.cause).toBe(quota);
    expect(data.get(PREFERENCES_STORAGE_KEY)).toBe('{"wantsWork":true,"wantsToHire":false}');
  });

  it("erro ao ler o localStorage: read_failed", async () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("falha");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const error = await failure(
      createLocalPreferencesStore(createWebKeyValueStore(() => storage)).read(),
    );
    expect(error.kind).toBe("read_failed");
  });

  it("a função que entrega o localStorage não é chamada quando save recebe dados inválidos", async () => {
    const getStorage = vi.fn(() => undefined);
    const store = createLocalPreferencesStore(createWebKeyValueStore(getStorage));
    const error = await failure(store.save({ wantsWork: false, wantsToHire: false }));
    expect(error.kind).toBe("invalid_data");
    expect(getStorage).not.toHaveBeenCalled();
  });
});

describe("createSecureKeyValueStore (expo-secure-store)", () => {
  /** Imita o SecureStore real, inclusive a recusa de chaves fora de [\w.-]+. */
  function fakeSecureStore(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    const calls: string[] = [];
    const assertValidKey = (key: string) => {
      if (!/^[\w.-]+$/.test(key)) throw new Error("Invalid key provided to SecureStore.");
    };
    const secureStore: SecureStoreLike = {
      async getItemAsync(key) {
        assertValidKey(key);
        calls.push(`get:${key}`);
        return data.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        assertValidKey(key);
        calls.push(`set:${key}`);
        data.set(key, value);
      },
      async deleteItemAsync(key) {
        assertValidKey(key);
        calls.push(`delete:${key}`);
        data.delete(key);
      },
    };
    return { secureStore, data, calls };
  }

  it("usa getItemAsync, setItemAsync e deleteItemAsync só com a chave de preferências", async () => {
    const { secureStore, data, calls } = fakeSecureStore(FOREIGN_ENTRIES);
    const store = createLocalPreferencesStore(createSecureKeyValueStore(secureStore));

    expect(await store.read()).toBeNull();
    await store.save({ wantsWork: false, wantsToHire: true });
    expect(await store.read()).toEqual({ wantsWork: false, wantsToHire: true });
    await store.clear();

    expect(calls).toEqual([
      "get:freelah.preferences",
      "set:freelah.preferences",
      "get:freelah.preferences",
      "delete:freelah.preferences",
    ]);
    expect(Object.fromEntries(data)).toEqual(FOREIGN_ENTRIES);
  });

  it("a chave de preferências é aceita pelas regras do SecureStore", async () => {
    const { secureStore } = fakeSecureStore();
    const store = createLocalPreferencesStore(createSecureKeyValueStore(secureStore));
    await expect(store.save({ wantsWork: true, wantsToHire: false })).resolves.toBeUndefined();
  });

  it("falha do Keystore/Keychain na leitura: read_failed (não null)", async () => {
    const cause = new Error("Could not decrypt the item");
    const store = createLocalPreferencesStore(
      createSecureKeyValueStore({
        getItemAsync: async () => {
          throw cause;
        },
        setItemAsync: async () => {},
        deleteItemAsync: async () => {},
      }),
    );
    const error = await failure(store.read());
    expect(error.kind).toBe("read_failed");
    expect(error.cause).toBe(cause);
  });

  it("falha na gravação e na remoção: write_failed", async () => {
    const store = createLocalPreferencesStore(
      createSecureKeyValueStore({
        getItemAsync: async () => null,
        setItemAsync: async () => {
          throw new Error("keystore indisponível");
        },
        deleteItemAsync: async () => {
          throw new Error("keystore indisponível");
        },
      }),
    );
    expect((await failure(store.save({ wantsWork: true, wantsToHire: true }))).kind).toBe(
      "write_failed",
    );
    expect((await failure(store.clear())).kind).toBe("write_failed");
  });

  it("dado inválido guardado no SecureStore: invalid_data, sem apagar", async () => {
    const { secureStore, data } = fakeSecureStore({ [PREFERENCES_STORAGE_KEY]: "lixo" });
    const store = createLocalPreferencesStore(createSecureKeyValueStore(secureStore));
    expect((await failure(store.read())).kind).toBe("invalid_data");
    expect(data.get(PREFERENCES_STORAGE_KEY)).toBe("lixo");
  });

  it("save inválido não chama o SecureStore", async () => {
    const { secureStore, calls } = fakeSecureStore();
    const store = createLocalPreferencesStore(createSecureKeyValueStore(secureStore));
    await failure(store.save({ wantsWork: false, wantsToHire: false }));
    expect(calls).toEqual([]);
  });
});
