import { formatRating, searchProfessionals, type ProfessionalEntry } from "@freelah/shared";
import { Stack, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { Icon } from "../src/components/Icon";
import { InteractiveCard } from "../src/components/InteractiveCard";
import { Button, colors } from "../src/components/ui";
import { CategoryChips, EmptyBox, LoadingBox } from "../src/features/jobs/components";
import { useCategories } from "../src/features/jobs/hooks";
import { PROFESSIONAL_DIRECTORY } from "../src/features/professionals/directory";
import { useProfessionals } from "../src/features/professionals/useProfessionals";
import { CONTENT_MAX_WIDTH, PAGE_PADDING, focusRing, noInnerOutline, radius, shadow, useBreakpoint } from "../src/theme";

/** Quantos serviços aparecem no cartão; o restante fica no perfil. */
const SERVICES_ON_CARD = 3;

/**
 * Descoberta de profissionais: procurar quem oferece um serviço, comparar e abrir o perfil
 * público (a mesma tela usada pela conversa). Pública, sem login.
 */
export default function ProfessionalsScreen() {
  const { state, retry } = useProfessionals();
  const categories = useCategories();
  const { width, isNarrow } = useBreakpoint();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const results = useMemo(
    () => (state.status === "ready" ? searchProfessionals(state.entries, query, category) : []),
    [state, query, category],
  );
  const columns = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  const filtering = query.trim() !== "" || category !== null;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Profissionais" }} />
      <ScrollView contentContainerStyle={[styles.content, isNarrow ? styles.contentNarrow : null]} keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            Encontrar profissionais
          </Text>
          <Text style={styles.subtitle}>Procure quem oferece o serviço que você precisa, compare e veja o perfil.</Text>
        </View>

        <View style={[styles.searchBox, searchFocused ? focusRing : null]}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nome, ocupação ou serviço"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Buscar profissionais"
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

        {categories.state.status === "ready" ? (
          <CategoryChips categories={categories.state.data} selected={category} onSelect={setCategory} />
        ) : null}

        {state.status === "loading" ? (
          <LoadingBox label="Carregando profissionais…" />
        ) : (
          <>
            {state.failed > 0 ? (
              <View style={styles.warn} accessibilityRole="alert">
                <Text style={styles.warnText}>
                  {state.failed === 1 ? "Um perfil não pôde ser carregado agora." : `${state.failed} perfis não puderam ser carregados agora.`}
                </Text>
                <Button title="Tentar de novo" variant="link" onPress={retry} />
              </View>
            ) : null}

            {results.length === 0 ? (
              PROFESSIONAL_DIRECTORY.length === 0 ? (
                <EmptyBox title="Ainda não há profissionais para mostrar" text="A busca de profissionais chega em breve." />
              ) : filtering ? (
                <View style={styles.empty}>
                  <EmptyBox title="Nenhum profissional encontrado" text="Tente outra palavra ou escolha outra categoria." />
                  <Button
                    title="Limpar busca e filtros"
                    variant="secondary"
                    onPress={() => {
                      setQuery("");
                      setCategory(null);
                    }}
                  />
                </View>
              ) : state.failed === 0 ? (
                <EmptyBox title="Ainda não há profissionais para mostrar" />
              ) : null
            ) : (
              <>
                <Text style={styles.count} accessibilityLiveRegion="polite">
                  {results.length} {results.length === 1 ? "profissional" : "profissionais"}
                </Text>
                <View style={styles.grid}>
                  {results.map((entry) => (
                    <View key={entry.profile.id} style={{ width: `${100 / columns}%`, padding: 8 }}>
                      <ProfessionalCard entry={entry} />
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfessionalCard({ entry: { profile } }: { entry: ProfessionalEntry }) {
  const router = useRouter();
  const shown = profile.services.slice(0, SERVICES_ON_CARD);
  const more = profile.services.length - shown.length;
  return (
    <InteractiveCard
      label={`Ver perfil de ${profile.name}`}
      testID="professional-card"
      onPress={() => router.push(`/perfil/${encodeURIComponent(profile.id)}` as Href)}
      style={styles.card}
    >
      <View style={styles.identity}>
        <Avatar size={56} uri={profile.avatarUrl} />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.name}
          </Text>
          {profile.headline ? (
            <Text style={styles.headline} numberOfLines={1}>
              {profile.headline}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Icon name="pin" size={14} color={colors.muted} />
            <Text style={styles.meta}>{profile.state ? `${profile.city}/${profile.state}` : profile.city}</Text>
          </View>
        </View>
      </View>

      {profile.rating ? (
        <Text
          style={styles.rating}
          accessibilityLabel={`Nota média ${formatRating(profile.rating.average)} de 5, ${profile.rating.count} ${profile.rating.count === 1 ? "avaliação" : "avaliações"}${profile.isDemo ? " fictícias" : ""}`}
        >
          <Text style={styles.star}>★ </Text>
          {formatRating(profile.rating.average)}
          <Text style={styles.meta}>
            {" "}
            · {profile.rating.count} {profile.rating.count === 1 ? "avaliação" : "avaliações"}
            {profile.isDemo ? " (demonstração)" : ""}
          </Text>
        </Text>
      ) : (
        <Text style={styles.meta}>Sem avaliações ainda</Text>
      )}

      <View style={styles.chips}>
        {shown.map((service) => (
          <Text key={service} style={styles.chip} numberOfLines={1}>
            {service}
          </Text>
        ))}
        {more > 0 ? <Text style={styles.more}>+{more}</Text> : null}
      </View>

      <Text style={styles.link}>Ver perfil →</Text>
    </InteractiveCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
  contentNarrow: { padding: 16 },
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
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text, ...noInnerOutline },
  count: { fontSize: 14, fontWeight: "600", color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 },
  card: { padding: 18, gap: 12, height: "100%" },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 18, fontWeight: "800", color: colors.text },
  headline: { fontSize: 14, fontWeight: "700", color: colors.brand },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: 14, color: colors.muted, fontWeight: "500" },
  rating: { fontSize: 15, fontWeight: "800", color: colors.text },
  star: { color: "#F5A623" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  more: { fontSize: 13, fontWeight: "700", color: colors.muted, paddingVertical: 4 },
  link: { fontSize: 14, fontWeight: "700", color: colors.brand, marginTop: "auto" },
  empty: { gap: 12, alignItems: "center" },
  warn: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, backgroundColor: colors.warningSoft, borderRadius: 10, padding: 10 },
  warnText: { fontSize: 14, color: colors.warningText },
});
