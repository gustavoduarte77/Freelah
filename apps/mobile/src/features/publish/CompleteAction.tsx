import type { MyJobsApiError, OwnJob } from "@freelah/shared";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { myJobsApi } from "./api";

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "busy" }
  | { kind: "error"; message: string; check: boolean };

/**
 * "Concluir serviço" (PRD 20) para uma oportunidade contratada, com confirmação. O cartão só muda
 * com o registro devolvido pela API; sem resposta confiável, a pessoa confere o estado atual.
 */
export function CompleteAction({ job, onJobUpdated }: { job: OwnJob; onJobUpdated: (job: OwnJob) => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inFlight = useRef(false);

  async function run(request: () => Promise<OwnJob>, onFail: (error: MyJobsApiError) => State) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "busy" });
    try {
      onJobUpdated(await request());
      setState({ kind: "idle" });
    } catch (caught) {
      setState(onFail(caught as MyJobsApiError));
    } finally {
      inFlight.current = false;
    }
  }

  const complete = () =>
    run(
      () => myJobsApi.complete(job.id),
      (error) =>
        error.outcomeUnknown
          ? { kind: "error", message: "Não conseguimos confirmar se o serviço foi concluído. Confira o estado atual antes de tentar de novo.", check: true }
          : error.kind === "unauthorized"
            ? { kind: "error", message: error.message, check: false }
            : error.kind === "invalid_state" || error.kind === "not_found"
              ? { kind: "error", message: error.message, check: true }
              : { kind: "error", message: "Não foi possível concluir. Nada foi alterado.", check: false },
    );

  const check = () =>
    run(
      () => myJobsApi.get(job.id),
      () => ({ kind: "error", message: "Não foi possível conferir agora. O estado continua desconhecido.", check: true }),
    );

  const busy = state.kind === "busy";
  return (
    <View style={styles.box}>
      {state.kind === "confirming" ? (
        <View style={styles.confirm} accessibilityRole="alert" testID="complete-confirm">
          <Text style={styles.confirmText}>
            Concluir “{job.title}”? Confirma que o serviço foi realizado. Isso não pode ser desfeito.
          </Text>
          <Button title="Confirmar conclusão" onPress={() => void complete()} />
          <Button title="Voltar" variant="link" onPress={() => setState({ kind: "idle" })} />
        </View>
      ) : (
        <>
          {state.kind === "error" ? (
            <View style={styles.error} accessibilityRole="alert" testID="complete-error">
              <Text style={styles.errorText}>{state.message}</Text>
              {state.check ? <Button title="Conferir estado atual" onPress={() => void check()} /> : null}
            </View>
          ) : null}
          <Button title="Concluir serviço" onPress={() => setState({ kind: "confirming" })} loading={busy} disabled={busy} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  confirm: { backgroundColor: "#E8F0FE", borderRadius: 12, padding: 12, gap: 6 },
  confirmText: { fontSize: 14, color: colors.text },
  error: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
});
