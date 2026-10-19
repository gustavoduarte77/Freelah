import {
  EDIT_NO_CHANGES_MESSAGE,
  OWN_JOB_STATE_MESSAGES,
  buildUpdateJobRequest,
  describeCheckDraftError,
  describeUpdateJobError,
  formatBrDate,
  interpretCheckedEdit,
  mapServerFields,
  priceStateOf,
  type JobFormErrors,
  type MyJobsApiError,
  type OwnJob,
  type UpdateJobRequest,
} from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../../src/components/ui";
import { useSessionState } from "../../src/features/auth/SessionState";
import { Breadcrumb } from "../../src/components/Breadcrumb";
import { PAGE_PADDING } from "../../src/theme";
import { ConnectionBanner, ErrorBox, LoadingBox } from "../../src/features/jobs/components";
import { useCategories } from "../../src/features/jobs/hooks";
import { exploreJobsController, homeJobsController } from "../../src/features/jobs/registry";
import { myJobsApi } from "../../src/features/publish/api";
import {
  discardEditSession,
  getEditSession,
  startEditSession,
  type EditSession,
} from "../../src/features/publish/editSessions";
import { PublishForm } from "../../src/features/publish/PublishForm";

const STALE_NOTICE =
  "Esta oportunidade foi alterada em outro lugar desde que você começou a editar. Carregamos a versão atual; o que você tinha digitado não foi mantido.";
const CHANGED_NOTICE =
  "Esta oportunidade foi alterada desde que você abriu a edição. Não dá para saber se foi o seu salvamento ou outra tela, então carregamos a versão atual para você conferir.";
const UNCHANGED_NOTE =
  "Conferimos: as alterações não foram salvas. O que você digitou continua no formulário; você pode tentar salvar de novo.";

