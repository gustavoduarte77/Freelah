import { updatePreferencesSchema, type Preferences } from "./preferences";

/** Única chave que este módulo lê, grava ou remove (válida também para o SecureStore: [\w.-]+). */
export const PREFERENCES_STORAGE_KEY = "freelah.preferences";

export type PreferencesStorageErrorKind =
  | "unavailable" // o armazenamento do aparelho/navegador não está acessível
  | "read_failed" // a leitura falhou
  | "write_failed" // a gravação ou a remoção falhou
  | "invalid_data"; // há algo gravado (ou foi pedido para gravar) que não segue o contrato

/** Erro explícito de armazenamento: nunca é o mesmo que "ainda não há preferências". */
export class PreferencesStorageError extends Error {
  readonly kind: PreferencesStorageErrorKind;

  constructor(kind: PreferencesStorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PreferencesStorageError";
    this.kind = kind;
  }
}

/** Armazenamento local de preferências, igual na Web e no celular. */
export interface LocalPreferencesStore {
  /** `null` somente quando nada foi gravado. Lança PreferencesStorageError em qualquer falha. */
  read(): Promise<Preferences | null>;
  /** Valida antes de tocar no armazenamento. Lança se não conseguir gravar. */
  save(preferences: Preferences): Promise<void>;
  /** Remove somente a chave de preferências. */
  clear(): Promise<void>;
}

/** Armazenamento de chave e valor que os adaptadores implementam. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function asStorageError(
  error: unknown,
  kind: "read_failed" | "write_failed",
  message: string,
): PreferencesStorageError {
  return error instanceof PreferencesStorageError
    ? error
    : new PreferencesStorageError(kind, message, { cause: error });
}

function parseStored(raw: unknown): Preferences {
  if (typeof raw !== "string") {
    throw new PreferencesStorageError(
      "invalid_data",
      "As preferências gravadas neste aparelho não estão em um formato válido.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new PreferencesStorageError(
      "invalid_data",
      "As preferências gravadas neste aparelho estão corrompidas.",
      { cause: error },
    );
  }
  const parsed = updatePreferencesSchema.safeParse(json);
  if (!parsed.success) {
    throw new PreferencesStorageError(
      "invalid_data",
      "As preferências gravadas neste aparelho não seguem o formato esperado.",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export function createLocalPreferencesStore(backend: KeyValueStore): LocalPreferencesStore {
  return {
    async read() {
      let raw: string | null;
      try {
        raw = await backend.getItem(PREFERENCES_STORAGE_KEY);
      } catch (error) {
        throw asStorageError(error, "read_failed", "Não foi possível ler as preferências deste aparelho.");
      }
      return raw === null ? null : parseStored(raw);
    },

    async save(preferences) {
      const parsed = updatePreferencesSchema.safeParse(preferences);
      if (!parsed.success) {
        throw new PreferencesStorageError(
          "invalid_data",
          "Não é possível guardar essas preferências: elas não seguem o formato esperado.",
          { cause: parsed.error },
        );
      }
      try {
        await backend.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(parsed.data));
      } catch (error) {
        throw asStorageError(error, "write_failed", "Não foi possível guardar as preferências neste aparelho.");
      }
    },

    async clear() {
      try {
        await backend.removeItem(PREFERENCES_STORAGE_KEY);
      } catch (error) {
        throw asStorageError(error, "write_failed", "Não foi possível remover as preferências deste aparelho.");
      }
    },
  };
}

/** Parte do `Storage` do navegador (localStorage) que o adaptador usa. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Adaptador da Web. Recebe uma função que devolve o localStorage, porque só de acessá-lo o
 * navegador pode lançar SecurityError (cookies bloqueados, modo privado).
 */
export function createWebKeyValueStore(
  getStorage: () => StorageLike | null | undefined,
): KeyValueStore {
  function storage(): StorageLike {
    let found: StorageLike | null | undefined;
    try {
      found = getStorage();
    } catch (error) {
      throw new PreferencesStorageError(
        "unavailable",
        "O navegador não permite guardar dados neste site (localStorage bloqueado).",
        { cause: error },
      );
    }
    if (!found) {
      throw new PreferencesStorageError(
        "unavailable",
        "Este navegador não oferece localStorage.",
      );
    }
    return found;
  }

  return {
    async getItem(key) {
      const store = storage();
      try {
        return store.getItem(key);
      } catch (error) {
        throw new PreferencesStorageError("read_failed", "Falha ao ler o localStorage.", {
          cause: error,
        });
      }
    },
    async setItem(key, value) {
      const store = storage();
      try {
        store.setItem(key, value);
      } catch (error) {
        throw new PreferencesStorageError("write_failed", "Falha ao gravar no localStorage.", {
          cause: error,
        });
      }
    },
    async removeItem(key) {
      const store = storage();
      try {
        store.removeItem(key);
      } catch (error) {
        throw new PreferencesStorageError("write_failed", "Falha ao remover do localStorage.", {
          cause: error,
        });
      }
    },
  };
}

/** Parte do `expo-secure-store` que o adaptador usa (passada pelo app, sem importar o Expo aqui). */
export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Adaptador do celular (iOS e Android), sobre o expo-secure-store. */
export function createSecureKeyValueStore(secureStore: SecureStoreLike): KeyValueStore {
  return {
    async getItem(key) {
      try {
        return await secureStore.getItemAsync(key);
      } catch (error) {
        throw new PreferencesStorageError("read_failed", "Falha ao ler do SecureStore.", {
          cause: error,
        });
      }
    },
    async setItem(key, value) {
      try {
        await secureStore.setItemAsync(key, value);
      } catch (error) {
        throw new PreferencesStorageError("write_failed", "Falha ao gravar no SecureStore.", {
          cause: error,
        });
      }
    },
    async removeItem(key) {
      try {
        await secureStore.deleteItemAsync(key);
      } catch (error) {
        throw new PreferencesStorageError("write_failed", "Falha ao remover do SecureStore.", {
          cause: error,
        });
      }
    },
  };
}
