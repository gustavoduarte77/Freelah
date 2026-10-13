import {
  INTEREST_STATUS_LABEL,
  formatBrDate,
  formatPriceCents,
  type MyInterest,
  type MyJobsApiError,
} from "@freelah/shared";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InteractiveCard } from "../src/components/InteractiveCard";
import { Button, colors } from "../src/components/ui";
import { CONTENT_MAX_WIDTH, PAGE_PADDING, useBreakpoint } from "../src/theme";
import { useSessionState } from "../src/features/auth/SessionState";
import { EmptyBox, LoadingBox, StatusBadge } from "../src/features/jobs/components";
import { useOpenChat } from "../src/features/chat/useOpenChat";
import { myJobsApi } from "../src/features/publish/api";

/** Interesses retirados saem da lista (o registro continua na API); os demais estados continuam visíveis. */
const activeOnly = (interests: MyInterest[]) => interests.filter((interest) => interest.status !== "WITHDRAWN");

type ListState =
  | { status: "loading" }
  | { status: "ready"; interests: MyInterest[]; refreshFailed: boolean }
  | { status: "error"; error: MyJobsApiError };

/** Meus interesses (PRD 29.10): as oportunidades em que a pessoa demonstrou interesse e o estado de cada uma. */
export default function MyInterestsScreen() {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Meus interesses" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            Meus interesses
          </Text>
          <Text style={styles.subtitle}>Oportunidades em que você demonstrou interesse. Toque num cartão para abrir.</Text>
        </View>
        {sessionState.status === "loading" ? (
          <LoadingBox label="Verificando sua sessão…" />
        ) : sessionState.status === "unknown" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.</Text>
            <Button title="Verificar de novo" onPress={recheck} />
          </View>
        ) : sessionState.status === "unauthenticated" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Entre para ver as oportunidades em que você demonstrou interesse.</Text>
            <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect: "/meus-interesses" } })} />
          </View>
        ) : (
          <InterestsList key={sessionState.session.user.id} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InterestsList() {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const { width } = useBreakpoint();
  const columns = width >= 1500 ? 3 : width >= 1000 ? 2 : 1;

  /** Recarrega a lista; se falhar, a que já estava na tela continua. */
  const load = useCallback(async () => {
    try {
      const interests = await myJobsApi.myInterests();
      setState({ status: "ready", interests: activeOnly(interests), refreshFailed: false });
    } catch (error) {
      setState((current) =>
        current.status === "ready" ? { ...current, refreshFailed: true } : { status: "error", error: error as MyJobsApiError },
      );
    }
  }, []);

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
    myJobsApi.myInterests().then(
      (interests) => active && setState({ status: "ready", interests: activeOnly(interests), refreshFailed: false }),
      (error: unknown) => active && setState({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") return <LoadingBox label="Carregando seus interesses…" />;
  if (state.status === "error") {
    return (
      <View style={styles.errorBox} accessibilityRole="alert" testID="my-interests-error">
        <Text style={styles.errorText}>
          {state.error.kind === "unauthorized" ? state.error.message : `Não foi possível carregar seus interesses. ${state.error.message}`}
        </Text>
        <Button
          title={state.error.kind === "unauthorized" ? "Entrar de novo" : "Tentar de novo"}
          onPress={() =>
            state.error.kind === "unauthorized"
              ? router.push({ pathname: "/entrar", params: { redirect: "/meus-interesses" } })
              : (setState({ status: "loading" }), void load())
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      {state.refreshFailed ? (
        <Text style={styles.errorText}>Não foi possível atualizar agora; esta é a última lista carregada.</Text>
      ) : null}
      {state.interests.length === 0 ? (
        <EmptyBox title="Você ainda não demonstrou interesse em nada" text="Abra uma oportunidade em Explorar e toque em “Tenho interesse”." />
      ) : (
        <View style={styles.grid}>
        {state.interests.map((interest) => (
          <View key={interest.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
          <InterestCard
            interest={interest}
            onChanged={(changed) =>
              setState((current) =>
                current.status === "ready"
                  ? {
                      ...current,
                      interests: current.interests
                        .map((item) => (item.id === changed.id ? { ...item, status: changed.status } : item))
                        .filter((item) => item.status !== "WITHDRAWN"),
                    }
                  : current,
              )
            }
          />
          </View>
        ))}
        </View>
      )}
    </View>
  );
}

function InterestCard({
  interest,
  onChanged,
}: {
  interest: MyInterest;
  onChanged: (changed: { id: string; status: MyInterest["status"] }) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job } = interest;
  const chat = useOpenChat();

  async function withdraw() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await myJobsApi.withdrawInterest(interest.id)); // só muda com a resposta da API
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setError(
        failure.outcomeUnknown
          ? "Não conseguimos confirmar se o interesse foi retirado. Saia desta tela e volte para conferir o estado atual."
          : failure.kind === "unauthorized" || failure.kind === "invalid_state"
            ? failure.message
            : "Não foi possível retirar agora. Nada foi alterado.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <InteractiveCard
      label={`Abrir oportunidade ${job.title}`}
      onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: job.id } })}
      style={styles.card}
      testID="my-interest"
    >
      <View style={styles.badges}>
        <Text style={styles.category}>{job.category}</Text>
        <StatusBadge status={job.status} />
      </View>
      <Text style={styles.jobTitle}>{job.title}</Text>
      <Text style={styles.meta}>
        {formatPriceCents(job.proposedPriceCents)}
        {job.negotiable ? " · negociável" : ""} · {job.city}/{job.state}
      </Text>
      <Text style={styles.meta}>
        Serviço em {formatBrDate(job.scheduledDate)} às {job.startTime} · contratante: {job.ownerName}
      </Text>
      <Text style={styles.interestStatus} testID="my-interest-status">
        {INTEREST_STATUS_LABEL[interest.status]}
      </Text>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID="my-interest-error">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
      {interest.status === "PENDING" || interest.status === "ACCEPTED" ? (
        <Button title="Conversar" variant="secondary" onPress={() => void chat.open(interest.id)} loading={chat.busy} disabled={chat.busy} />
      ) : null}
      {chat.error ? (
        <Text style={styles.errorText} accessibilityRole="alert" testID="chat-open-error">
          {chat.error}
        </Text>
      ) : null}
      {interest.status === "PENDING" ? (
        <Button title="Retirar interesse" variant="danger" onPress={() => void withdraw()} loading={busy} disabled={busy} />
      ) : null}
      </View>
    </InteractiveCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
  headerText: { gap: 4 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 },
  cell: { padding: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  card: { padding: 18, gap: 8 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  category: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  jobTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  interestStatus: { fontSize: 14, fontWeight: "700", color: colors.brand },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