/** Editar oportunidade (PRD 14 e 16): exige login; a API decide se o estado atual permite editar. */
export default function EditJobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Array.isArray(id) ? id[0] : id;
  const { state: sessionState, recheck } = useSessionState();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef({ card: 0, body: 0 });

  const scrollToY = (y: number) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current.card + offsets.current.body + y), animated: true });

  const redirect = `/editar/${jobId ?? ""}`;
  let body: ReactNode;
  if (!jobId) {
    body = <Text style={styles.text}>Oportunidade não encontrada.</Text>;
  } else if (sessionState.status === "loading") {
    body = <LoadingBox label="Verificando sua sessão…" />;
  } else if (sessionState.status === "unknown") {
    body = (
      <View style={styles.gap}>
        <Text style={styles.text}>
          Não foi possível verificar sua sessão agora, então não sabemos se você já entrou. Vamos tentar de
          novo sozinhos.
        </Text>
        <Button title="Verificar de novo" onPress={recheck} />
      </View>
    );
  } else if (sessionState.status === "unauthenticated") {
    body = (
      <View style={styles.gap} testID="edit-login-gate">
        <Text style={styles.text}>Entre para editar suas oportunidades.</Text>
        <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect } })} />
      </View>
    );
  } else {
    body = (
      <EditJob key={sessionState.session.user.id} jobId={jobId} userId={sessionState.session.user.id} scrollToY={scrollToY} />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Editar oportunidade" }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Breadcrumb items={[{ label: "Minhas oportunidades", href: "/minhas-oportunidades" }, { label: "Editar oportunidade" }]} />
        <ConnectionBanner />
        <View
          style={styles.card}
          onLayout={(e: LayoutChangeEvent) => {
            offsets.current.card = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.title} accessibilityRole="header">
            Editar oportunidade
          </Text>
          <View
            onLayout={(e: LayoutChangeEvent) => {
              offsets.current.body = e.nativeEvent.layout.y;
            }}
          >
            {body}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: MyJobsApiError }
  /** A API diz que o estado atual não permite editar: não há formulário. */
  | { status: "locked"; job: OwnJob }
  | { status: "ready"; session: EditSession; notice: string | null };

type SaveState =
  | { kind: "idle"; note?: string }
  | { kind: "saving" }
  | { kind: "checking" }
  | { kind: "saved"; job: OwnJob }
  | { kind: "failed"; message: string; checkNow: boolean; stale: boolean; needsSignIn: boolean };

function EditJob({ jobId, userId, scrollToY }: { jobId: string; userId: string; scrollToY: (y: number) => void }) {
  const router = useRouter();
  const categories = useCategories();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const inFlight = useRef(false);
  const ticket = useRef(0);

  const goToList = () => (router.canGoBack() ? router.back() : router.replace("/minhas-oportunidades"));
  const signIn = () => {
    // O aviso já foi lido; ao voltar do login a edição segue de onde parou (o formulário foi mantido).
    setSave({ kind: "idle" });
    router.push({ pathname: "/entrar", params: { redirect: `/editar/${jobId}` } });
  };

  /** Mostra a oportunidade lida da API: formulário preenchido, ou aviso se o estado não permite editar. */
  const open = useCallback(
    (job: OwnJob, forceNew: boolean, notice: string | null) => {
      if (!job.canEdit) {
        discardEditSession(job.id);
        setLoad({ status: "locked", job });
        return;
      }
      const existing = forceNew ? null : getEditSession(job.id, userId);
      if (existing && existing.original.updatedAt === job.updatedAt) {
        // Mesma versão: a edição guardada (por exemplo, antes de ir ao login) continua valendo.
        setLoad({ status: "ready", session: existing, notice: null });
        return;
      }
      const session = startEditSession(job, userId);
      setLoad({ status: "ready", session, notice: notice ?? (existing ? STALE_NOTICE : null) });
    },
    [userId],
  );

  const fetchJob = useCallback(
    async (forceNew: boolean, notice: string | null) => {
      const mine = ++ticket.current;
      try {
        const job = await myJobsApi.get(jobId);
        if (mine === ticket.current) open(job, forceNew, notice);
      } catch (error) {
        if (mine === ticket.current) setLoad({ status: "error", error: error as MyJobsApiError });
      }
    },
    [jobId, open],
  );

  /** Volta a carregar (o estado inicial já é "carregando"; aqui só quando a pessoa pede de novo). */
  function reload(forceNew: boolean, notice: string | null) {
    setLoad({ status: "loading" });
    setSave({ kind: "idle" });
    void fetchJob(forceNew, notice);
  }

  // Carrega ao abrir. Resposta atrasada de uma tela já fechada é ignorada.
  useEffect(() => {
    let active = true;
    myJobsApi.get(jobId).then(
      (job) => active && open(job, false, null),
      (error: unknown) => active && setLoad({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, [jobId, open]);

  async function send(session: EditSession, changes: UpdateJobRequest) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSave({ kind: "saving" });
    try {
      const updated = await myJobsApi.update(jobId, changes, session.original.updatedAt);
      discardEditSession(jobId);
      setSave({ kind: "saved", job: updated });
      if (updated.status === "PUBLISHED" || updated.status === "NEGOTIATING") {
        homeJobsController.refresh();
        exploreJobsController.refresh();
      }
    } catch (caught) {
      const failure = describeUpdateJobError(caught as MyJobsApiError);
      if (Object.keys(failure.fields).length > 0) session.form.setErrors(mapServerFields(failure.fields));
      setSave({ kind: "failed", ...failure });
    } finally {
      inFlight.current = false;
    }
  }

  /** Lê só esta oportunidade e conta o que a API confirmou, sem reenviar nada. */
  async function checkNow(session: EditSession) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSave({ kind: "checking" });
    try {
      const current = await myJobsApi.get(jobId);
      const outcome = interpretCheckedEdit(session.original.updatedAt, current);
      if (outcome === "unchanged") {
        setSave({ kind: "idle", note: UNCHANGED_NOTE });
      } else if (outcome === "changed") {
        open(current, true, CHANGED_NOTICE);
        setSave({ kind: "idle" });
      } else {
        open(current, true, null); // travada: mostra o motivo
        setSave({ kind: "idle" });
      }
    } catch (caught) {
      const failure = describeCheckDraftError(caught as MyJobsApiError);
      setSave({
        kind: "failed",
        message: failure.message,
        checkNow: failure.retryCheck,
        stale: false,
        needsSignIn: failure.needsSignIn,
      });
    } finally {
      inFlight.current = false;
    }
  }

  if (save.kind === "saved") {
    return (
      <View style={styles.gap} testID="edit-job-done">
        <Text style={styles.success} accessibilityLiveRegion="polite">
          Alterações salvas.
        </Text>
        <Text style={styles.text}>
          “{save.job.title}” · serviço em {formatBrDate(save.job.scheduledDate)} às {save.job.startTime}.
        </Text>
        <Button title="Voltar para Minhas oportunidades" onPress={goToList} />
      </View>
    );
  }

  if (load.status === "loading") return <LoadingBox label="Carregando a oportunidade…" />;
  if (load.status === "error") {
    return (
      <View style={styles.error} accessibilityRole="alert" testID="edit-job-load-error">
        <Text style={styles.errorText}>
          {load.error.kind === "not_found"
            ? "Não encontramos esta oportunidade."
            : load.error.kind === "unauthorized"
              ? load.error.message
              : `Não foi possível carregar a oportunidade. ${load.error.message}`}
        </Text>
        {load.error.kind === "unauthorized" ? (
          <Button title="Entrar de novo" onPress={signIn} />
        ) : load.error.kind === "not_found" ? (
          <Button title="Voltar" variant="link" onPress={goToList} />
        ) : (
          <Button title="Tentar de novo" onPress={() => reload(false, null)} />
        )}
      </View>
    );
  }
  if (load.status === "locked") {
    return (
      <View style={styles.gap} testID="edit-job-locked">
        <Text style={styles.text}>{OWN_JOB_STATE_MESSAGES[load.job.status]}</Text>
        <Button title="Voltar para Minhas oportunidades" onPress={goToList} />
      </View>
    );
  }
  if (categories.state.status === "loading") return <LoadingBox label="Carregando categorias…" />;
  if (categories.state.status === "error") {
    return <ErrorBox error={categories.state.error} onRetry={categories.retry} />;
  }

  const { session } = load;
  const busy = save.kind === "saving" || save.kind === "checking";

  function onSubmit(): JobFormErrors | null {
    if (inFlight.current) return null;
    const built = buildUpdateJobRequest(session.form.getState().values, session.original, new Date());
    if (!built.ok) return built.errors;
    if (built.changedFields.length === 0) return { _: EDIT_NO_CHANGES_MESSAGE };
    void send(session, built.changes);
    return null;
  }

  return (
    <View style={styles.gap}>
      {load.notice ? (
        <View style={styles.info} accessibilityRole="alert" testID="edit-job-notice">
          <Text style={styles.infoText}>{load.notice}</Text>
        </View>
      ) : null}
      {save.kind === "idle" && save.note ? (
        <View style={styles.info} accessibilityLiveRegion="polite" testID="edit-job-note">
          <Text style={styles.infoText}>{save.note}</Text>
        </View>
      ) : null}
      {save.kind === "failed" ? (
        <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="edit-job-error">
          <Text style={styles.errorText}>{save.message}</Text>
          {save.needsSignIn ? (
            <Button title="Entrar de novo" onPress={signIn} />
          ) : save.stale ? (
            <Button
              title="Carregar versão atual"
              onPress={() => {
                discardEditSession(jobId);
                reload(true, "Carregamos a versão atual da oportunidade. Refaça as alterações que ainda quiser.");
              }}
            />
          ) : save.checkNow ? (
            <Button title="Conferir estado atual" onPress={() => void checkNow(session)} />
          ) : (
            <Button title="Fechar aviso" variant="link" onPress={() => setSave({ kind: "idle" })} />
          )}
        </View>
      ) : null}
      {priceStateOf(session.original.proposedPriceCents) === "TO_CONFIRM" ? (
        <View style={styles.toConfirm} accessibilityRole="alert" testID="edit-price-to-confirm">
          <Text style={styles.toConfirmText}>
            O valor desta oportunidade precisa ser confirmado. Informe um valor maior que zero ou marque “A negociar”; nada é alterado
            sozinho.
          </Text>
        </View>
      ) : null}
      <PublishForm
        form={session.form}
        categories={categories.state.data}
        scrollToY={scrollToY}
        submitLabel="Salvar alterações"
        onSubmit={onSubmit}
        submitting={busy}
      />
      <Button
        title="Descartar alterações"
        variant="link"
        disabled={busy}
        onPress={() => {
          discardEditSession(jobId);
          goToList();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 1480, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 64, gap: 10 },
  card: { gap: 16 },
  toConfirm: { backgroundColor: colors.warningSoft, borderRadius: 12, padding: 12 },
  toConfirmText: { fontSize: 14, color: colors.warningText },
  title: { fontSize: 30, fontWeight: "800", color: colors.text },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  success: { fontSize: 16, fontWeight: "700", color: colors.brand },
  info: { backgroundColor: "#EAF1FD", borderRadius: 12, padding: 12 },
  infoText: { fontSize: 14, color: colors.text },
  error: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
});
