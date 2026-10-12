import { formatJobDate, formatPriceCents, type JobDetail } from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../../src/components/ui";
import { BackLink } from "../../src/features/jobs/BackLink";
import {
  DemoBadge,
  ErrorBox,
  LoadingBox,
  StatusBadge,
  formatLocalDate,
} from "../../src/features/jobs/components";
import { useJobDetail } from "../../src/features/jobs/hooks";
import { useSessionState } from "../../src/features/auth/SessionState";

/** Detalhes da oportunidade (PRD 13.4 e 29.4): público; o interesse exige login. */
export default function JobDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { state, retry } = useJobDetail(id);

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Oportunidade" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink title="← Voltar" />
        {state.status === "loading" ? (
          <LoadingBox label="Carregando oportunidade…" />
        ) : state.status === "error" ? (
          <View style={styles.gap}>
            <ErrorBox error={state.error} onRetry={retry} />
            {state.error.kind === "not_found" ? <ExploreLink /> : null}
          </View>
        ) : (
          <Detail job={state.data} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExploreLink() {
  const router = useRouter();
  return <Button title="Ver outras oportunidades" onPress={() => router.replace("/explorar")} />;
}

function Detail({ job }: { job: JobDetail }) {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();

  return (
    <View style={styles.card}>
      <View style={styles.badges}>
        <Text style={styles.category}>{job.category.name}</Text>
        <StatusBadge status={job.status} />
        {job.isDemo ? <DemoBadge /> : null}
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {job.title}
      </Text>

      {job.statusMessage ? (
        <View
          style={[styles.notice, job.acceptingInterests ? styles.noticeInfo : styles.noticeClosed]}
          accessibilityRole="alert"
        >
          <Text style={styles.noticeText}>{job.statusMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.price}>
        {formatPriceCents(job.proposedPriceCents)}
        <Text style={styles.negotiable}>{job.negotiable ? " · valor negociável" : " · valor fixo"}</Text>
      </Text>

      <View style={styles.facts}>
        <Fact label="Local" value={`${job.city}/${job.state}`} />
        <Fact label="Data prevista" value={formatJobDate(job.scheduledDate)} />
        <Fact label="Horário" value={job.startTime} />
        <Fact label="Publicação até" value={formatLocalDate(job.expiresAt)} />
      </View>

      <Text style={styles.section}>Descrição</Text>
      <Text style={styles.body}>{job.description}</Text>

      {job.additionalInfo ? (
        <>
          <Text style={styles.section}>Informações adicionais</Text>
          <Text style={styles.body}>{job.additionalInfo}</Text>
        </>
      ) : null}

      <Text style={styles.section}>Contratante</Text>
      <Text style={styles.body}>
        {job.owner.name} · {job.owner.city}
        {job.owner.isDemo ? " (dado de demonstração)" : ""}
      </Text>

      <View style={styles.action}>
        {!job.acceptingInterests ? (
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
        ) : sessionState.status === "authenticated" ? (
          <>
            <Button title="Tenho interesse" disabled onPress={() => undefined} />
            <Text style={styles.hint}>
              Em breve: o registro de interesse será liberado na próxima etapa do Freelah.
            </Text>
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
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 48, gap: 8 },
  gap: { gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 10 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  category: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  notice: { borderRadius: 10, padding: 12 },
  noticeInfo: { backgroundColor: "#E8F0FE" },
  noticeClosed: { backgroundColor: "#FFF4E5" },
  noticeText: { fontSize: 14, color: colors.text, fontWeight: "600" },
  price: { fontSize: 24, fontWeight: "800", color: colors.text },
  negotiable: { fontSize: 14, fontWeight: "600", color: colors.muted },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fact: { minWidth: 120, gap: 2 },
  factLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  factValue: { fontSize: 16, color: colors.text, fontWeight: "600" },
  section: { fontSize: 14, fontWeight: "700", color: colors.muted, marginTop: 8 },
  body: { fontSize: 16, color: "#3C4650", lineHeight: 22 },
  action: { marginTop: 16, gap: 8 },
  hint: { fontSize: 13, color: colors.muted, textAlign: "center" },
});
