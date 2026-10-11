import type { InvalidLocalChoice, Preferences, PreferencesSyncState } from "@freelah/shared";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { preferencesSync } from "./preferencesSync";

/** Liga a sessão do Better Auth à sincronização de preferências. Não altera rotas nem telas. */
export function PreferencesSyncProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error } = authClient.useSession();
  const userId = data?.user.id ?? null;

  useEffect(() => {
    if (userId) {
      preferencesSync.start(userId);
    } else if (!isPending && !error) {
      // Só sessão resolvida e sem usuário conta como logout; carregando ou com erro, não.
      preferencesSync.stop();
      preferencesSync.startVisitor();
    }
  }, [userId, isPending, error]);

  return <>{children}</>;
}

export function usePreferencesSync(): {
  state: PreferencesSyncState;
  retry: () => void;
  complete: (preferences: Preferences) => Promise<void>;
  resolveInvalidLocal: (choice: InvalidLocalChoice) => Promise<void>;
} {
  const state = useSyncExternalStore(
    preferencesSync.subscribe,
    preferencesSync.getState,
    preferencesSync.getState,
  );
  return {
    state,
    retry: preferencesSync.retry,
    complete: preferencesSync.complete,
    resolveInvalidLocal: preferencesSync.resolveInvalidLocal,
  };
}

export type PreferencesScreenKind = "loading" | "onboarding" | "invalid_local" | "local_error";

/**
 * Qual tela de preferências substitui o conteúdo da tela inicial (ou `null` para mostrar a tela
 * normal). Erros de rede/API de quem já tem sessão não bloqueiam: aparecem na linha de status.
 */
export function preferencesScreenFor(
  state: PreferencesSyncState,
  sessionResolvedWithoutUser: boolean,
): PreferencesScreenKind | null {
  switch (state.status) {
    case "signed_out":
      return sessionResolvedWithoutUser ? "loading" : null;
    case "visitor_loading":
    case "syncing":
      return "loading";
    case "needs_onboarding":
    case "visitor_needs_onboarding":
      return "onboarding";
    case "error":
      return state.error.source === "device" && state.error.kind === "invalid_data"
        ? "invalid_local"
        : null;
    case "visitor_error":
      return state.error.kind === "invalid_data" ? "invalid_local" : "local_error";
    default:
      return null;
  }
}
