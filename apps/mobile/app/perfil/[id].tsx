import { formatRating, type PublicProfile } from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../../src/components/Avatar";
import { Icon } from "../../src/components/Icon";
import { Button, colors } from "../../src/components/ui";
import { LoadingBox } from "../../src/features/jobs/components";
import { useProfile } from "../../src/features/profile/useProfile";
import { PAGE_PADDING, radius, shadow } from "../../src/theme";

/** Perfil público de uma pessoa: apresentação e áreas de atuação. Nunca mostra contato privado. */
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

function ProfileCard({ profile }: { profile: PublicProfile }) {
  return (
    <View style={styles.card} testID="public-profile">
      <View style={styles.identity}>
        <Avatar size={88} uri={profile.avatarUrl} />
        <View style={styles.identityText}>
          <Text style={styles.name} accessibilityRole="header">
            {profile.name}
          </Text>
          {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
          <View style={styles.row}>
            <Icon name="pin" size={15} color={colors.muted} />
            <Text style={styles.city}>{profile.state ? `${profile.city}/${profile.state}` : profile.city}</Text>
          </View>
        </View>
      </View>

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

      {profile.rating ? <Reviews profile={profile} rating={profile.rating} /> : null}
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
  const countLabel = `${rating.count} ${rating.count === 1 ? "avaliação" : "avaliações"}`;
  return (
    <View style={styles.section} testID="profile-reviews">
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Avaliações de clientes
      </Text>
      {profile.isDemo ? <Text style={styles.demoNote}>Avaliações fictícias, criadas para esta demonstração.</Text> : null}
      <View style={styles.summary} accessibilityLabel={`Nota média ${formatRating(rating.average)} de 5, ${countLabel}`}>
        <Text style={styles.average}>{formatRating(rating.average)}</Text>
        <View style={styles.summaryText}>
          <Stars value={rating.average} size={18} />
          <Text style={styles.count}>{countLabel}</Text>
        </View>
      </View>
      {profile.reviews.map((review, index) => (
        <View key={`${review.author}-${index}`} style={styles.review}>
          <View style={styles.reviewHead} accessibilityLabel={`${review.author}, nota ${review.rating} de 5`}>
            <Text style={styles.reviewAuthor}>{review.author}</Text>
            <Stars value={review.rating} size={14} />
          </View>
          {review.serviceTitle ? <Text style={styles.reviewService}>{review.serviceTitle}</Text> : null}
          <Text style={styles.reviewComment}>{review.comment}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
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
    padding: 24,
    gap: 20,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  identityText: { flex: 1, minWidth: 180, gap: 4 },
  name: { fontSize: 28, fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  city: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  section: { gap: 8 },
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
  headline: { fontSize: 16, fontWeight: "700", color: colors.brand },
  demoNote: { fontSize: 13, color: colors.warningText, backgroundColor: colors.warningSoft, borderRadius: 10, padding: 10 },
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryText: { gap: 2 },
  average: { fontSize: 36, fontWeight: "800", color: colors.text },
  count: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  starOn: { color: "#F5A623" },
  starOff: { color: colors.border },
  review: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  reviewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  reviewAuthor: { fontSize: 15, fontWeight: "700", color: colors.text },
  reviewService: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  reviewComment: { fontSize: 15, color: colors.textSoft, lineHeight: 22 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 12, padding: 12, gap: 8 },
  errorText: { fontSize: 14, color: colors.error },
});
