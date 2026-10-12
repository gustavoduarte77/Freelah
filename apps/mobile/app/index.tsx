import type { Preferences, PreferencesSyncState } from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../src/components/ui";
import { API_URL } from "../src/lib/api";
import { authClient } from "../src/lib/auth-client";
import { useSessionState } from "../src/features/auth/SessionState";
import { useApiHealth } from "../src/features/health/useApiHealth";
import {
  CategoryChips,
  ConnectionBanner,
  EmptyBox,
  ErrorBox,
  JobCard,
  LoadingBox,
  StaleNotice,
} from "../src/features/jobs/components";
import { useCategories, useJobsList } from "../src/features/jobs/hooks";
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

/** Preferências já conhecidas, só para ordenar os atalhos (PRD 30.3); nunca restringem nada. */
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

// Constante fora do componente: os mesmos filtros em toda renderização.
const RECENT_PARAMS = { limit: 4 };

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
  const { state } = useApiHealth();
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();
  const session = sessionState.status === "authenticated" ? sessionState.session : null;
  const {
    state: prefsState,
    retry: retryPrefs,
    complete,
    resolveInvalidLocal,
  } = usePreferencesSync();
  const [signingOut, setSigningOut] = useState(false);
  const [search, setSearch] = useState("");
  const categories = useCategories();
  const recent = useJobsList("home", RECENT_PARAMS);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
    }
  }

  // Onboarding, recuperação e carregamento das preferências substituem só o conteúdo desta tela.
  const screen = preferencesScreenFor(prefsState);
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

  // A preferência só muda a ordem dos dois atalhos: os dois continuam visíveis para todos.
  const preferences = knownPreferences(prefsState);
  const publishFirst = Boolean(preferences?.wantsToHire && !preferences.wantsWork);
  const findWork = (
    <View key="find" style={styles.publish}>
      <Button title="Encontrar trabalho" onPress={() => router.push("/explorar")} />
      {session ? (
        <Button
          title="Meus interesses"
          variant="link"
          onPress={() => router.push("/meus-interesses" as Href)}
        />
      ) : null}
      {session ? (
        <Button title="Mensagens" variant="link" onPress={() => router.push("/mensagens" as Href)} />
      ) : null}
    </View>
  );
  const publish = (
    <View key="publish" style={styles.publish}>
      <Button title="Publicar oportunidade" onPress={() => router.push("/publicar")} />
      {session ? (
        <Button
          title="Minhas oportunidades"
          variant="link"
          onPress={() => router.push("/minhas-oportunidades")}
        />
      ) : null}
    </View>
  );

  function submitSearch() {
    router.push({ pathname: "/explorar", params: search.trim() ? { q: search.trim() } : {} });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>Freelah</Text>
        <Text style={styles.tagline}>
          Encontre uma oportunidade ou alguém para seu serviço.
        </Text>

        <ConnectionBanner />

        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={submitSearch}
          placeholder="Buscar serviço ou oportunidade"
          accessibilityLabel="Buscar oportunidades"
          returnKeyType="search"
          style={styles.search}
        />
        <View style={styles.actions}>{publishFirst ? [publish, findWork] : [findWork, publish]}</View>

        <Text style={styles.sectionTitle}>Categorias</Text>
        {categories.state.status === "ready" ? (
          <CategoryChips
            categories={categories.state.data}
            selected={null}
            onSelect={(slug) =>
              router.push({ pathname: "/explorar", params: slug ? { category: slug } : {} })
            }
          />
        ) : categories.state.status === "error" ? (
          <ErrorBox error={categories.state.error} onRetry={categories.retry} />
        ) : (
          <LoadingBox label="Carregando categorias…" />
        )}

        <Text style={styles.sectionTitle}>Oportunidades recentes</Text>
        {recent.state.status === "loading" ? (
          <LoadingBox label="Carregando oportunidades…" />
        ) : recent.state.status === "error" ? (
          <ErrorBox error={recent.state.error} onRetry={recent.retry} />
        ) : (
          <View style={styles.recent}>
            <StaleNotice
              loadedAt={recent.state.loadedAt}
              refreshing={recent.state.refreshing}
              failed={recent.state.refreshError !== null}
            />
            {recent.state.jobs.length === 0 ? (
              <EmptyBox
                title="Ainda não há oportunidades abertas"
                text="Volte em breve: novas oportunidades aparecem aqui."
              />
            ) : (
              <>
                {recent.state.jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
                <Button
                  title="Ver todas as oportunidades"
                  variant="link"
                  onPress={() => router.push("/explorar")}
                />
              </>
            )}
          </View>
        )}

        <View style={styles.statusBox}>
          {sessionState.status === "loading" ? (
            <ActivityIndicator />
          ) : sessionState.status === "unknown" ? (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert">
              <Text style={styles.statusLabel}>Sessão</Text>
              <Text style={styles.statusText}>Não foi possível verificar sua sessão</Text>
              <Text style={styles.hint}>
                O Freelah não conseguiu falar com o servidor. Sua conta e seus dados não foram
                alterados. Vamos tentar de novo sozinhos.
              </Text>
              <Pressable onPress={recheck} style={styles.button} accessibilityRole="button">
                <Text style={styles.buttonText}>Verificar de novo</Text>
              </Pressable>
            </View>
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
          <Text style={styles.hint}>{describePreferencesSync(prefsState)}
            {sessionState.status === "unknown" ? " (sessão ainda não verificada)" : ""}</Text>
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
            </>
          )}
          <Text style={styles.hint}>{API_URL}</Text>
        </View>

        <Text style={styles.footer}>Início provisório — Etapa 4 (exploração)</Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F4EF" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: "#D5DAE0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    color: "#1F2933",
  },
  actions: { gap: 12 },
  publish: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#1F2933", marginTop: 8 },
  recent: { gap: 12 },
  card: {
    width: "100%",
    maxWidth: 720,
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
