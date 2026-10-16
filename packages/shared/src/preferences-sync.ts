import {
  PreferencesApiError,
  type PreferencesApi,
  type PreferencesApiErrorKind,
} from "./preferences-api";
import { updatePreferencesSchema, type Preferences } from "./preferences";
import {
  PreferencesStorageError,
  type LocalPreferencesStore,
  type PreferencesStorageErrorKind,
} from "./preferences-storage";

/** Onde o problema aconteceu: na conta (API) ou neste aparelho (armazenamento local). */
export interface PreferencesSyncError {
  source: "account" | "device";
  kind: PreferencesApiErrorKind | PreferencesStorageErrorKind | "unexpected";
  message: string;
}

export type PreferencesSyncResult =
  | { status: "synced"; preferences: Preferences }
  | { status: "needs_onboarding" }
  | {
      status: "error";
      error: PreferencesSyncError;
      /** Preferências da conta, quando a API as devolveu antes do erro (nunca `null` por falha). */
      accountPreferences: Preferences | null;
    };

/** `wroteLocal`: a execução gravou no armazenamento local (precisa ser desfeito se foi cancelada). */
type RunOutcome = PreferencesSyncResult & { wroteLocal: boolean };

const same = (a: Preferences, b: Preferences) =>
  a.wantsWork === b.wantsWork && a.wantsToHire === b.wantsToHire;

function accountError(error: unknown): PreferencesSyncError {
  if (error instanceof PreferencesApiError) {
    return { source: "account", kind: error.kind, message: error.message };
  }
  return { source: "account", kind: "unexpected", message: "Erro inesperado ao falar com a conta." };
}

function deviceError(error: unknown): PreferencesSyncError {
  if (error instanceof PreferencesStorageError) {
    return { source: "device", kind: error.kind, message: error.message };
  }
  return { source: "device", kind: "unexpected", message: "Erro inesperado no armazenamento deste aparelho." };
}

/**
 * Sincroniza uma vez as preferências locais com as da conta autenticada.
 *
 * Regras: a conta é lida primeiro (se falhar, nada muda); se a conta tem, ela prevalece e
 * atualiza o local; se a API confirmou que não tem e o local é válido, o local é enviado;
 * sem nenhum dos dois, a pessoa precisa do onboarding. Falhas nunca são tratadas como "não há
 * preferências" e dado local inválido nunca é apagado nem sobrescrito.
 *
 * `isCancelled` é consultado depois de cada espera e antes de qualquer escrita; se a execução
 * foi cancelada (logout, outro usuário), nada mais é gravado nem enviado.
 */
export async function syncPreferences(deps: {
  api: PreferencesApi;
  local: LocalPreferencesStore;
  isCancelled?: () => boolean;
}): Promise<RunOutcome> {
  const { api, local } = deps;
  const cancelled = deps.isCancelled ?? (() => false);
  let wroteLocal = false;
  const fail = (error: PreferencesSyncError, accountPreferences: Preferences | null): RunOutcome => ({
    status: "error",
    error,
    accountPreferences,
    wroteLocal,
  });
  const stopped = (): RunOutcome => fail(
    { source: "device", kind: "unexpected", message: "Sincronização cancelada." },
    null,
  );

  let account: Preferences | null;
  try {
    account = await api.get();
  } catch (error) {
    return fail(accountError(error), null);
  }
  if (cancelled()) return stopped();

  let stored: Preferences | null;
  try {
    stored = await local.read();
  } catch (error) {
    // Dado local inválido ou ilegível: não é apagado nem sobrescrito.
    return fail(deviceError(error), account);
  }
  if (cancelled()) return stopped();

  if (account) {
    if (stored && same(stored, account)) return { status: "synced", preferences: account, wroteLocal };
    try {
      await local.save(account);
      wroteLocal = true;
    } catch (error) {
      return fail(deviceError(error), account);
    }
    return { status: "synced", preferences: account, wroteLocal };
  }

  if (!stored) return { status: "needs_onboarding", wroteLocal };

  let saved: Preferences;
  try {
    saved = await api.put(stored);
  } catch (error) {
    return fail(accountError(error), null);
  }
  if (cancelled()) return stopped();
  if (!same(saved, stored)) {
    try {
      await local.save(saved);
      wroteLocal = true;
    } catch (error) {
      return fail(deviceError(error), saved);
    }
  }
  return { status: "synced", preferences: saved, wroteLocal };
}

/** Campos das telas de erro: `busy` durante uma ação de recuperação; `actionError` se ela falhou. */
interface ErrorExtras {
  busy: boolean;
  actionError: PreferencesSyncError | null;
}

/** Campos da tela de onboarding: `saving` durante o envio; `saveError` se ele falhou. */
interface OnboardingExtras {
  saving: boolean;
  saveError: PreferencesSyncError | null;
}

