import {
  type JobInterest,
  type MyJobsApiError,
  type OwnJob,
} from "@freelah/shared";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../../src/components/ui";
import { useSessionState } from "../../src/features/auth/SessionState";
import { Breadcrumb } from "../../src/components/Breadcrumb";
import { PAGE_PADDING, shadow } from "../../src/theme";
import { EmptyBox, LoadingBox } from "../../src/features/jobs/components";
import { useOpenChat } from "../../src/features/chat/useOpenChat";
import { myJobsApi } from "../../src/features/publish/api";

type State =
  | { status: "loading" }
  | { status: "ready"; job: OwnJob; interests: JobInterest[] }
  | { status: "error"; error: MyJobsApiError };

/** Situação de cada pessoa na ótica da contratante (o trabalhador vê outros rótulos em suas telas). */
const OWNER_INTEREST_LABEL: Record<JobInterest["status"], string> = {
  PENDING: "Interessado",
  ACCEPTED: "Selecionado",
  REJECTED: "Não selecionado",
  WITHDRAWN: "Interesse retirado",
};

const brDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Interessados (PRD 29.8): só a dona da oportunidade vê quem demonstrou interesse (nome e cidade). */
export default function InterestedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = (Array.isArray(id) ? id[0] : id) ?? "";
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Interessados" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Breadcrumb items={[{ label: "Minhas oportunidades", href: "/minhas-oportunidades" }, { label: "Interessados" }]} />
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

  // Ao voltar para esta tela (por exemplo, depois de uma conversa), confere a lista de novo.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void load();
    }, [load]),
  );

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

  const open = state.job.status === "PUBLISHED" || state.job.status === "NEGOTIATING";
  return (
    <View style={styles.gap}>
      <Text style={styles.jobTitle}>{state.job.title}</Text>
      {state.job.hiredWorkerName ? (
        <Text style={styles.hired} testID="interested-hired">
          {state.job.status === "COMPLETED" ? "Serviço concluído com " : "Contratado: "}
          {state.job.hiredWorkerName}
        </Text>
      ) : null}
      {state.interests.length === 0 ? (
        <EmptyBox title="Ninguém demonstrou interesse ainda" text="Quando alguém demonstrar, aparece aqui." />
      ) : (
        state.interests.map((interest) => (
          <InterestedCard key={interest.id} interest={interest} canSelect={open} onChanged={() => void load()} />
        ))
      )}
    </View>
  );
}

function InterestedCard({
  interest,
  canSelect,
  onChanged,
}: {
  interest: JobInterest;
  /** A oportunidade ainda está aberta: dá para selecionar quem está pendente. */
  canSelect: boolean;
  /** A API mudou o estado (ou recusou por ele ter mudado): recarrega a lista. */
  onChanged: () => void;
}) {
  const chat = useOpenChat();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function select() {
    if (inFlight.current) return; // ignora cliques repetidos antes de a tela atualizar
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await myJobsApi.selectInterest(interest.id); // só vale com a resposta da API
      setConfirming(false);
      onChanged();
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setConfirming(false);
      if (failure.outcomeUnknown) {
        setError("Não conseguimos confirmar a seleção. Atualizamos a lista: confira o estado antes de tentar de novo.");
        onChanged();
      } else if (failure.kind === "invalid_state") {
        setError(failure.message);
        onChanged();
      } else {
        setError(failure.kind === "unauthorized" ? failure.message : "Não foi possível selecionar. Nada foi alterado.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.card} testID="interested">
      <Text style={styles.name}>{interest.worker.name}</Text>
      <Text style={styles.meta}>
        {interest.worker.city} · demonstrou interesse em {brDate(interest.createdAt)}
      </Text>
      <Text style={styles.status}>{OWNER_INTEREST_LABEL[interest.status]}</Text>
      {interest.status === "PENDING" || interest.status === "ACCEPTED" ? (
        <Button title="Conversar" variant="secondary" onPress={() => void chat.open(interest.id)} loading={chat.busy} disabled={chat.busy} />
      ) : null}
      {chat.error ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID="chat-open-error">
          {chat.error}
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID="select-error">
          {error}
        </Text>
      ) : null}
      {canSelect && interest.status === "PENDING" ? (
        confirming ? (
          <View style={styles.confirm} accessibilityRole="alert" testID="select-confirm">
            <Text style={styles.confirmText}>
              Selecionar {interest.worker.name}? As outras pessoas interessadas serão marcadas como não selecionadas e não dá para desfazer.
            </Text>
            <Button title="Confirmar seleção" onPress={() => void select()} loading={busy} disabled={busy} />
            <Button title="Voltar" variant="link" onPress={() => setConfirming(false)} disabled={busy} />
          </View>
        ) : (
          <Button title="Selecionar" onPress={() => setConfirming(true)} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  jobTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, boxShadow: shadow.card, padding: 18, gap: 8 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  status: { fontSize: 14, fontWeight: "700", color: colors.brand },
  hired: { fontSize: 15, fontWeight: "700", color: colors.brand },
  confirm: { backgroundColor: "#EAF1FD", borderRadius: 12, padding: 12, gap: 6 },
  confirmText: { fontSize: 14, color: colors.text },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
