import { parseReaisToCents, type JobsListParams } from "@freelah/shared";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextField, colors } from "../src/components/ui";
import { BackLink } from "../src/features/jobs/BackLink";
import {
  CategoryChips,
  EmptyBox,
  ErrorBox,
  JobCard,
  LoadingBox,
} from "../src/features/jobs/components";
import { useCategories, useJobsList } from "../src/features/jobs/hooks";
import { useDebounced } from "../src/features/jobs/useDebounced";

const DEBOUNCE_MS = 350;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Explorar (PRD 29.3): busca, categorias e filtros combinados, aberta a qualquer visitante. */
export default function ExploreScreen() {
  const route = useLocalSearchParams<{ q?: string; category?: string }>();
  const [query, setQuery] = useState(first(route.q) ?? "");
  const [category, setCategory] = useState<string | null>(first(route.category) ?? null);
  const [city, setCity] = useState("");
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const minCents = minText.trim() ? parseReaisToCents(minText) : undefined;
  const maxCents = maxText.trim() ? parseReaisToCents(maxText) : undefined;
  const minError = minText.trim() && minCents === null ? "Digite um valor em reais, como 50 ou 50,00." : undefined;
  const maxError = maxText.trim() && maxCents === null ? "Digite um valor em reais, como 200 ou 200,00." : undefined;
  const rangeError =
    typeof minCents === "number" && typeof maxCents === "number" && minCents > maxCents
      ? "O valor mínimo não pode ser maior que o máximo."
      : undefined;

  // Valores inválidos nunca são enviados: a tela explica o problema em vez de buscar errado.
  const params = useMemo<JobsListParams>(
    () => ({
      q: query.trim() || undefined,
      category: category ?? undefined,
      city: city.trim() || undefined,
      minPriceCents: rangeError ? undefined : (minCents ?? undefined),
      maxPriceCents: rangeError ? undefined : (maxCents ?? undefined),
    }),
    [query, category, city, minCents, maxCents, rangeError],
  );
  const stable = useDebounced(params, DEBOUNCE_MS);
  const { state, loadMore, retry, refresh } = useJobsList(stable);
  const categories = useCategories();

  const activeFilters = [city.trim(), minText.trim(), maxText.trim()].filter(Boolean).length;
  const hasAnyFilter = Boolean(query.trim() || category || activeFilters);

  function clearAll() {
    setQuery("");
    setCategory(null);
    setCity("");
    setMinText("");
    setMaxText("");
  }

  const header = (
    <View style={styles.header}>
      <BackLink title="← Início" />
      <Text style={styles.title} accessibilityRole="header">
        Explorar oportunidades
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por serviço, palavra ou categoria"
        accessibilityLabel="Buscar oportunidades"
        returnKeyType="search"
        autoCapitalize="none"
        style={styles.search}
      />
      {categories.state.status === "ready" ? (
        <CategoryChips
          categories={categories.state.data}
          selected={category}
          onSelect={setCategory}
        />
      ) : categories.state.status === "error" ? (
        <ErrorBox error={categories.state.error} onRetry={categories.retry} />
      ) : (
        <LoadingBox label="Carregando categorias…" />
      )}

      <Button
        title={showFilters ? "Ocultar filtros" : `Mais filtros${activeFilters ? ` (${activeFilters})` : ""}`}
        variant="link"
        onPress={() => setShowFilters((value) => !value)}
      />
      {showFilters ? (
        <View style={styles.filters}>
          <TextField label="Cidade" value={city} onChangeText={setCity} autoCapitalize="words" />
          <TextField
            label="Valor mínimo (R$)"
            value={minText}
            onChangeText={setMinText}
            error={minError || rangeError}
            keyboardType="numeric"
          />
          <TextField
            label="Valor máximo (R$)"
            value={maxText}
            onChangeText={setMaxText}
            error={maxError}
            keyboardType="numeric"
          />
        </View>
      ) : null}

      {state.status === "ready" ? (
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {state.jobs.length === 0
            ? "Nenhum resultado"
            : `${state.jobs.length} ${state.jobs.length === 1 ? "oportunidade" : "oportunidades"}${state.nextCursor ? " (há mais)" : ""}`}
        </Text>
      ) : null}
    </View>
  );

  const jobs = state.status === "ready" ? state.jobs : [];

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Explorar" }} />
      <FlatList
        data={jobs}
        keyExtractor={(job) => job.id}
        renderItem={({ item }) => <JobCard job={item} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={false}
        onRefresh={refresh}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          state.status === "loading" ? (
            <LoadingBox label="Buscando oportunidades…" />
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
              {hasAnyFilter ? <Button title="Limpar busca e filtros" variant="link" onPress={clearAll} /> : null}
            </View>
          )
        }
        ListFooterComponent={
          state.status === "ready" ? (
            <View style={styles.footer}>
              {state.loadMoreError ? <ErrorBox error={state.loadMoreError} onRetry={retry} /> : null}
              {state.loadingMore ? <LoadingBox label="Carregando mais…" /> : null}
              {state.nextCursor && !state.loadingMore && !state.loadMoreError ? (
                <Button title="Carregar mais" variant="link" onPress={loadMore} />
              ) : null}
              <Button title="Atualizar lista" variant="link" onPress={refresh} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 48,
  },
  header: { gap: 12, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  filters: { gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  count: { fontSize: 13, color: colors.muted },
  gap: { height: 12 },
  emptyWrap: { alignItems: "center" },
  footer: { marginTop: 12, gap: 8 },
});