export type PreferencesSyncState =
  | { status: "signed_out" }
  // Com sessão:
  | { status: "syncing"; userId: string }
  | { status: "synced"; userId: string; preferences: Preferences }
  | ({ status: "needs_onboarding"; userId: string } & OnboardingExtras)
  | ({
      status: "error";
      userId: string;
      error: PreferencesSyncError;
      accountPreferences: Preferences | null;
    } & ErrorExtras)
  // Visitante (sem sessão): só lê e grava o armazenamento local, nunca fala com a API.
  | { status: "visitor_loading" }
  | { status: "visitor_ready"; preferences: Preferences }
  | ({ status: "visitor_needs_onboarding" } & OnboardingExtras)
  | ({ status: "visitor_error"; error: PreferencesSyncError } & ErrorExtras);

export type InvalidLocalChoice =
  /** Regrava o local com as preferências da conta (só existe se a conta as tem). */
  | "use_account"
  /** Apaga o dado local inválido e refaz a leitura/sincronização. */
  | "discard";

export interface PreferencesSyncController {
  getState(): PreferencesSyncState;
  /** Compatível com `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
  /** Sessão válida de `userId`. Repetir a chamada para o mesmo usuário não refaz a sincronização. */
  start(userId: string): void;
  /** Sessão resolvida e sem usuário: lê o armazenamento local (sem tocar na API). Idempotente. */
  startVisitor(): void;
  /** Logout (ou sessão expirada) confirmado. Apaga a cópia local só se ela já estava sincronizada. */
  stop(): void;
  /** Tenta de novo depois de um erro. */
  retry(): void;
  /**
   * Conclui o onboarding. Visitante: grava só no local. Com sessão: `PUT` na conta e depois grava
   * no local; só vira `synced` quando os dois terminam. Ignorada se já houver um envio em andamento.
   */
  complete(preferences: Preferences): Promise<void>;
  /** Recuperação de dado local inválido; só acontece por ação explícita de quem usa o app. */
  resolveInvalidLocal(choice: InvalidLocalChoice): Promise<void>;
}

const ACCOUNT_STATUSES = new Set(["syncing", "synced", "needs_onboarding", "error"]);

function userIdOf(state: PreferencesSyncState): string | null {
  return ACCOUNT_STATUSES.has(state.status) ? (state as { userId: string }).userId : null;
}

const isVisitor = (state: PreferencesSyncState) => state.status.startsWith("visitor_");

