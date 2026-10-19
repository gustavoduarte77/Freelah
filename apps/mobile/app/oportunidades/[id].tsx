import { describePriceTerms, formatJobDate, formatJobPrice, type JobDetail } from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Breadcrumb } from "../../src/components/Breadcrumb";
import { Icon, type IconName } from "../../src/components/Icon";
import { Button, colors } from "../../src/components/ui";
import {
  ConnectionBanner,
  DemoBadge,
  ErrorBox,
  LoadingBox,
  StaleNotice,
  StatusBadge,
  formatLocalDate,
} from "../../src/features/jobs/components";
import { useJobDetail } from "../../src/features/jobs/hooks";
import { JobMedia } from "../../src/features/jobs/JobMedia";
import { useSessionState } from "../../src/features/auth/SessionState";
import { InterestAction } from "../../src/features/interests/InterestAction";
import { CONTENT_MAX_WIDTH, PAGE_PADDING, radius, shadow, useBreakpoint } from "../../src/theme";

/** Detalhes da oportunidade (PRD 13.4 e 29.4): público; o interesse exige login. */
export default function JobDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { state, retry } = useJobDetail(id);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Oportunidade" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.navRow}>
          <BackButton />
          <Breadcrumb
            items={[
              { label: "Explorar", href: "/explorar" },
              { label: state.status === "ready" ? state.data.title : "Oportunidade" },
            ]}
          />
        </View>
        <ConnectionBanner />
        {state.status === "loading" ? (
          <LoadingBox label="Carregando oportunidade…" />
        ) : state.status === "error" ? (
          <View style={styles.gap}>
            <ErrorBox error={state.error} onRetry={retry} />
            {state.error.kind === "not_found" ? <ExploreLink /> : null}
          </View>
        ) : (
          <>
            <StaleNotice
              loadedAt={state.loadedAt}
              refreshing={state.refreshing}
              failed={state.refreshError !== null}
            />
            <Detail job={state.data} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Volta para de onde a pessoa veio (Home, Explorar, Meus interesses, uma conversa…), que o
 * breadcrumb não sabe dizer; sem histórico, vai para Explorar.
 */
function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar para a página anterior"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/explorar"))}
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

function ExploreLink() {
  const router = useRouter();
  return <Button title="Ver outras oportunidades" onPress={() => router.replace("/explorar")} />;
}

function Detail({ job }: { job: JobDetail }) {
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const { state: sessionState, recheck } = useSessionState();
  // null = ainda não sabemos se quem vê é a dona.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  // O aviso de negociação é para quem procura trabalho: some para a dona e, com sessão, só aparece
  // depois de confirmado que não é a dona (sem piscar). Os avisos de cancelada/expirada ficam sempre.
  const hideNotice =
    job.status === "NEGOTIATING" && (isOwner === true || (sessionState.status === "authenticated" && isOwner === null));

  return (
    <View style={[styles.layout, isWide ? styles.layoutWide : null]}>
      <View style={[styles.card, styles.mainCol]}>
        <JobMedia categorySlug={job.category.slug} images={job.images ?? []} photoCount={job.photoCount ?? 0} />
        <View style={styles.badges}>
          <Text style={styles.category}>{job.category.name}</Text>
          <StatusBadge status={job.status} />
          {job.isDemo ? <DemoBadge /> : null}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {job.title}
        </Text>

        {job.statusMessage && !hideNotice ? (
          <View
            style={[styles.notice, job.acceptingInterests ? styles.noticeInfo : styles.noticeClosed]}
            accessibilityRole="alert"
          >
            <Text style={styles.noticeText}>{job.statusMessage}</Text>
          </View>
        ) : null}

        <View style={styles.tiles}>
          <Tile icon="pin" label="Local" value={`${job.city}/${job.state}`} />
          <Tile icon="calendar" label="Data do serviço" value={formatJobDate(job.scheduledDate)} />
          <Tile icon="clock" label="Horário" value={job.startTime} />
        </View>

        <Text style={styles.section}>Sobre o serviço</Text>
        <Text style={styles.body}>{job.description}</Text>

        {job.additionalInfo ? (
          <>
            <Text style={styles.section}>Observações</Text>
            <Text style={styles.body}>{job.additionalInfo}</Text>
          </>
        ) : null}
      </View>

      <View style={[styles.card, styles.sideCol, isWide ? styles.sideWide : null]}>
        <Text style={styles.price}>{formatJobPrice(job.proposedPriceCents)}</Text>
        {describePriceTerms(job.proposedPriceCents, job.negotiable) ? (
          <Text style={styles.negotiable}>{describePriceTerms(job.proposedPriceCents, job.negotiable)}</Text>
        ) : null}

        <View style={styles.facts}>
          <Fact icon="calendar" label="Recebe interessados até" value={formatLocalDate(job.expiresAt)} />
          <Fact
            icon="user"
            label="Contratante"
            value={`${job.owner.name} · ${job.owner.city}${job.owner.isDemo ? " (dado de demonstração)" : ""}`}
          />
        </View>

        <View style={styles.action}>
          {sessionState.status === "authenticated" ? (
            <InterestAction jobId={job.id} accepting={job.acceptingInterests} onViewer={(viewer) => setIsOwner(viewer.isOwner)} />
          ) : !job.acceptingInterests ? (
            <Button title="Não aceita novos interessados" disabled onPress={() => undefined} />
          ) : sessionState.status === "loading" ? (
            <LoadingBox />
          ) : sessionState.status === "unknown" ? (
            <>
              <Button title="Tenho interesse" disabled onPress={() => undefined} />
              <Text style={styles.hint}>
                Não foi possível verificar sua sessão agora, então não sabemos se você já entrou.
                Vamos tentar de novo sozinhos.
              </Text>
              <Button title="Verificar de novo" variant="link" onPress={recheck} />
            </>
          ) : (
            <>
              <Button
                title="Tenho interesse"
                onPress={() =>
                  router.push({
                    pathname: "/entrar",
                    params: { redirect: `/oportunidades/${job.id}` },
                  })
                }
              />
              <Text style={styles.hint}>Entre ou crie uma conta para demonstrar interesse.</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={20} color={colors.brand} />
      </View>
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.tileValue}>{value}</Text>
      </View>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.brand} />
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    padding: PAGE_PADDING,
    paddingBottom: 48,
    gap: 14,
  },
  gap: { gap: 12 },
  layout: { gap: 20 },
  layoutWide: { flexDirection: "row", alignItems: "flex-start" },
  mainCol: { flex: 1, minWidth: 0 },
  sideCol: { gap: 6 },
  sideWide: { width: 420 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    padding: 24,
    gap: 10,
  },
  navRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  back: {
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
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  tile: {
    flexGrow: 1,
    flexBasis: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileValue: { fontSize: 18, fontWeight: "800", color: colors.text },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  category: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  notice: { borderRadius: 10, padding: 12 },
  noticeInfo: { backgroundColor: "#EAF1FD" },
  noticeClosed: { backgroundColor: "#FFF4E5" },
  noticeText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  price: { fontSize: 32, fontWeight: "800", color: colors.brand },
  negotiable: { fontSize: 14, fontWeight: "600", color: colors.muted },
  facts: { gap: 14, marginTop: 10 },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  factText: { flex: 1, gap: 1 },
  factLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  factValue: { fontSize: 16, color: colors.text, fontWeight: "600" },
  section: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 14 },
  body: { fontSize: 17, color: colors.textSoft, lineHeight: 26 },
  action: { marginTop: 18, gap: 8 },
  hint: { fontSize: 13, color: colors.muted, textAlign: "center" },
});
