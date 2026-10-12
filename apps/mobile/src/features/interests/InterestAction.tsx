import { INTEREST_STATUS_LABEL, type JobViewerResponse, type MyJobsApiError } from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { LoadingBox } from "../jobs/components";
import { myJobsApi } from "../publish/api";

type ViewerState =
  | { status: "loading" }
  | { status: "error"; error: MyJobsApiError }
  | { status: "ready"; viewer: JobViewerResponse };

type Action =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string; check: boolean; signIn: boolean };

const UNCONFIRMED = "Não conseguimos confirmar o que aconteceu. Confira o estado atual antes de tentar de novo.";

/**
 * Ação de interesse na tela da oportunidade, para quem já entrou: demonstrar, ver o interesse
 * registrado e retirá-lo; a dona vê o atalho para os interessados. O estado só muda com a resposta
 * da API; sem resposta confiável a pessoa confere o estado atual (nada é reenviado sozinho).
 */
export function InterestAction({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [viewer, setViewer] = useState<ViewerState>({ status: "loading" });
  const [action, setAction] = useState<Action>({ kind: "idle" });
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    myJobsApi.jobViewer(jobId).then(
      (result) => active && setViewer({ status: "ready", viewer: result }),
      (error: unknown) => active && setViewer({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, [jobId]);

  /** Lê de novo a relação com a oportunidade (conferir o estado atual). */
  async function refresh() {
    setAction({ kind: "busy" });
    try {
      setViewer({ status: "ready", viewer: await myJobsApi.jobViewer(jobId) });
      setAction({ kind: "idle" });
    } catch (caught) {
      const error = caught as MyJobsApiError;
      setAction({
        kind: "error",
        message: error.kind === "unauthorized" ? error.message : "Não foi possível conferir agora. Tente de novo.",
        check: error.kind !== "unauthorized",
        signIn: error.kind === "unauthorized",
      });
    }
  }

  function fail(error: MyJobsApiError) {
    if (error.kind === "unauthorized") {
      setAction({ kind: "error", message: "Sua sessão terminou. Entre de novo para continuar.", check: false, signIn: true });
    } else if (error.outcomeUnknown) {
      setAction({ kind: "error", message: UNCONFIRMED, check: true, signIn: false });
    } else if (error.kind === "invalid_state" || error.kind === "not_found") {
      setAction({ kind: "error", message: error.message, check: true, signIn: false });
    } else {
      setAction({ kind: "error", message: "Não foi possível concluir. Nada foi alterado.", check: false, signIn: false });
    }
  }

  async function run(request: () => Promise<{ id: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" }>) {
    if (inFlight.current) return; // ignora cliques repetidos antes de a tela atualizar
    inFlight.current = true;
    setAction({ kind: "busy" });
    try {
      const interest = await request();
      setViewer({ status: "ready", viewer: { isOwner: false, interest } });
      setAction({ kind: "idle" });
    } catch (caught) {
      const error = caught as MyJobsApiError;
      if (error.code === "already_interested") {
        // Já existia (outra aba, ou pedido repetido): mostra o estado real, sem tratar como erro.
        try {
          setViewer({ status: "ready", viewer: await myJobsApi.jobViewer(jobId) });
          setAction({ kind: "idle" });
        } catch {
          fail(error);
        }
      } else {
        fail(error);
      }
    } finally {
      inFlight.current = false;
    }
  }

  const busy = action.kind === "busy";

  if (viewer.status === "loading") return <LoadingBox label="Verificando seu interesse…" />;
  if (viewer.status === "error") {
    return (
      <View style={styles.error} accessibilityRole="alert" testID="interest-load-error">
        <Text style={styles.errorText}>
          {viewer.error.kind === "unauthorized" ? viewer.error.message : "Não foi possível verificar seu interesse agora."}
        </Text>
        <Button
          title={viewer.error.kind === "unauthorized" ? "Entrar de novo" : "Tentar de novo"}
          onPress={() =>
            viewer.error.kind === "unauthorized"
              ? router.push({ pathname: "/entrar", params: { redirect: `/oportunidades/${jobId}` } })
              : (setViewer({ status: "loading" }), void refresh())
          }
        />
      </View>
    );
  }

  const { isOwner, interest } = viewer.viewer;
  return (
    <View style={styles.box}>
      {isOwner ? (
        <>
          <Text style={styles.text} testID="interest-owner">
            Esta é a sua oportunidade.
          </Text>
          <Button title="Ver interessados" onPress={() => router.push(`/interessados/${jobId}` as Href)} />
        </>
      ) : interest && interest.status !== "WITHDRAWN" ? (
        <>
          <Text style={styles.success} accessibilityLiveRegion="polite" testID="interest-registered">
            {INTEREST_STATUS_LABEL[interest.status]}
          </Text>
          {interest.status === "PENDING" ? (
            <Button title="Retirar interesse" variant="link" onPress={() => void run(() => myJobsApi.withdrawInterest(interest.id))} loading={busy} disabled={busy} />
          ) : null}
        </>
      ) : (
        <>
          {interest ? <Text style={styles.text}>Você retirou seu interesse. Pode demonstrá-lo de novo.</Text> : null}
          <Button title="Tenho interesse" onPress={() => void run(() => myJobsApi.expressInterest(jobId))} loading={busy} disabled={busy} />
        </>
      )}

      {action.kind === "error" ? (
        <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="interest-error">
          <Text style={styles.errorText}>{action.message}</Text>
          {action.signIn ? (
            <Button
              title="Entrar de novo"
              onPress={() => {
                setAction({ kind: "idle" });
                router.push({ pathname: "/entrar", params: { redirect: `/oportunidades/${jobId}` } });
              }}
            />
          ) : action.check ? (
            <Button title="Conferir estado atual" onPress={() => void refresh()} />
          ) : (
            <Button title="Fechar aviso" variant="link" onPress={() => setAction({ kind: "idle" })} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  text: { fontSize: 15, color: colors.text, textAlign: "center" },
  success: { fontSize: 16, fontWeight: "700", color: colors.brand, textAlign: "center" },
  error: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
});
