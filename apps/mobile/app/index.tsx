import type { Preferences, PreferencesSyncState } from "@freelah/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { validatePriceRange } from "@freelah/shared";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../src/components/Icon";
import { Button, TextField } from "../src/components/ui";
import { CategoryList, SIDEBAR_GAP, SIDEBAR_WIDTH, SidebarCard } from "../src/features/jobs/ExploreSidebar";
import { JobGridCard } from "../src/features/jobs/JobGridCard";
import {
  CONTENT_MAX_WIDTH,
  PAGE_PADDING,
  WIDE_BREAKPOINT,
  colors,
  focusRing,
  gradient,
  noInnerOutline,
  gridColumnsFor,
  radius,
  shadow,
  useBreakpoint,
} from "../src/theme";
import { authClient } from "../src/lib/auth-client";
import {
  CategoryChips,
  ConnectionBanner,
  EmptyBox,
  ErrorBox,
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
const RECENT_PARAMS = { limit: 6 };

export default function Index() {
  const router = useRouter();
  const { width } = useBreakpoint();
  const {
    state: prefsState,
    retry: retryPrefs,
    complete,
    resolveInvalidLocal,
  } = usePreferencesSync();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [city, setCity] = useState("");
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const categories = useCategories();
  const recent = useJobsList("home", RECENT_PARAMS);

  async function signOut() {
    await authClient.signOut();
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
      <Button title="Encontrar trabalho" variant={publishFirst ? "secondary" : "primary"} onPress={() => router.push("/explorar")} />
    </View>
  );
  const publish = (
    <View key="publish" style={styles.publish}>
      <Button title="Publicar oportunidade" variant={publishFirst ? "primary" : "secondary"} onPress={() => router.push("/publicar")} />
    </View>
  );

  function submitSearch() {
    router.push({ pathname: "/explorar", params: search.trim() ? { q: search.trim() } : {} });
  }

  // A mesma barra lateral de Explorar (categorias e filtros) fica aberta quando há espaço.
  const sidebar = width >= WIDE_BREAKPOINT;
  const columns = gridColumnsFor(
    Math.min(width, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2 - (sidebar ? SIDEBAR_WIDTH + SIDEBAR_GAP : 0),
  );
  const price = validatePriceRange(minText, maxText);

  function applyFilters() {
    if (!price.valid) return;
    const params: Record<string, string> = {};
    if (city.trim()) params.city = city.trim();
    if (minText.trim()) params.min = minText.trim();
    if (maxText.trim()) params.max = maxText.trim();
    router.push({ pathname: "/explorar", params });
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.layout}>
        {sidebar ? (
          <View style={styles.sidebar}>
            <SidebarCard title="Categorias">
              {categories.state.status === "ready" ? (
                <CategoryList
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
            </SidebarCard>
            <SidebarCard title="Filtros">
              <TextField label="Cidade" value={city} onChangeText={setCity} autoCapitalize="words" />
              <TextField
                label="Valor mínimo (R$)"
                value={minText}
                onChangeText={setMinText}
                error={price.minError ?? price.rangeError}
                keyboardType="numeric"
              />
              <TextField
                label="Valor máximo (R$)"
                value={maxText}
                onChangeText={setMaxText}
                error={price.maxError}
                keyboardType="numeric"
              />
              <Button title="Ver resultados" variant="secondary" onPress={applyFilters} disabled={!price.valid} />
            </SidebarCard>
          </View>
        ) : null}
        <View style={styles.main}>
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} accessibilityRole="header">
              Encontre uma oportunidade ou alguém para o seu serviço
            </Text>
            <Text style={styles.tagline}>
              Veja trabalhos abertos perto de você, demonstre interesse e converse direto com quem
              contrata.
            </Text>
          </View>
          <View style={styles.heroActions}>
            <View style={[styles.searchBox, searchFocused ? focusRing : null]}>
              <Icon name="search" size={18} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={submitSearch}
                placeholder="Buscar serviço ou oportunidade"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Buscar oportunidades"
                returnKeyType="search"
                style={styles.searchInput}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </View>
            <View style={styles.actions}>{publishFirst ? [publish, findWork] : [findWork, publish]}</View>
          </View>
        </View>

        <ConnectionBanner />

        {sidebar ? null : (
          <>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Categorias
        </Text>
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
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Oportunidades recentes
          </Text>
          <Button title="Ver todas" variant="link" onPress={() => router.push("/explorar")} />
        </View>
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
              <View style={styles.grid}>
                {recent.state.jobs.map((job) => (
                  <View key={job.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
                    <JobGridCard job={job} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const GAP = 20;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    padding: PAGE_PADDING,
    paddingBottom: 56,
  },
  layout: { flexDirection: "row", alignItems: "flex-start", gap: SIDEBAR_GAP },
  sidebar: { width: SIDEBAR_WIDTH, gap: 16 },
  main: { flex: 1, minWidth: 0, gap: 16 },
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 24,
    backgroundColor: colors.brandSoft,
    ...gradient("linear-gradient(120deg, #FFFFFF 0%, #EAF1FD 55%, #D6E4FB 100%)"),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    boxShadow: shadow.card,
    padding: 36,
  },
  heroText: { flex: 1, minWidth: 300, gap: 10 },
  heroTitle: { fontSize: 32, fontWeight: "800", color: colors.text },
  tagline: { fontSize: 17, color: colors.textSoft, lineHeight: 25 },
  heroActions: { flex: 1, minWidth: 300, gap: 14 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text, ...noInnerOutline },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  publish: { flexGrow: 1, flexBasis: 180 },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recent: { gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -GAP / 2 },
  cell: { padding: GAP / 2 },
});
