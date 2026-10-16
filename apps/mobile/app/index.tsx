import type { Preferences, PreferencesSyncState } from "@freelah/shared";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Button } from "../src/components/ui";
import { LandingPage } from "../src/features/home/LandingPage";
import { authClient } from "../src/lib/auth-client";
import { preferencesScreenFor, usePreferencesSync } from "../src/features/preferences/PreferencesSyncProvider";
import {
  InvalidLocalRecovery,
  LocalStorageError,
  OnboardingScreen,
  PreferencesLoading,
} from "../src/features/preferences/PreferencesScreen";

/** Preferências só ordenam os atalhos; nunca restringem a exploração pública. */
function knownPreferences(state: PreferencesSyncState): Preferences | null {
  switch (state.status) {
    case "synced":
    case "visitor_ready":
      return state.preferences;
    case "error":
      return state.accountPreferences;
    default:
      return null;
  }
}

export default function Index() {
  const router = useRouter();
  const { state, retry, complete, resolveInvalidLocal } = usePreferencesSync();
  const [showPreferences, setShowPreferences] = useState(false);
  const screen = preferencesScreenFor(state);

  // Encerra o painel quando a sincronização confirma que as preferências estão prontas.
  if (showPreferences && screen === null) setShowPreferences(false);

  // O fluxo existente de preferências continua disponível sem substituir a primeira visita.
  let panel: ReactNode = null;
  if (showPreferences) {
    if (screen === "loading") panel = <PreferencesLoading />;
    if (screen === "onboarding" && (state.status === "needs_onboarding" || state.status === "visitor_needs_onboarding")) {
      panel = (
        <OnboardingScreen
          saving={state.saving}
          saveError={state.saveError}
          signedIn={state.status === "needs_onboarding"}
          onSubmit={(preferences) => void complete(preferences)}
          onSignIn={() => router.push("/entrar")}
          onSignOut={async () => { await authClient.signOut(); }}
        />
      );
    }
    if (screen === "invalid_local" && (state.status === "error" || state.status === "visitor_error")) {
      panel = (
        <InvalidLocalRecovery
          accountPreferences={state.status === "error" ? state.accountPreferences : null}
          busy={state.busy}
          actionError={state.actionError}
          onUseAccount={() => void resolveInvalidLocal("use_account")}
          onDiscard={() => void resolveInvalidLocal("discard")}
        />
      );
    }
    if (screen === "local_error" && state.status === "visitor_error") {
      panel = <LocalStorageError error={state.error} busy={state.busy} onRetry={retry} />;
    }
  }

  if (panel) {
    return (
      <View style={{ flex: 1 }}>
        <Button title="Voltar ao início" variant="link" onPress={() => setShowPreferences(false)} />
        {panel}
      </View>
    );
  }

  const preferences = knownPreferences(state);
  return (
    <LandingPage
      publishFirst={Boolean(preferences?.wantsToHire && !preferences.wantsWork)}
      onPreferences={screen === "onboarding" || screen === "invalid_local" || screen === "local_error" ? () => setShowPreferences(true) : undefined}
      preferencesNeedRecovery={screen === "invalid_local" || screen === "local_error"}
    />
  );
}
