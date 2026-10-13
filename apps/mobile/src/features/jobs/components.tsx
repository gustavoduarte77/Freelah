import {
  formatJobDate,
  formatPriceCents,
  isRecoverableError,
  type Category,
  type JobSummary,
  type JobsApiError,
  type PublicJobStatus,
} from "@freelah/shared";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { InteractiveCard } from "../../components/InteractiveCard";
import { Button, colors } from "../../components/ui";
import { radius } from "../../theme";
import { JobArt } from "./JobArt";
import { useRecovery } from "../recovery/RecoveryProvider";

export const STATUS_LABEL: Record<PublicJobStatus, string> = {
  PUBLISHED: "Aceitando interessados",
  NEGOTIATING: "Em negociação",
  HIRED: "Contratada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  EXPIRED: "Prazo encerrado",
};

/** Selo dos dados de demonstração (PRD 38.2). */
export function DemoBadge() {
  return (
    <View style={styles.demo} accessibilityLabel="Dado de demonstração">
      <Text style={styles.demoText}>Demonstração</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: PublicJobStatus }) {
  const open = status === "PUBLISHED" || status === "NEGOTIATING";
  return (
    <View style={[styles.status, open ? styles.statusOpen : styles.statusClosed]}>
      <Text style={[styles.statusText, open ? styles.statusTextOpen : styles.statusTextClosed]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

/** Oportunidade em linha (visualização em lista e Home): ilustração pequena e dados lado a lado. */
export function JobCard({ job }: { job: JobSummary }) {
  const router = useRouter();
  return (
    <InteractiveCard
      label={`Abrir oportunidade ${job.title}`}
      onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: job.id } })}
      style={styles.card}
    >
      <JobArt categorySlug={job.category.slug} iconSize={34} style={styles.thumb} />
      <View style={styles.cardBody}>
        <View style={styles.badges}>
          <Text style={styles.category}>{job.category.name}</Text>
          {job.status !== "PUBLISHED" ? <StatusBadge status={job.status} /> : null}
          {job.isDemo ? <DemoBadge /> : null}
        </View>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.excerpt} numberOfLines={2}>
          {job.excerpt}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="pin" size={13} color={colors.muted} />
          <Text style={styles.meta}>
            {job.city}/{job.state}
          </Text>
          <Icon name="calendar" size={13} color={colors.muted} />
          <Text style={styles.meta}>
            {formatJobDate(job.scheduledDate)} às {job.startTime}
          </Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.price}>{formatPriceCents(job.proposedPriceCents)}</Text>
        {job.negotiable ? <Text style={styles.negotiable}>negociável</Text> : null}
        <Text style={styles.open}>Ver detalhes</Text>
      </View>
    </InteractiveCard>
  );
}

export function LoadingBox({ label = "Carregando…" }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

/**
 * Erro de carregamento. Falhas de conexão ou do servidor são recuperadas pelo aviso de conexão
 * (um botão só para a tela inteira); aqui o botão só aparece para erros que exigem uma ação
 * específica (pedido recusado ou resposta inválida). "Não encontrada" não tem nova tentativa.
 */
export function ErrorBox({
  error,
  onRetry,
}: {
  error: JobsApiError;
  onRetry?: () => void;
}) {
  const ownRetry = onRetry && error.kind !== "not_found" && !isRecoverableError(error);
  return (
    <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={styles.errorTitle}>Não foi possível carregar</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      {ownRetry ? <Button title="Tentar de novo" onPress={onRetry} /> : null}
    </View>
  );
}

/** Hora local HH:MM de um instante em milissegundos. */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Aviso único de conexão da tela: aparece quando alguma consulta falhou por rede ou servidor.
 * Mostra se o app está tentando reconectar sozinho e oferece UM botão para tentar de novo.
 */
export function ConnectionBanner() {
  const { state, retryNow } = useRecovery();
  if (!state.failed) return null;
  const gaveUp = state.status === "gave_up";
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="connection-banner"
    >
      <Text style={styles.bannerTitle}>Sem conexão com o servidor</Text>
      <Text style={styles.bannerText}>
        {gaveUp
          ? "Não conseguimos reconectar. Verifique sua conexão; também tentamos de novo quando você voltar para esta tela."
          : "Estamos tentando reconectar sozinhos. O que já estava na tela continua visível, mas pode estar desatualizado."}
      </Text>
      <Button title="Tentar de novo" onPress={retryNow} />
    </View>
  );
}

