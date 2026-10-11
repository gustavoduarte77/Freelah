import type { PreferencesSyncState } from "@freelah/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../src/components/ui";
import { API_URL } from "../src/lib/api";
import { authClient } from "../src/lib/auth-client";
import { useApiHealth } from "../src/features/health/useApiHealth";
import {
  preferencesScreenFor,
  usePreferencesSync,
} from "../src/features/preferences/PreferencesSyncProvider";
import {
  InvalidLocalRecovery,
  LocalStorageError,
  OnboardingScreen,
  PreferencesLoading,
} from "../src/features/preferences/PreferencesScreen";

// TEMPORÁRIO (junto com a linha de status das preferências abaixo).
function describePreferencesSync(state: PreferencesSyncState): string {
  switch (state.status) {
    case "signed_out":
      return "sem sessão";
    case "syncing":
      return "sincronizando…";
    case "synced":
      return `sincronizadas (trabalhar: ${state.preferences.wantsWork ? "sim" : "não"}, contratar: ${state.preferences.wantsToHire ? "sim" : "não"})`;
    case "needs_onboarding":
      return "aguardando onboarding";
    case "error": {
      const where = state.error.source === "account" ? "conta" : "este aparelho";
      const saved = state.error.source === "device" && state.accountPreferences !== null;
      return `erro (${where}: ${state.error.kind}) — ${
        saved ? "as preferências foram salvas na conta, mas a gravação neste aparelho falhou. " : ""
      }${state.error.message}`;
    }
    case "visitor_loading":
      return "lendo as preferências deste aparelho…";
    case "visitor_ready":
      return `escolha deste aparelho (trabalhar: ${state.preferences.wantsWork ? "sim" : "não"}, contratar: ${state.preferences.wantsToHire ? "sim" : "não"}) — ainda não está em nenhuma conta`;
    case "visitor_needs_onboarding":
      return "aguardando onboarding";
    case "visitor_error":
      return `erro (este aparelho: ${state.error.kind}) — ${state.error.message}`;
  }
}

export default function Index() {
  const { state, retry } = useApiHealth();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const {
    state: prefsState,
    retry: retryPrefs,
    complete,
    resolveInvalidLocal,
  } = usePreferencesSync();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  // Onboarding, recuperação e carregamento das preferências substituem só o conteúdo desta tela.
  const screen = preferencesScreenFor(prefsState, !isPending && !session);
  if (screen === "loading") return <PreferencesLoading />;
  if (screen === "onboarding" && (prefsState.status === "needs_onboarding" || prefsState.status === "visitor_needs_onboarding")) {
    return (
      <OnboardingScreen
        saving={prefsState.saving}
        saveError={prefsState.saveError}
        signedIn={prefsState.status === "needs_onboarding"}
        onSubmit={(preferences) => void complete(preferences)}
        onSignIn={() => router.push("/entrar")}
        onSignOut={signOut}
      />
    );
  }
  if (screen === "invalid_local" && (prefsState.status === "error" || prefsState.status === "visitor_error")) {
    return (
      <InvalidLocalRecovery
        accountPreferences={prefsState.status === "error" ? prefsState.accountPreferences : null}
        busy={prefsState.busy}
        actionError={prefsState.actionError}
        onUseAccount={() => void resolveInvalidLocal("use_account")}
        onDiscard={() => void resolveInvalidLocal("discard")}
      />
    );
  }
  if (screen === "local_error" && prefsState.status === "visitor_error") {
    return <LocalStorageError error={prefsState.error} busy={prefsState.busy} onRetry={retryPrefs} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.brand}>Freelah</Text>
        <Text style={styles.tagline}>
          Encontre uma oportunidade ou alguém para seu serviço.
        </Text>

        <View style={styles.statusBox}>
          {isPending ? (
            <ActivityIndicator />
          ) : session ? (
            <>
              <Text style={styles.statusLabel}>Você entrou como</Text>
              <Text style={styles.statusText}>{session.user.name}</Text>
              <Text style={styles.hint}>{session.user.email}</Text>
              <Button title="Sair" variant="link" onPress={signOut} loading={signingOut} />
            </>
          ) : (
            <>
              <Button title="Entrar" onPress={() => router.push("/entrar")} />
              <Button
                title="Criar conta"
                variant="link"
                onPress={() => router.push("/cadastrar")}
              />
            </>
          )}
        </View>

        {/* TEMPORÁRIO: status das preferências (visitante ou com sessão). Remover quando esta
            tela provisória for substituída (Etapa 4). */}
        <View style={styles.statusBox} accessibilityLiveRegion="polite" testID="preferences-sync-status">
          <Text style={styles.statusLabel}>Preferências (temporário)</Text>
          <Text style={styles.hint}>{describePreferencesSync(prefsState)}</Text>
          {prefsState.status === "error" && (
            <Pressable onPress={retryPrefs} style={styles.button} accessibilityRole="button">
              <Text style={styles.buttonText}>Tentar sincronizar de novo</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.statusBox} accessibilityLiveRegion="polite">
          <Text style={styles.statusLabel}>Status da API</Text>
          {state.status === "loading" && (
            <View style={styles.row}>
              <ActivityIndicator />
              <Text style={styles.statusText}>Conectando…</Text>
            </View>
          )}
          {state.status === "online" && (
            <Text style={[styles.statusText, styles.ok]}>
              ● Online ({state.data.service})
            </Text>
          )}
          {state.status === "offline" && (
            <>
              <Text style={[styles.statusText, styles.error]}>● Offline</Text>
              <Text style={styles.hint}>{state.message}</Text>
              <Pressable onPress={retry} style={styles.button} accessibilityRole="button">
                <Text style={styles.buttonText}>Tentar novamente</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.hint}>{API_URL}</Text>
        </View>

        <Text style={styles.footer}>Etapa 2 — autenticação</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  brand: { fontSize: 36, fontWeight: "800", color: "#0F6B5C" },
  tagline: { fontSize: 16, color: "#3C4650" },
  statusBox: {
    backgroundColor: "#F6F4EF",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  statusLabel: { fontSize: 13, fontWeight: "600", color: "#6B7580" },
  statusText: { fontSize: 18, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  ok: { color: "#1B7F4B" },
  error: { color: "#B3261E" },
  hint: { fontSize: 13, color: "#6B7580" },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#0F6B5C",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
  footer: { fontSize: 12, color: "#9AA3AB" },
});
