import {
  STILL_DRAFT_MESSAGE,
  STILL_OPEN_MESSAGE,
  describeCancelJobError,
  describeCheckDraftError,
  describePublishDraftError,
  formatBrDate,
  formatBrasiliaDateTime,
  formatPriceCents,
  interpretCheckedCancel,
  interpretCheckedJob,
  type MyJobsApiError,
  type OwnJob,
  type OwnJobStatus,
} from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { DemoBadge } from "../jobs/components";
import { myJobsApi } from "./api";

const STATUS_LABEL: Record<OwnJobStatus, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  NEGOTIATING: "Em negociação",
  HIRED: "Contratada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  EXPIRED: "Prazo encerrado",
};

/** Qual ação do cartão está em jogo: publicar um rascunho ou cancelar a oportunidade. */
type Intent = "publish" | "cancel";

/** O que está acontecendo neste cartão (cada cartão tem o seu, então um não afeta os outros). */
type CardAction =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "cancel_confirming" }
  | { kind: "publishing" }
  | { kind: "cancelling" }
  /** Lendo só esta oportunidade (GET /me/jobs/:id) para saber o que realmente aconteceu. */
  | { kind: "checking"; intent: Intent }
  | { kind: "done" }
  | { kind: "cancel_done" }
  /** A leitura confirmou que continua rascunho: a pessoa decide se tenta publicar de novo. */
  | { kind: "still_draft" }
  /** A leitura confirmou que a oportunidade continua ativa: nada foi cancelado. */
  | { kind: "still_open" }
  | { kind: "error"; intent: Intent; message: string; checkNow: boolean; needsSignIn: boolean };

/**
 * Cartão de "Minhas oportunidades". Rascunhos têm a ação "Publicar" e toda oportunidade que a API
 * diz poder cancelar (`canCancel`) tem "Cancelar oportunidade", ambas com confirmação. O cartão só
 * muda de estado quando a API confirma; sem resposta confiável, a pessoa confere o estado atual
 * lendo SÓ esta oportunidade (GET /me/jobs/:id), que não depende do tamanho nem do limite da lista.
 */
