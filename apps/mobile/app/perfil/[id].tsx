import { formatRating, isProfessional, type PublicProfile } from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../src/components/Avatar";
import { Icon } from "../../src/components/Icon";
import { Button, colors } from "../../src/components/ui";
import { LoadingBox } from "../../src/features/jobs/components";
import { useConversationWith } from "../../src/features/profile/useConversationWith";
import { useProfile } from "../../src/features/profile/useProfile";
import { PAGE_PADDING, gradient, radius, shadow, useBreakpoint } from "../../src/theme";

/** Perfil público de uma pessoa: apresentação, áreas de atuação e avaliações. Nunca mostra contato privado. */
export default function ProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { state, retry } = useProfile(id);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: state.status === "ready" ? state.profile.name : "Perfil" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <BackButton />
        </View>
        {state.status === "loading" ? (
          <LoadingBox label="Carregando perfil…" />
        ) : state.status === "error" ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>
              {state.notFound ? "Perfil não encontrado." : "Não foi possível carregar o perfil agora."}
            </Text>
            {state.notFound ? null : <Button title="Tentar de novo" onPress={retry} />}
          </View>
        ) : (
          <ProfileCard profile={state.profile} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Volta para onde a pessoa estava (por exemplo, a conversa); sem histórico, vai para o início. */
function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar para a página anterior"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={({ hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.back,
        hovered ? styles.backHover : null,
        focused ? styles.backFocus : null,
      ]}
    >
      <Icon name="chevronLeft" size={16} color={colors.brand} />
      <Text style={styles.backText}>Voltar</Text>
    </Pressable>
  );
}

const countLabel = (count: number) => `${count} ${count === 1 ? "avaliação" : "avaliações"}`;

