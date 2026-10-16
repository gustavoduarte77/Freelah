import { formatBrDate, formatPriceCents, type Conversation, type MyJobsApiError } from "@freelah/shared";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { Button, colors } from "../../components/ui";
import { radius } from "../../theme";
import { myJobsApi } from "../publish/api";

type Busy = "invite" | "accept" | "decline" | null;

const open = (status: Conversation["job"]["status"]) => status === "PUBLISHED" || status === "NEGOTIATING";

/**
 * Convite formal de contratação dentro da conversa. O contratante convida; o trabalhador vê o
 * serviço (valor, data, horário, local) e aceita ou recusa. Tudo vem do estado real do servidor:
 * os botões só mudam o que a tela mostra depois que a API confirma (`onChanged` recarrega a conversa).
 * Uma mensagem comum no chat nunca contrata.
 */
export function HireBanner({ conversation, onChanged }: { conversation: Conversation; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { interest, job, viewerIsOwner, other } = conversation;
  if (!interest) return null;

  async function run(kind: Exclude<Busy, null>, call: (id: string) => Promise<unknown>, id: string) {
    if (inFlight.current) return; // ignora cliques repetidos antes de a tela atualizar
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      await call(id);
      setConfirming(false);
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setConfirming(false);
      setError(
        failure.outcomeUnknown
          ? "Não conseguimos confirmar a resposta do servidor. Atualizamos a conversa: confira o estado antes de tentar de novo."
          : failure.kind === "unauthorized" || failure.kind === "invalid_state" || failure.kind === "not_found"
            ? failure.message
            : "Não foi possível concluir agora. Nada foi alterado.",
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
      await onChanged(); // sempre confere o estado real depois da tentativa
    }
  }

  // ------------------------------------------------------------------ contratante
  if (viewerIsOwner) {
    if (interest.status === "ACCEPTED") {
      return (
        <View style={[styles.box, styles.ok]} accessibilityLiveRegion="polite" testID="hire-state">
          <Icon name="check" size={18} color={colors.success} />
          <Text style={styles.okText}>Contratado: {other.name} aceitou o convite para este serviço.</Text>
        </View>
      );
    }
    if (interest.status !== "PENDING" || !open(job.status)) return null;
    if (interest.invite === "PENDING") {
      return (
        <View style={styles.box} accessibilityLiveRegion="polite" testID="hire-state">
          <Icon name="clock" size={18} color={colors.brand} />
          <Text style={styles.text}>Convite enviado. Aguardando a resposta de {other.name}.</Text>
        </View>
      );
    }
    return (
      <View style={styles.stack} testID="hire-state">
        {interest.invite === "DECLINED" ? (
          <View style={[styles.box, styles.warn]} accessibilityLiveRegion="polite">
            <Icon name="alert" size={18} color={colors.warningText} />
            <Text style={styles.warnText}>{other.name} recusou o convite. A oportunidade continua aberta.</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {confirming ? (
          <View style={styles.box} accessibilityRole="alert" testID="invite-confirm">
            <View style={styles.col}>
              <Text style={styles.text}>
                Convidar {other.name} para este serviço por {formatPriceCents(job.proposedPriceCents)}, em {formatBrDate(job.scheduledDate)} às{" "}
                {job.startTime}? A vaga só é preenchida quando a pessoa aceitar.
              </Text>
              <View style={styles.row}>
                <Button title="Enviar convite" onPress={() => void run("invite", myJobsApi.inviteInterest, interest.id)} loading={busy === "invite"} disabled={busy !== null} />
                <Button title="Voltar" variant="secondary" onPress={() => setConfirming(false)} disabled={busy !== null} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <Button
              title={interest.invite === "DECLINED" ? "Convidar de novo" : "Convidar para o serviço"}
              onPress={() => setConfirming(true)}
            />
          </View>
        )}
      </View>
    );
  }

  // ------------------------------------------------------------------ trabalhador
  if (interest.status === "ACCEPTED") {
    return (
      <View style={[styles.box, styles.ok]} accessibilityLiveRegion="polite" testID="hire-state">
        <Icon name="check" size={18} color={colors.success} />
        <Text style={styles.okText}>Você está contratado para este serviço.</Text>
      </View>
    );
  }
  if (interest.status !== "PENDING") return null;
  if (interest.invite === "DECLINED") {
    return (
      <View style={[styles.box, styles.warn]} accessibilityLiveRegion="polite" testID="hire-state">
        <Icon name="alert" size={18} color={colors.warningText} />
        <Text style={styles.warnText}>Você recusou o convite. Se o contratante convidar de novo, ele aparece aqui.</Text>
      </View>
    );
  }
  if (interest.invite !== "PENDING") return null;
  const closed = !open(job.status);
  return (
    <View style={styles.invite} accessibilityRole="alert" testID="invite-card">
      <Text style={styles.inviteTitle}>Convite para o serviço</Text>
      <Text style={styles.inviteJob}>{job.title}</Text>
      <View style={styles.facts}>
        <Text style={styles.fact}>Valor: {formatPriceCents(job.proposedPriceCents)}</Text>
        <Text style={styles.fact}>Data: {formatBrDate(job.scheduledDate)}</Text>
        <Text style={styles.fact}>Horário: {job.startTime}</Text>
        <Text style={styles.fact}>
          Local: {job.city}/{job.state}
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {closed ? (
        <Text style={styles.warnText}>Esta oportunidade não está mais aberta, então o convite não pode ser aceito.</Text>
      ) : (
        <View style={styles.row}>
          <Button title="Aceitar convite" onPress={() => void run("accept", myJobsApi.acceptInvite, interest.id)} loading={busy === "accept"} disabled={busy !== null} />
          <Button title="Recusar" variant="secondary" onPress={() => void run("decline", myJobsApi.declineInvite, interest.id)} loading={busy === "decline"} disabled={busy !== null} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  col: { flex: 1, gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    borderRadius: radius.md,
    padding: 12,
  },
  ok: { backgroundColor: colors.successSoft, borderColor: "#B7DEC8" },
  warn: { backgroundColor: colors.warningSoft, borderColor: "#F3D9AE" },
  text: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  okText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.success },
  warnText: { flex: 1, fontSize: 14, color: colors.warningText },
  error: { fontSize: 14, color: colors.error },
  invite: {
    gap: 8,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.md,
    padding: 14,
  },
  inviteTitle: { fontSize: 12, fontWeight: "800", color: colors.brand, textTransform: "uppercase" },
  inviteJob: { fontSize: 17, fontWeight: "800", color: colors.text },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 4 },
  fact: { fontSize: 14, color: colors.textSoft },
});
