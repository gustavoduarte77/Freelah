import { PROFILE_ROLE_LABEL, formatRating, groupProfileHistory, type ProfileHistoryItem, type PublicProfile } from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { Button, colors } from "../../components/ui";
import { PhotoPlaceholder } from "../jobs/PhotoPlaceholder";
import { gradient, radius, shadow, useBreakpoint } from "../../theme";
import { useConversationWith } from "./useConversationWith";

const countLabel = (count: number) => `${count} ${count === 1 ? "avaliação" : "avaliações"}`;

/** "DD/MM/AAAA" no horário do aparelho; vazio se a data não for válida (nada é inventado). */
function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** Botão "Conversar" do perfil de outra pessoa (só aparece se já existe uma conversa com ela). */
function ConversationButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const conversationId = useConversationWith(profileId);
  if (!conversationId) return null;
  return (
    <Button
      title="Conversar"
      onPress={() =>
        router.push(
          (isWide ? `/mensagens?c=${encodeURIComponent(conversationId)}` : `/conversa/${encodeURIComponent(conversationId)}`) as Href,
        )
      }
    />
  );
}

/** Perfil público de uma pessoa, ou o da própria conta (`isOwn`), que troca "Conversar" por "Editar perfil". */
export function ProfileCard({ profile, isOwn = false }: { profile: PublicProfile; isOwn?: boolean }) {
  const router = useRouter();
  const history = groupProfileHistory(profile);
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
            {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
            {profile.roles.length > 0 ? (
              <View style={styles.roles} testID="profile-roles">
                {profile.roles.map((role) => (
                  <Text key={role} style={styles.roleBadge} testID={`profile-role-${role}`}>
                    {PROFILE_ROLE_LABEL[role]}
                  </Text>
                ))}
              </View>
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
          {isOwn ? (
            <Button title="Editar perfil" onPress={() => router.push("/editar-perfil" as Href)} />
          ) : (
            <ConversationButton profileId={profile.id} />
          )}
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

        {history.items.length > 0 ? <CompletedServices items={history.items} isDemo={profile.isDemo} /> : null}

        {profile.rating && profile.reviews.length > 0 ? (
          <Reviews profile={profile} rating={profile.rating} reviews={history.standaloneReviews} linkedCount={profile.reviews.length - history.standaloneReviews.length} />
        ) : null}
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

function Reviews({
  profile,
  rating,
  reviews,
  linkedCount,
}: {
  profile: PublicProfile;
  rating: NonNullable<PublicProfile["rating"]>;
  reviews: PublicProfile["reviews"];
  linkedCount: number;
}) {
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
      {linkedCount > 0 ? (
        <Text style={styles.count}>{linkedCount === 1 ? "1 avaliação aparece junto do serviço concluído, acima." : `${linkedCount} avaliações aparecem junto dos serviços concluídos, acima.`}</Text>
      ) : null}
      {reviews.map((review, index) => {
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


/** Serviços concluídos do perfil, cada um com as fotos (espaços reservados) e, se houver, a avaliação do MESMO serviço. */
function CompletedServices({ items, isDemo }: { items: ProfileHistoryItem[]; isDemo: boolean }) {
  return (
    <View style={styles.section} testID="profile-completed-services">
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Serviços concluídos
      </Text>
      {isDemo ? <Text style={styles.demoNote}>Exemplos fictícios, criados para esta demonstração. Não são serviços nem avaliações de clientes reais.</Text> : null}
      {items.map(({ service, review }) => {
        const when = formatReviewDate(service.completedAt);
        return (
          <View key={service.id} style={styles.service} testID="profile-completed-service">
            <Text style={styles.serviceTitle}>{service.title}</Text>
            {when ? <Text style={styles.reviewService}>Concluído em {when}</Text> : null}
            <Text style={styles.body}>{service.description}</Text>
            {service.photoCount > 0 ? (
              <View style={styles.serviceThumbs} accessibilityLabel={`${service.photoCount} ${service.photoCount === 1 ? "foto" : "fotos"} (espaços reservados)`}>
                {Array.from({ length: service.photoCount }, (_, index) => (
                  <PhotoPlaceholder key={index} iconSize={22} style={styles.serviceThumb} testID="service-photo-placeholder" />
                ))}
              </View>
            ) : null}
            {review ? (
              <View style={styles.serviceReview} testID="profile-service-review">
                <Text style={styles.serviceReviewLabel}>Avaliação deste serviço</Text>
                <View style={styles.reviewHead} accessibilityLabel={`${review.author}, nota ${review.rating} de 5`}>
                  <Text style={styles.reviewAuthor}>{review.author}</Text>
                  <Stars value={review.rating} size={14} />
                </View>
                <Text style={styles.reviewComment}>{review.comment}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
  service: { gap: 6, backgroundColor: colors.background, borderRadius: radius.md, padding: 14 },
  serviceTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  serviceThumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  serviceThumb: { width: 96, height: 72, borderRadius: radius.sm },
  serviceReview: { gap: 4, marginTop: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  serviceReviewLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
});
