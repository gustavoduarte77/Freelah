import {
  STILL_DRAFT_MESSAGE,
  describeCheckDraftError,
  describePublishDraftError,
  formatBrDate,
  formatBrasiliaDateTime,
  formatPriceCents,
  interpretCheckedJob,
  type MyJobsApiError,
  type OwnJob,
  type OwnJobStatus,
} from "@freelah/shared";
import { useRouter } from "expo-router";
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

/** O que está acontecendo neste cartão (cada cartão tem o seu, então um não afeta os outros). */
type CardAction =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "publishing" }
  /** Lendo só esta oportunidade (GET /me/jobs/:id) para saber o que realmente aconteceu. */
  | { kind: "checking" }
  | { kind: "done" }
  /** A leitura confirmou que continua rascunho: a pessoa decide se tenta publicar de novo. */
  | { kind: "still_draft" }
  | { kind: "error"; message: string; checkNow: boolean; needsSignIn: boolean };

/**
 * Cartão de "Minhas oportunidades". Rascunhos têm a ação "Publicar", com confirmação. O cartão só
 * muda de estado quando a API confirma; sem resposta confiável, a pessoa confere o estado atual
 * lendo SÓ esta oportunidade (GET /me/jobs/:id), que não depende do tamanho nem do limite da lista.
 */
export function MyJobCard({
  job,
  onJobUpdated,
}: {
  job: OwnJob;
  /** Chamado só com um registro devolvido pela API (ao publicar ou ao conferir). */
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
      setAction({ kind: "error", ...failure });
    } finally {
      inFlight.current = false;
    }
  }

  /** Lê só esta oportunidade e mostra o que a API confirmou, nada além disso. */
  async function checkNow() {
    if (inFlight.current) return;
    inFlight.current = true;
    setAction({ kind: "checking" });
    try {
      const current = await myJobsApi.get(job.id);
      onJobUpdated(current); // o registro devolvido pela API substitui o cartão (e só ele)
      const outcome = interpretCheckedJob(current);
      setAction(outcome === "published" ? { kind: "done" } : outcome === "still_draft" ? { kind: "still_draft" } : { kind: "idle" });
    } catch (caught) {
      const failure = describeCheckDraftError(caught as MyJobsApiError);
      setAction({ kind: "error", message: failure.message, checkNow: failure.retryCheck, needsSignIn: failure.needsSignIn });
    } finally {
      inFlight.current = false;
    }
  }

  const busy = action.kind === "publishing" || action.kind === "checking";

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

      {job.status === "DRAFT" ? (
        <>
          <Text style={styles.meta}>Rascunho: ainda não aparece para ninguém.</Text>
          {action.kind === "confirming" ? (
            <View style={styles.confirm} accessibilityRole="alert" testID="publish-draft-confirm">
              <Text style={styles.confirmText}>
                Publicar “{job.title}”? Ela passa a aparecer para todas as pessoas até{" "}
                {formatBrasiliaDateTime(new Date(job.expiresAt))}.
              </Text>
              <Button title="Confirmar publicação" onPress={() => void publish()} />
              <Button title="Cancelar" variant="link" onPress={() => setAction({ kind: "idle" })} />
            </View>
          ) : action.kind === "error" ? (
            <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="publish-draft-error">
              <Text style={styles.errorText}>{action.message}</Text>
              {action.needsSignIn ? (
                <Button
                  title="Entrar de novo"
                  onPress={() => {
                    // O aviso já foi lido: ao voltar do login, o cartão volta a oferecer "Publicar".
                    setAction({ kind: "idle" });
                    router.push({ pathname: "/entrar", params: { redirect: "/minhas-oportunidades" } });
                  }}
                />
              ) : action.checkNow ? (
                <Button title="Conferir estado atual" onPress={() => void checkNow()} />
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
              <Button
                title="Publicar"
                onPress={() => setAction({ kind: "confirming" })}
                loading={busy}
                disabled={busy}
              />
            </>
          )}
        </>
      ) : null}

      {action.kind === "done" ? (
        <Text style={styles.success} accessibilityLiveRegion="polite" testID="publish-draft-done">
          Publicada. Agora ela aparece para todas as pessoas.
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
  success: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
