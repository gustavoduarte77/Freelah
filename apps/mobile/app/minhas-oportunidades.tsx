import type { MyJobsApiError, OwnJob } from "@freelah/shared";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../src/components/ui";
import { useSessionState } from "../src/features/auth/SessionState";
import { BackLink } from "../src/features/jobs/BackLink";
import { EmptyBox, LoadingBox, StaleNotice } from "../src/features/jobs/components";
import { exploreJobsController, homeJobsController } from "../src/features/jobs/registry";
import { myJobsApi } from "../src/features/publish/api";
import { MyJobCard } from "../src/features/publish/MyJobCard";

type ListState =
  | { status: "loading" }
  /** Se uma atualização falha, a lista que já estava na tela continua, marcada como desatualizada. */
  | { status: "ready"; jobs: OwnJob[]; loadedAt: number; refreshError: MyJobsApiError | null }
  | { status: "error"; error: MyJobsApiError };

/** Minhas oportunidades (versão mínima): lista, publica rascunhos e serve para conferir um envio não confirmado. */
export default function MyJobsScreen() {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Minhas oportunidades" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink title="← Voltar" />
        <Text style={styles.title} accessibilityRole="header">
          Minhas oportunidades
        </Text>
        {sessionState.status === "loading" ? (
          <LoadingBox label="Verificando sua sessão…" />
        ) : sessionState.status === "unknown" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>
              Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.
            </Text>
            <Button title="Verificar de novo" onPress={recheck} />
          </View>
        ) : sessionState.status === "unauthenticated" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Entre para ver as oportunidades que você publicou.</Text>
            <Button
              title="Entrar"
              onPress={() =>
                router.push({ pathname: "/entrar", params: { redirect: "/minhas-oportunidades" } })
              }
            />
          </View>
        ) : (
          <MyJobsList userId={sessionState.session.user.id} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MyJobsList({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [reloading, setReloading] = useState(false);

  /** Recarrega a lista. Em falha, mantém o que já estava na tela. Devolve se conseguiu. */
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const jobs = await myJobsApi.list();
      setState({ status: "ready", jobs, loadedAt: Date.now(), refreshError: null });
      return true;
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? { ...current, refreshError: error as MyJobsApiError }
          : { status: "error", error: error as MyJobsApiError },
      );
      return false;
    }
  }, []);

  // Carrega ao abrir (e de novo se outra conta entrar). Resposta atrasada de uma tela já fechada é ignorada.
  useEffect(() => {
    let active = true;
    myJobsApi.list().then(
      (jobs) => active && setState({ status: "ready", jobs, loadedAt: Date.now(), refreshError: null }),
      (error: unknown) => active && setState({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  async function refresh() {
    setReloading(true);
    await load();
    setReloading(false);
  }

  /**
   * A API confirmou (ao publicar ou ao conferir): só então a lista muda, e só o cartão em questão,
   * com o registro devolvido por ela. Se agora está publicada, as listas públicas se atualizam.
   */
  function handleJobUpdated(updated: OwnJob) {
    setState((current) =>
      current.status === "ready"
        ? { ...current, jobs: current.jobs.map((job) => (job.id === updated.id ? updated : job)) }
        : current,
    );
    if (updated.status === "PUBLISHED" || updated.status === "NEGOTIATING") {
      homeJobsController.refresh();
      exploreJobsController.refresh();
    }
  }

  if (state.status === "loading") return <LoadingBox label="Carregando suas oportunidades…" />;
  if (state.status === "error") {
    return (
      <View style={styles.errorBox} accessibilityRole="alert" testID="my-jobs-error">
        <Text style={styles.errorText}>
          {state.error.kind === "unauthorized"
            ? state.error.message
            : `Não foi possível carregar suas oportunidades. ${state.error.message}`}
        </Text>
        {state.error.kind === "unauthorized" ? (
          <Button
            title="Entrar de novo"
            onPress={() =>
              router.push({ pathname: "/entrar", params: { redirect: "/minhas-oportunidades" } })
            }
          />
        ) : (
          <Button title="Tentar de novo" onPress={() => void refresh()} loading={reloading} />
        )}
      </View>
    );
  }
  return (
    <View style={styles.gap}>
      <StaleNotice loadedAt={state.loadedAt} refreshing={false} failed={state.refreshError !== null} />
      <Button title="Atualizar" variant="link" onPress={() => void refresh()} loading={reloading} />
      {state.jobs.length === 0 ? (
        <EmptyBox
          title="Você ainda não criou nenhuma oportunidade"
          text="Quando criar, ela aparece aqui, inclusive os rascunhos."
        />
      ) : (
        state.jobs.map((job) => (
          <MyJobCard key={job.id} job={job} onJobUpdated={handleJobUpdated} />
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
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