export function MyJobCard({
  job,
  onJobUpdated,
}: {
  job: OwnJob;
  /** Chamado só com um registro devolvido pela API (ao publicar, cancelar ou conferir). */
  onJobUpdated: (job: OwnJob) => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<CardAction>({ kind: "idle" });
  const inFlight = useRef(false);

  async function publish() {
    if (inFlight.current) return; // ignora cliques repetidos antes de a tela atualizar
    inFlight.current = true;
    setAction({ kind: "publishing" });
    try {
      const published = await myJobsApi.publish(job.id);
      onJobUpdated(published);
      setAction({ kind: "done" });
    } catch (caught) {
      const failure = describePublishDraftError(caught as MyJobsApiError);
      setAction({ kind: "error", intent: "publish", ...failure });
    } finally {
      inFlight.current = false;
    }
  }

  /** Cancela só depois da confirmação; o cartão só vira "Cancelada" com o registro devolvido pela API. */
  async function cancel() {
    if (inFlight.current) return; // ignora cliques repetidos antes de a tela atualizar
    inFlight.current = true;
    setAction({ kind: "cancelling" });
    try {
      const cancelled = await myJobsApi.cancel(job.id);
      onJobUpdated(cancelled);
      setAction({ kind: "cancel_done" });
    } catch (caught) {
      const failure = describeCancelJobError(caught as MyJobsApiError);
      setAction({ kind: "error", intent: "cancel", ...failure });
    } finally {
      inFlight.current = false;
    }
  }

  /** Lê só esta oportunidade e mostra o que a API confirmou, nada além disso. */
  async function checkNow(intent: Intent) {
    if (inFlight.current) return;
    inFlight.current = true;
    setAction({ kind: "checking", intent });
    try {
      const current = await myJobsApi.get(job.id);
      onJobUpdated(current); // o registro devolvido pela API substitui o cartão (e só ele)
      if (intent === "cancel") {
        const outcome = interpretCheckedCancel(current);
        setAction(
          outcome === "cancelled" ? { kind: "cancel_done" } : outcome === "still_open" ? { kind: "still_open" } : { kind: "idle" },
        );
      } else {
        const outcome = interpretCheckedJob(current);
        setAction(
          outcome === "published" ? { kind: "done" } : outcome === "still_draft" ? { kind: "still_draft" } : { kind: "idle" },
        );
      }
    } catch (caught) {
      const failure = describeCheckDraftError(caught as MyJobsApiError);
      setAction({ kind: "error", intent, message: failure.message, checkNow: failure.retryCheck, needsSignIn: failure.needsSignIn });
    } finally {
      inFlight.current = false;
    }
  }

  const busy = action.kind === "publishing" || action.kind === "cancelling" || action.kind === "checking";
  const cancelling = action.kind === "cancelling" || (action.kind === "checking" && action.intent === "cancel");

  return (
    <View style={styles.card} testID="my-job">
      <View style={styles.badges}>
        <Text style={styles.category}>{job.category.name}</Text>
        <View style={[styles.status, job.status === "DRAFT" ? styles.statusDraft : null]}>
          <Text style={styles.statusText}>{STATUS_LABEL[job.status]}</Text>
        </View>
        {job.isDemo ? <DemoBadge /> : null}
      </View>
      <Text style={styles.jobTitle}>{job.title}</Text>
      <Text style={styles.meta}>
        {formatPriceCents(job.proposedPriceCents)}
        {job.negotiable ? " · negociável" : ""} · {job.city}/{job.state}
      </Text>
      <Text style={styles.meta}>
        Serviço em {formatBrDate(job.scheduledDate)} às {job.startTime} · publicada até{" "}
        {formatBrasiliaDateTime(new Date(job.expiresAt))}
      </Text>

      {job.status === "DRAFT" ? <Text style={styles.meta}>Rascunho: ainda não aparece para ninguém.</Text> : null}
      {job.interestCount > 0 ? (
        <>
          <Text style={styles.interested} testID="my-job-interested">
            {job.interestCount === 1 ? "1 pessoa interessada" : `${job.interestCount} pessoas interessadas`}
          </Text>
          <Button title="Ver interessados" variant="link" onPress={() => router.push(`/interessados/${job.id}` as Href)} />
        </>
      ) : null}

      {action.kind === "confirming" ? (
        <View style={styles.confirm} accessibilityRole="alert" testID="publish-draft-confirm">
          <Text style={styles.confirmText}>
            Publicar “{job.title}”? Ela passa a aparecer para todas as pessoas até{" "}
            {formatBrasiliaDateTime(new Date(job.expiresAt))}.
          </Text>
          <Button title="Confirmar publicação" onPress={() => void publish()} />
          <Button title="Cancelar" variant="link" onPress={() => setAction({ kind: "idle" })} />
        </View>
      ) : action.kind === "cancel_confirming" ? (
        <View style={styles.confirm} accessibilityRole="alert" testID="cancel-job-confirm">
          <Text style={styles.confirmText}>
            {job.status === "DRAFT"
              ? `Cancelar o rascunho “${job.title}”? Ele não poderá ser publicado depois.`
              : `Cancelar “${job.title}”? Ela deixa de aparecer para as outras pessoas e não pode ser reativada.`}
          </Text>
          <Button title="Confirmar cancelamento" onPress={() => void cancel()} />
          <Button title="Voltar" variant="link" onPress={() => setAction({ kind: "idle" })} />
        </View>
      ) : action.kind === "error" ? (
        <View
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          testID={action.intent === "cancel" ? "cancel-job-error" : "publish-draft-error"}
        >
          <Text style={styles.errorText}>{action.message}</Text>
          {action.needsSignIn ? (
            <Button
              title="Entrar de novo"
              onPress={() => {
                // O aviso já foi lido: ao voltar do login, o cartão volta a oferecer as ações.
                setAction({ kind: "idle" });
                router.push({ pathname: "/entrar", params: { redirect: "/minhas-oportunidades" } });
              }}
            />
          ) : action.checkNow ? (
            <Button title="Conferir estado atual" onPress={() => void checkNow(action.intent)} />
          ) : (
            <Button title="Fechar aviso" variant="link" onPress={() => setAction({ kind: "idle" })} />
          )}
        </View>
      ) : (
        <>
          {action.kind === "still_draft" ? (
            <Text style={styles.note} accessibilityLiveRegion="polite" testID="check-still-draft">
              {STILL_DRAFT_MESSAGE}
            </Text>
          ) : null}
          {action.kind === "still_open" ? (
            <Text style={styles.note} accessibilityLiveRegion="polite" testID="check-still-open">
              {STILL_OPEN_MESSAGE}
            </Text>
          ) : null}
          {job.status === "DRAFT" ? (
            <Button
              title="Publicar"
              onPress={() => setAction({ kind: "confirming" })}
              loading={busy && !cancelling}
              disabled={busy}
            />
          ) : null}
          {job.canEdit ? (
            <Button
              title="Editar"
              variant="link"
              onPress={() => router.push(`/editar/${job.id}` as Href)}
              disabled={busy}
            />
          ) : null}
          {job.canCancel ? (
            <Button
              title="Cancelar oportunidade"
              variant="link"
              onPress={() => setAction({ kind: "cancel_confirming" })}
              loading={cancelling}
              disabled={busy}
            />
          ) : null}
        </>
      )}

      {action.kind === "done" ? (
        <Text style={styles.success} accessibilityLiveRegion="polite" testID="publish-draft-done">
          Publicada. Agora ela aparece para todas as pessoas.
        </Text>
      ) : null}

      {action.kind === "cancel_done" ? (
        <Text style={styles.success} accessibilityLiveRegion="polite" testID="cancel-job-done">
          Oportunidade cancelada. Ela não aparece mais para as outras pessoas.
        </Text>
      ) : null}

      {job.status === "PUBLISHED" || job.status === "NEGOTIATING" ? (
        <Button
          title="Ver como aparece"
          variant="link"
          onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: job.id } })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 8 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  category: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  status: { backgroundColor: "#E6F4EA", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusDraft: { backgroundColor: "#EEF0F3" },
  statusText: { fontSize: 12, fontWeight: "700", color: colors.text },
  jobTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  confirm: { backgroundColor: "#E8F0FE", borderRadius: 12, padding: 12, gap: 6 },
  confirmText: { fontSize: 14, color: colors.text },
  error: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
  note: { fontSize: 14, color: colors.text, backgroundColor: "#E8F0FE", borderRadius: 10, padding: 10 },
  interested: { fontSize: 14, fontWeight: "700", color: colors.brand },
  success: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
