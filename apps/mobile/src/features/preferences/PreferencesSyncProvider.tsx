import type { InvalidLocalChoice, Preferences, PreferencesSyncState } from "@freelah/shared";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useSessionState } from "../auth/SessionState";
import { preferencesSync } from "./preferencesSync";

/** Liga a sessão do Better Auth à sincronização de preferências. Não altera rotas nem telas. */
export function PreferencesSyncProvider({ children }: { children: ReactNode }) {
  const { state } = useSessionState();
  const status = state.status;
  const userId = state.status === "authenticated" ? state.session.user.id : null;

  useEffect(() => {
    if (userId) {
      preferencesSync.start(userId);
    } else if (status === "unauthenticated") {
      // Só a API confirmar que não há sessão conta como logout.
      preferencesSync.stop();
      preferencesSync.startVisitor();
    } else if (status === "unknown" && preferencesSync.getState().status === "signed_out") {
      // Não deu para consultar a sessão (API fora do ar) com o app recém-aberto: não é logout e
      // nada é apagado, mas a pessoa ainda precisa ver as preferências deste aparelho.
      preferencesSync.startVisitor();
    }
  }, [userId, status]);

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
export function preferencesScreenFor(state: PreferencesSyncState): PreferencesScreenKind | null {
  switch (state.status) {
    case "signed_out": // a sessão ainda está sendo consultada
      return "loading";
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
