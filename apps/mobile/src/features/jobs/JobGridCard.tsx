import { formatJobDate, formatPriceCents, type JobSummary } from "@freelah/shared";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { InteractiveCard } from "../../components/InteractiveCard";
import { colors, gradient, radius } from "../../theme";
import { DemoBadge, StatusBadge } from "./components";
import { JobArt } from "./JobArt";

const CARD_HEIGHT = 380;
const INFO_HEIGHT = 210;

/**
 * Cartão da visualização em grade. A ilustração ocupa o cartão inteiro e a faixa de informações
 * fica sobre a parte de baixo, com degradê de transparente para branco: o texto sempre está sobre
 * branco, e a imagem aparece por trás só na parte de cima da faixa.
 */
export function JobGridCard({ job }: { job: JobSummary }) {
  const router = useRouter();
  return (
    <InteractiveCard
      label={`Abrir oportunidade ${job.title}`}
      onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: job.id } })}
      style={styles.card}
    >
      <JobArt categorySlug={job.category.slug} iconSize={72} style={styles.art} />
      <View style={styles.tags}>
        <View style={styles.categoryPill}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {job.category.name}
          </Text>
        </View>
        {job.status !== "PUBLISHED" ? <StatusBadge status={job.status} /> : null}
        {job.isDemo ? <DemoBadge /> : null}
      </View>
      <View
        style={[
          styles.info,
          gradient(
            "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.72) 22%, rgba(255,255,255,0.96) 40%, #FFFFFF 52%)",
          ),
        ]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {job.title}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="pin" size={14} color={colors.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {job.city}/{job.state}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Icon name="calendar" size={14} color={colors.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {formatJobDate(job.scheduledDate)} às {job.startTime}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPriceCents(job.proposedPriceCents)}</Text>
          {job.negotiable ? <Text style={styles.negotiable}>negociável</Text> : null}
        </View>
      </View>
    </InteractiveCard>
  );
}

const styles = StyleSheet.create({
  card: { height: CARD_HEIGHT, overflow: "hidden" },
  art: { position: "absolute", top: 0, left: 0, right: 0, height: CARD_HEIGHT - 70, paddingBottom: 70 },
  tags: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryPill: {
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: { fontSize: 12, fontWeight: "700", color: colors.brand },
  info: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: INFO_HEIGHT,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 5,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 14, color: colors.muted, flexShrink: 1 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 },
  price: { fontSize: 20, fontWeight: "800", color: colors.brand },
  negotiable: { fontSize: 13, fontWeight: "600", color: colors.muted },
});
