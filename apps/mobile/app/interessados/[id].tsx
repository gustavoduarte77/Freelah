import {
  INTEREST_STATUS_LABEL,
  type JobInterest,
  type MyJobsApiError,
  type OwnJob,
} from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../../src/components/ui";
import { useSessionState } from "../../src/features/auth/SessionState";
import { BackLink } from "../../src/features/jobs/BackLink";
import { EmptyBox, LoadingBox } from "../../src/features/jobs/components";
import { myJobsApi } from "../../src/features/publish/api";

type State =
  | { status: "loading" }
  | { status: "ready"; job: OwnJob; interests: JobInterest[] }
  | { status: "error"; error: MyJobsApiError };

const brDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Interessados (PRD 29.8): só a dona da oportunidade vê quem demonstrou interesse (nome e cidade). */
export default function InterestedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = (Array.isArray(id) ? id[0] : id) ?? "";
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Interessados" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink title="← Voltar" />
        <Text style={styles.title} accessibilityRole="header">
          Interessados
        </Text>
        {sessionState.status === "loading" ? (
          <LoadingBox label="Verificando sua sessão…" />
        ) : sessionState.status === "unknown" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.</Text>
            <Button title="Verificar de novo" onPress={recheck} />
          </View>
        ) : sessionState.status === "unauthenticated" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Entre para ver os interessados nas suas oportunidades.</Text>
            <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect: `/interessados/${jobId}` } })} />
          </View>
        ) : (
          <InterestedList key={`${sessionState.session.user.id}:${jobId}`} jobId={jobId} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InterestedList({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const [job, interests] = await Promise.all([myJobsApi.get(jobId), myJobsApi.jobInterests(jobId)]);
      setState({ status: "ready", job, interests });
    } catch (error) {
      setState({ status: "error", error: error as MyJobsApiError });
    }
  }, [jobId]);

  useEffect(() => {
    let active = true;
    Promise.all([myJobsApi.get(jobId), myJobsApi.jobInterests(jobId)]).then(
      ([job, interests]) => active && setState({ status: "ready", job, interests }),
      (error: unknown) => active && setState({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, [jobId]);

  if (state.status === "loading") return <LoadingBox label="Carregando interessados…" />;
  if (state.status === "error") {
    return (
      <View style={styles.errorBox} accessibilityRole="alert" testID="interested-error">
        <Text style={styles.errorText}>
          {state.error.kind === "not_found"
            ? "Não encontramos esta oportunidade entre as suas."
            : state.error.kind === "unauthorized"
              ? state.error.message
              : `Não foi possível carregar os interessados. ${state.error.message}`}
        </Text>
        {state.error.kind === "unauthorized" ? (
          <Button title="Entrar de novo" onPress={() => router.push({ pathname: "/entrar", params: { redirect: `/interessados/${jobId}` } })} />
        ) : state.error.kind === "not_found" ? null : (
          <Button title="Tentar de novo" onPress={() => (setState({ status: "loading" }), void load())} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      <Text style={styles.jobTitle}>{state.job.title}</Text>
      <Button title="Atualizar" variant="link" onPress={() => void load()} />
      {state.interests.length === 0 ? (
        <EmptyBox title="Ninguém demonstrou interesse ainda" text="Quando alguém demonstrar, aparece aqui." />
      ) : (
        state.interests.map((interest) => (
          <View key={interest.id} style={styles.card} testID="interested">
            <Text style={styles.name}>{interest.worker.name}</Text>
            <Text style={styles.meta}>
              {interest.worker.city} · demonstrou interesse em {brDate(interest.createdAt)}
            </Text>
            <Text style={styles.status}>{INTEREST_STATUS_LABEL[interest.status]}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  jobTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 4 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  status: { fontSize: 14, fontWeight: "700", color: colors.brand },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