/** "DD/MM/AAAA" no horário do aparelho; vazio se a data não for válida (nada é inventado). */
function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function ProfileCard({ profile }: { profile: PublicProfile }) {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const conversationId = useConversationWith(profile.id);
  const professional = isProfessional(profile);
  const place = profile.state ? `${profile.city}/${profile.state}` : profile.city;

  return (
    <View style={styles.card} testID="public-profile">
      <View style={[styles.banner, gradient(`linear-gradient(135deg, ${colors.brandSoft}, ${colors.brandBorder})`)]} />
      <View style={styles.header}>
        <View style={styles.avatarRing}>
          <Avatar size={104} uri={profile.avatarUrl} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.identityText}>
            <Text style={styles.name} accessibilityRole="header">
              {profile.name}
            </Text>
            {profile.headline ? (
              <Text style={styles.headline}>{profile.headline}</Text>
            ) : !professional ? (
              <Text style={styles.roleBadge}>Contratante</Text>
            ) : null}
            <View style={styles.facts}>
              <View style={styles.row}>
                <Icon name="pin" size={15} color={colors.muted} />
                <Text style={styles.city}>{place}</Text>
              </View>
              {profile.rating ? (
                <View
                  style={styles.ratingPill}
                  accessibilityLabel={`Nota média ${formatRating(profile.rating.average)} de 5, ${countLabel(profile.rating.count)}`}
                >
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingText}>{formatRating(profile.rating.average)}</Text>
                  <Text style={styles.ratingCount}>· {countLabel(profile.rating.count)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {conversationId ? (
            <Button
              title="Conversar"
              onPress={() =>
                router.push(
                  (isWide
                    ? `/mensagens?c=${encodeURIComponent(conversationId)}`
                    : `/conversa/${encodeURIComponent(conversationId)}`) as Href,
                )
              }
            />
          ) : null}
        </View>
        {profile.isDemo ? <Text style={styles.demoTag}>Perfil fictício, criado para esta demonstração.</Text> : null}
      </View>

      <View style={styles.sections}>
        {profile.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Sobre
            </Text>
            <Text style={styles.body}>{profile.bio}</Text>
          </View>
        ) : null}

        {profile.services.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Serviços e áreas de atuação
            </Text>
            <View style={styles.chips}>
              {profile.services.map((service) => (
                <Text key={service} style={styles.chip}>
                  {service}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {profile.rating && profile.reviews.length > 0 ? <Reviews profile={profile} rating={profile.rating} /> : null}
      </View>
    </View>
  );
}

/** Estrelas de 1 a 5 (caractere de texto: funciona offline e sem imagens). */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <Text style={{ fontSize: size, letterSpacing: 1 }} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={styles.starOn}>{"★".repeat(full)}</Text>
      <Text style={styles.starOff}>{"★".repeat(5 - full)}</Text>
    </Text>
  );
}

function Reviews({ profile, rating }: { profile: PublicProfile; rating: NonNullable<PublicProfile["rating"]> }) {
  return (
    <View style={styles.section} testID="profile-reviews">
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Avaliações de clientes
      </Text>
      <View
        style={styles.summary}
        accessibilityLabel={`Nota média ${formatRating(rating.average)} de 5, ${countLabel(rating.count)}`}
      >
        <Text style={styles.average}>{formatRating(rating.average)}</Text>
        <View style={styles.summaryText}>
          <Stars value={rating.average} size={18} />
          <Text style={styles.count}>{countLabel(rating.count)}</Text>
        </View>
      </View>
      {profile.isDemo ? <Text style={styles.demoNote}>Avaliações fictícias, criadas para esta demonstração.</Text> : null}
      {profile.reviews.map((review, index) => {
        const when = formatReviewDate(review.createdAt);
        return (
          <View key={`${review.author}-${index}`} style={styles.review}>
            <View style={styles.reviewHead} accessibilityLabel={`${review.author}, nota ${review.rating} de 5`}>
              <Text style={styles.reviewAuthor}>{review.author}</Text>
              <Stars value={review.rating} size={14} />
            </View>
            {review.serviceTitle || when ? (
              <Text style={styles.reviewService}>{[review.serviceTitle, when].filter(Boolean).join(" · ")}</Text>
            ) : null}
            <Text style={styles.reviewComment}>{review.comment}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
  back: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface,
    cursor: "pointer",
  },
  backHover: { backgroundColor: colors.brandSoft },
  backFocus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand, outlineOffset: 2 },
  backText: { fontSize: 14, fontWeight: "700", color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    overflow: "hidden",
  },
  banner: { height: 96, backgroundColor: colors.brandSoft },
  header: { paddingHorizontal: 24, paddingBottom: 20, gap: 12 },
  avatarRing: {
    alignSelf: "flex-start",
    marginTop: -52,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  identityText: { flex: 1, minWidth: 220, gap: 6 },
  name: { fontSize: 28, fontWeight: "800", color: colors.text },
  headline: { fontSize: 17, fontWeight: "700", color: colors.brand },
  roleBadge: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSoft,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  facts: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  city: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ratingStar: { fontSize: 14, color: "#F5A623" },
  ratingText: { fontSize: 14, fontWeight: "800", color: colors.text },
  ratingCount: { fontSize: 13, fontWeight: "600", color: colors.muted },
  demoTag: { fontSize: 12, color: colors.muted },
  sections: { borderTopWidth: 1, borderTopColor: colors.border, padding: 24, gap: 28 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  body: { fontSize: 16, color: colors.textSoft, lineHeight: 24 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.brand,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  demoNote: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: colors.warningText,
    backgroundColor: colors.warningSoft,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryText: { gap: 2 },
  average: { fontSize: 36, fontWeight: "800", color: colors.text },
  count: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  starOn: { color: "#F5A623" },
  starOff: { color: colors.border },
  review: { gap: 4, backgroundColor: colors.background, borderRadius: radius.md, padding: 14 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  reviewAuthor: { fontSize: 15, fontWeight: "700", color: colors.text },
  reviewService: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  reviewComment: { fontSize: 15, color: colors.textSoft, lineHeight: 22 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 12, padding: 12, gap: 8 },
  errorText: { fontSize: 14, color: colors.error },
});
