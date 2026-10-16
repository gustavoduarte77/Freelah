import { validatePriceRange, type JobsListParams } from "@freelah/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../src/components/Icon";
import { Button, TextField } from "../src/components/ui";
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
import { JobGridCard } from "../src/features/jobs/JobGridCard";
import { CategoryList, SIDEBAR_GAP, SIDEBAR_WIDTH, SidebarCard } from "../src/features/jobs/ExploreSidebar";
import { useDebounced } from "../src/features/jobs/useDebounced";
import {
  CONTENT_MAX_WIDTH,
  PAGE_PADDING,
  WIDE_BREAKPOINT,
  colors,
  focusRing,
  gridColumnsFor,
  noInnerOutline,
  radius,
  shadow,
  useBreakpoint,
} from "../src/theme";

const DEBOUNCE_MS = 350;
const COLUMN_GAP = 20;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type ViewMode = "grid" | "list";
// Preferência só de apresentação: lembrada enquanto o app está aberto, sem tocar em dados nem filtros.
let lastViewMode: ViewMode = "grid";

/** Explorar (PRD 29.3): busca, categorias e filtros combinados, aberta a qualquer visitante. */
export default function ExploreScreen() {
  const route = useLocalSearchParams<{ q?: string; category?: string; city?: string; min?: string; max?: string }>();
  const { width } = useBreakpoint();
  const [query, setQuery] = useState(first(route.q) ?? "");
  const [category, setCategory] = useState<string | null>(first(route.category) ?? null);
  const [city, setCity] = useState(first(route.city) ?? "");
  const [minText, setMinText] = useState(first(route.min) ?? "");
  const [maxText, setMaxText] = useState(first(route.max) ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(lastViewMode);

  const price = useMemo(() => validatePriceRange(minText, maxText), [minText, maxText]);

  // Faixa de valor inválida (campo ilegível ou mínimo maior que o máximo): nada é consultado e a
  // lista não é exibida como se o filtro tivesse sido aplicado; a tela explica o que corrigir.
  const params = useMemo<JobsListParams | null>(
    () =>
      price.valid
        ? {
            q: query.trim() || undefined,
            category: category ?? undefined,
            city: city.trim() || undefined,
            minPriceCents: price.minPriceCents,
            maxPriceCents: price.maxPriceCents,
          }
        : null,
    [query, category, city, price],
  );
  const stable = useDebounced(params, DEBOUNCE_MS);
  const { state, loadMore, retry, refresh } = useJobsList("explore", stable);
  const categories = useCategories();

  const activeFilters = [city.trim(), minText.trim(), maxText.trim()].filter(Boolean).length;
  const hasAnyFilter = Boolean(query.trim() || category || activeFilters);

  // Barra lateral só com espaço de sobra; a quantidade de colunas segue a largura da área principal.
  const sidebar = width >= WIDE_BREAKPOINT;
  const mainWidth =
    Math.min(width, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2 - (sidebar ? SIDEBAR_WIDTH + SIDEBAR_GAP : 0);
  const gridColumns = gridColumnsFor(mainWidth);
  const columns = viewMode === "grid" ? gridColumns : 1;

  function changeViewMode(mode: ViewMode) {
    lastViewMode = mode;
    setViewMode(mode);
  }

  function clearAll() {
    setQuery("");
    setCategory(null);
    setCity("");
    setMinText("");
    setMaxText("");
  }

  const filterFields = (
    <View style={styles.filterFields}>
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
    </View>
  );

  const categoriesBlock =
    categories.state.status === "ready" ? null : categories.state.status === "error" ? (
      <ErrorBox error={categories.state.error} onRetry={categories.retry} />
    ) : (
      <LoadingBox label="Carregando categorias…" />
    );

  const header = (
    <View style={styles.header}>
      <ConnectionBanner />
      <View style={styles.titleBlock}>
        <Text style={styles.title} accessibilityRole="header">
          Explorar oportunidades
        </Text>
        <Text style={styles.subtitle}>
          Encontre serviços e bicos abertos, compare e demonstre interesse.
        </Text>
      </View>

      <View style={[styles.searchBox, searchFocused ? focusRing : null]}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por serviço, palavra ou categoria"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Buscar oportunidades"
          returnKeyType="search"
          autoCapitalize="none"
          style={styles.searchInput}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={() => setQuery("")}>
            <Icon name="x" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {sidebar ? null : (
        <>
          {categories.state.status === "ready" ? (
            <CategoryChips categories={categories.state.data} selected={category} onSelect={setCategory} />
          ) : (
            categoriesBlock
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showFilters }}
            onPress={() => setShowFilters((value) => !value)}
            style={styles.filterToggle}
          >
            <Icon name="filter" size={16} color={colors.brand} />
            <Text style={styles.filterToggleText}>
              {showFilters ? "Ocultar filtros" : `Mais filtros${activeFilters ? ` (${activeFilters})` : ""}`}
            </Text>
          </Pressable>
          {showFilters ? <View style={styles.filtersPanel}>{filterFields}</View> : null}
        </>
      )}

      {price.valid && state.status === "ready" ? (
        <StaleNotice
          loadedAt={state.loadedAt}
          refreshing={state.refreshing}
          failed={state.refreshError !== null}
        />
      ) : null}

      <View style={styles.toolbar}>
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {price.valid && state.status === "ready"
            ? state.jobs.length === 0
              ? "Nenhum resultado"
              : `${state.jobs.length} ${state.jobs.length === 1 ? "oportunidade" : "oportunidades"}${state.nextCursor ? " (há mais)" : ""}`
            : " "}
        </Text>
        <ViewToggle mode={viewMode} onChange={changeViewMode} />
      </View>
    </View>
  );

  const jobs = price.valid && state.status === "ready" ? state.jobs : [];
  // Completa a última linha da grade com espaços vazios para os cartões manterem a largura.
  const padding = columns > 1 ? (columns - (jobs.length % columns)) % columns : 0;
  const data = [...jobs, ...Array.from({ length: padding }, () => null)];

  const list = (
    <FlatList
      // A quantidade de colunas só pode mudar com uma lista nova.
      key={`cols-${columns}`}
      data={data}
      numColumns={columns}
      keyExtractor={(job, index) => job?.id ?? `pad-${index}`}
      renderItem={({ item }) =>
        item === null ? (
          <View style={styles.cell} />
        ) : columns === 1 && viewMode === "list" ? (
          <View style={styles.rowCell}>
            <JobCard job={item} />
          </View>
        ) : (
          <View style={styles.cell}>
            <JobGridCard job={item} />
          </View>
        )
      }
      ListHeaderComponent={header}
      contentContainerStyle={styles.listContent}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshing={false}
      onRefresh={refresh}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={styles.inset}>
          {!price.valid ? (
          <View style={styles.invalidRange} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Text style={styles.invalidTitle}>Corrija a faixa de valor</Text>
            <Text style={styles.invalidText}>{price.rangeError ?? price.minError ?? price.maxError}</Text>
            <Text style={styles.invalidText}>Os resultados voltam assim que os valores estiverem corretos.</Text>
          </View>
        ) : state.status === "loading" ? (
          <SkeletonGrid columns={columns} />
        ) : state.status === "error" ? (
          <ErrorBox error={state.error} onRetry={retry} />
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyBox
              title={hasAnyFilter ? "Nenhuma oportunidade encontrada" : "Ainda não há oportunidades abertas"}
              text={
                hasAnyFilter
                  ? "Tente outras palavras ou retire alguns filtros."
                  : "Volte em breve: novas oportunidades aparecem aqui."
              }
            />
            {hasAnyFilter ? <Button title="Limpar busca e filtros" variant="secondary" onPress={clearAll} /> : null}
          </View>
          )}
        </View>
      }
      ListFooterComponent={
        price.valid && state.status === "ready" ? (
          <View style={styles.footer}>
            {state.loadMoreError ? <ErrorBox error={state.loadMoreError} onRetry={retry} /> : null}
            {state.loadingMore ? <LoadingBox label="Carregando mais…" /> : null}
            {state.nextCursor && !state.loadingMore && !state.loadMoreError ? (
              <Button title="Carregar mais" variant="secondary" onPress={loadMore} />
            ) : null}
          </View>
        ) : null
      }
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Explorar" }} />
      <View style={styles.page}>
        {sidebar ? (
          <View style={styles.sidebar}>
            <SidebarCard title="Categorias">
              {categories.state.status === "ready" ? (
                <CategoryList
                  categories={categories.state.data}
                  selected={category}
                  onSelect={setCategory}
                />
              ) : (
                categoriesBlock
              )}
            </SidebarCard>
            <SidebarCard title="Filtros">
              {filterFields}
              {hasAnyFilter ? <Button title="Limpar busca e filtros" variant="link" onPress={clearAll} /> : null}
            </SidebarCard>
          </View>
        ) : null}
        <View style={styles.main}>{list}</View>
      </View>
    </SafeAreaView>
  );
}

/** Alternância grade/lista: só muda a apresentação, nunca os dados. */
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const options: Array<{ mode: ViewMode; label: string; icon: IconName }> = [
    { mode: "grid", label: "Grade", icon: "grid" },
    { mode: "list", label: "Lista", icon: "list" },
  ];
  return (
    <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Modo de visualização">
      {options.map((option) => {
        const active = mode === option.mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            aria-checked={active}
            accessibilityLabel={`Visualização em ${option.label.toLowerCase()}`}
            onPress={() => onChange(option.mode)}
            style={({ hovered }: { hovered?: boolean }) => [
              styles.toggleOption,
              active ? styles.toggleActive : hovered ? styles.toggleHover : null,
            ]}
          >
            <Icon name={option.icon} size={16} color={active ? colors.brand : colors.muted} />
            <Text style={[styles.toggleText, active ? styles.toggleTextActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Carregamento: blocos cinza no formato dos cartões, para a página não "pular" ao chegar os dados. */
function SkeletonGrid({ columns }: { columns: number }) {
  return (
    <View style={styles.skeletonGrid} accessibilityLiveRegion="polite" accessibilityLabel="Buscando oportunidades…">
      {Array.from({ length: columns * 2 }, (_, index) => (
        <View key={index} style={[styles.skeleton, { width: `${100 / columns}%` }]}>
          <View style={styles.skeletonInner} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: {
    flex: 1,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    flexDirection: "row",
    gap: SIDEBAR_GAP,
    paddingHorizontal: PAGE_PADDING,
  },
  main: { flex: 1, minWidth: 0 },
  sidebar: { width: SIDEBAR_WIDTH, gap: 16, paddingTop: 24 },
  filterFields: { gap: 8 },
  listContent: { paddingTop: 24, paddingBottom: 48, marginLeft: -COLUMN_GAP / 2, paddingRight: 6 },
  inset: { paddingHorizontal: COLUMN_GAP / 2 },
  header: { gap: 14, marginBottom: 8, paddingHorizontal: COLUMN_GAP / 2 },
  titleBlock: { gap: 4 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    ...noInnerOutline,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 8,
    cursor: "pointer",
  },
  filterToggleText: { fontSize: 15, fontWeight: "600", color: colors.brand },
  filtersPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { fontSize: 14, color: colors.muted, flexShrink: 1 },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  toggleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  toggleActive: { backgroundColor: colors.brandSoft },
  toggleHover: { backgroundColor: colors.background },
  toggleText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  toggleTextActive: { color: colors.brand },
  cell: { flex: 1, paddingHorizontal: COLUMN_GAP / 2, paddingBottom: COLUMN_GAP },
  rowCell: { flex: 1, paddingHorizontal: COLUMN_GAP / 2, paddingBottom: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  footer: { marginTop: 12, gap: 8, alignItems: "center", paddingHorizontal: COLUMN_GAP / 2 },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap" },
  skeleton: { padding: COLUMN_GAP / 2, height: 380 + COLUMN_GAP },
  skeletonInner: { flex: 1, borderRadius: radius.lg, backgroundColor: "#E9EEF6" },
  invalidRange: { backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: 16, gap: 6 },
  invalidTitle: { fontSize: 16, fontWeight: "700", color: colors.error },
  invalidText: { fontSize: 14, color: "#5C2420" },
});