export function createPreferencesSyncController(deps: {
  api: PreferencesApi;
  local: LocalPreferencesStore;
}): PreferencesSyncController {
  const { api, local } = deps;
  let state: PreferencesSyncState = { status: "signed_out" };
  const listeners = new Set<() => void>();
  let runId = 0;
  let lastRun: Promise<void> = Promise.resolve();
  let pendingCleanup = false;
  let cleaning: Promise<boolean> | null = null;

  function setState(next: PreferencesSyncState) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Remove a cópia local que pertencia ao usuário anterior. Nunca rejeita. */
  function ensureCleaned(): Promise<boolean> {
    if (!pendingCleanup) return Promise.resolve(true);
    cleaning ??= Promise.resolve()
      .then(() => local.clear())
      .then(
        () => {
          pendingCleanup = false;
          return true;
        },
        () => false,
      )
      .finally(() => {
        cleaning = null;
      });
    return cleaning;
  }

  /** Enfileira uma operação: nunca duas ao mesmo tempo, na ordem em que foram pedidas. */
  function enqueue(task: () => Promise<void>): Promise<void> {
    const previous = lastRun;
    const run = (async () => {
      await previous;
      try {
        await task();
      } catch {
        // as tarefas tratam os próprios erros; isto só impede a fila de travar
      }
    })();
    lastRun = run;
    return run;
  }

  const cleanupError = (): PreferencesSyncError => ({
    source: "device",
    kind: "write_failed",
    message: "Não foi possível remover as preferências do usuário anterior deste aparelho.",
  });

  function errorState(
    userId: string,
    error: PreferencesSyncError,
    accountPreferences: Preferences | null,
  ): PreferencesSyncState {
    return { status: "error", userId, error, accountPreferences, busy: false, actionError: null };
  }

  function startRun(userId: string) {
    const id = ++runId;
    const isCancelled = () => id !== runId;
    setState({ status: "syncing", userId });
    void enqueue(async () => {
      if (isCancelled()) return;
      // A cópia de um usuário anterior precisa sair antes de qualquer leitura do novo usuário.
      if (!(await ensureCleaned())) {
        if (!isCancelled()) setState(errorState(userId, cleanupError(), null));
        return;
      }
      if (isCancelled()) return;

      let outcome: RunOutcome;
      try {
        outcome = await syncPreferences({ api, local, isCancelled });
      } catch (error) {
        outcome = {
          status: "error",
          error: deviceError(error),
          accountPreferences: null,
          wroteLocal: false,
        };
      }
      if (isCancelled()) {
        // Gravou para um usuário que já saiu: a cópia precisa ser removida antes do próximo.
        if (outcome.wroteLocal) pendingCleanup = true;
        return;
      }
      if (outcome.status === "synced") {
        setState({ status: "synced", userId, preferences: outcome.preferences });
      } else if (outcome.status === "needs_onboarding") {
        setState({ status: "needs_onboarding", userId, saving: false, saveError: null });
      } else {
        setState(errorState(userId, outcome.error, outcome.accountPreferences));
      }
    });
  }

  function startVisitorRun() {
    const id = ++runId;
    const isCancelled = () => id !== runId;
    setState({ status: "visitor_loading" });
    void enqueue(async () => {
      if (isCancelled()) return;
      // Depois de um logout, a cópia do usuário anterior não pode aparecer como escolha do visitante.
      if (!(await ensureCleaned())) {
        if (!isCancelled()) {
          setState({
            status: "visitor_error",
            error: cleanupError(),
            busy: false,
            actionError: null,
          });
        }
        return;
      }
      if (isCancelled()) return;
      try {
        const stored = await local.read();
        if (isCancelled()) return;
        setState(
          stored
            ? { status: "visitor_ready", preferences: stored }
            : { status: "visitor_needs_onboarding", saving: false, saveError: null },
        );
      } catch (error) {
        if (isCancelled()) return;
        setState({ status: "visitor_error", error: deviceError(error), busy: false, actionError: null });
      }
    });
  }

  function leave() {
    const wasSynced = state.status === "synced";
    runId++; // cancela qualquer execução em andamento
    setState({ status: "signed_out" });
    if (wasSynced) {
      pendingCleanup = true;
      void ensureCleaned();
    }
  }

  async function completeAsVisitor(preferences: Preferences, id: number) {
    try {
      await local.save(preferences);
    } catch (error) {
      if (id === runId) {
        setState({ status: "visitor_needs_onboarding", saving: false, saveError: deviceError(error) });
      }
      return;
    }
    // Se a sessão começou no meio do envio, a escolha já está no local e a sincronização a usará.
    if (id === runId) setState({ status: "visitor_ready", preferences });
  }

  async function completeWithAccount(preferences: Preferences, userId: string, id: number) {
    const isCancelled = () => id !== runId;
    let saved: Preferences;
    try {
      saved = await api.put(preferences);
    } catch (error) {
      if (!isCancelled()) {
        setState({ status: "needs_onboarding", userId, saving: false, saveError: accountError(error) });
      }
      return;
    }
    if (isCancelled()) return; // a conta de quem saiu recebeu a escolha dela; nada local é gravado
    try {
      await local.save(saved);
    } catch (error) {
      if (isCancelled()) return;
      // Salvo na conta, mas não neste aparelho: o estado diz isso explicitamente.
      setState(errorState(userId, deviceError(error), saved));
      return;
    }
    if (isCancelled()) {
      pendingCleanup = true;
      return;
    }
    setState({ status: "synced", userId, preferences: saved });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start(userId) {
      const current = userIdOf(state);
      if (current !== null) {
        if (current === userId) return;
        leave();
      }
      startRun(userId);
    },

    startVisitor() {
      if (isVisitor(state)) return;
      if (userIdOf(state) !== null) leave();
      startVisitorRun();
    },

    stop() {
      if (userIdOf(state) !== null) leave();
    },

    retry() {
      if (state.status === "error" && !state.busy) startRun(state.userId);
      else if (state.status === "visitor_error" && !state.busy) startVisitorRun();
    },

    complete(preferences) {
      const current = state;
      if (
        (current.status !== "needs_onboarding" && current.status !== "visitor_needs_onboarding") ||
        current.saving
      ) {
        return Promise.resolve();
      }
      if (!updatePreferencesSchema.safeParse(preferences).success) {
        const saveError: PreferencesSyncError = {
          source: "device",
          kind: "invalid_data",
          message: "Escolha pelo menos uma opção para continuar.",
        };
        setState({ ...current, saveError });
        return Promise.resolve();
      }
      const id = runId;
      setState({ ...current, saving: true, saveError: null });
      return enqueue(async () => {
        if (id !== runId) return;
        if (current.status === "visitor_needs_onboarding") {
          await completeAsVisitor(preferences, id);
        } else {
          await completeWithAccount(preferences, current.userId, id);
        }
      });
    },

    resolveInvalidLocal(choice) {
      const current = state;
      if (
        (current.status !== "error" && current.status !== "visitor_error") ||
        current.busy ||
        current.error.kind !== "invalid_data" ||
        current.error.source !== "device"
      ) {
        return Promise.resolve();
      }
      const account = current.status === "error" ? current.accountPreferences : null;
      if (choice === "use_account" && !account) return Promise.resolve();
      const id = runId;
      setState({ ...current, busy: true, actionError: null });
      return enqueue(async () => {
        if (id !== runId) return;
        try {
          if (choice === "use_account" && account && current.status === "error") {
            await local.save(account);
            if (id !== runId) {
              pendingCleanup = true;
              return;
            }
            setState({ status: "synced", userId: current.userId, preferences: account });
          } else {
            await local.clear();
            if (id !== runId) return;
            if (current.status === "error") startRun(current.userId);
            else startVisitorRun();
          }
        } catch (error) {
          if (id !== runId) return;
          setState({ ...current, busy: false, actionError: deviceError(error) });
        }
      });
    },
  };
}