/** Dados antigos na tela: nunca aparecem como se estivessem atualizados. */
export function StaleNotice({
  loadedAt,
  refreshing,
  failed,
}: {
  loadedAt: number;
  refreshing: boolean;
  failed: boolean;
}) {
  if (!failed && !refreshing) return null;
  return (
    <Text
      style={failed ? styles.staleFailed : styles.staleInfo}
      accessibilityLiveRegion="polite"
      testID="stale-notice"
    >
      {failed
        ? `Não foi possível atualizar. Mostrando os dados de ${formatClock(loadedAt)}.`
        : "Atualizando…"}
    </Text>
  );
}

export function EmptyBox({ title, text }: { title: string; text?: string }) {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <Icon name="inbox" size={36} color={colors.brandBorder} strokeWidth={1.5} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.muted}>{text}</Text> : null}
    </View>
  );
}

export function CategoryChips({
  categories,
  selected,
  onSelect,
  showAll = true,
}: {
  categories: Category[];
  /** Slug selecionado; `null` = todas. `undefined` em `onSelect` limpa o filtro. */
  selected: string | null;
  onSelect: (slug: string | null) => void;
  /** Mostra o chip "Todas" (filtros). No formulário de publicação não faz sentido. */
  showAll?: boolean;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {showAll ? (
        <Chip label="Todas" active={selected === null} onPress={() => onSelect(null)} />
      ) : null}
      {categories.map((category) => (
        <Chip
          key={category.id}
          label={category.name}
          active={selected === category.slug}
          onPress={() => onSelect(selected === category.slug ? null : category.slug)}
        />
      ))}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, selected: active }}
      aria-checked={active}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

/** Data local (dia/mês/ano) de um instante ISO, sem depender de Intl. */
export function formatLocalDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  thumb: { width: 104, height: 104, borderRadius: radius.md },
  cardBody: { flex: 1, minWidth: 200, gap: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  priceCol: { alignItems: "flex-end", gap: 2, marginLeft: "auto" },
  open: { fontSize: 13, fontWeight: "700", color: colors.brand, marginTop: 6 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  category: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  excerpt: { fontSize: 14, color: "#3C4650" },
  price: { fontSize: 17, fontWeight: "800", color: colors.text },
  negotiable: { fontSize: 13, fontWeight: "600", color: colors.muted },
  meta: { fontSize: 13, color: colors.muted },
  demo: { backgroundColor: "#FFF4E5", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  demoText: { fontSize: 11, fontWeight: "700", color: "#7A4B00" },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusOpen: { backgroundColor: "#E3F3EA" },
  statusClosed: { backgroundColor: "#ECEEF1" },
  statusText: { fontSize: 11, fontWeight: "700" },
  statusTextOpen: { color: "#1B7F4B" },
  statusTextClosed: { color: "#4A5560" },
  center: { alignItems: "center", gap: 8, padding: 24 },
  muted: { fontSize: 14, color: colors.muted, textAlign: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 16, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: "700", color: colors.error },
  errorText: { fontSize: 14, color: "#5C2420" },
  banner: { backgroundColor: "#FFF4E5", borderRadius: 12, padding: 16, gap: 8 },
  bannerTitle: { fontSize: 16, fontWeight: "700", color: "#7A4B00" },
  bannerText: { fontSize: 14, color: "#5C3B00" },
  staleFailed: { fontSize: 13, fontWeight: "600", color: "#7A4B00" },
  staleInfo: { fontSize: 13, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    cursor: "pointer",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  chipTextActive: { color: "#FFFFFF" },
});
