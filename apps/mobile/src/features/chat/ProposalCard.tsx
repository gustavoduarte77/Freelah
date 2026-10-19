import { PROPOSAL_STATUS_LABEL, formatPriceCents, type MyJobsApiError, type Proposal } from "@freelah/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { radius } from "../../theme";
import { myJobsApi } from "../publish/api";

const hhmm = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

type Action = "accept" | "decline" | "withdraw";

/**
 * Proposta de valor dentro da conversa: um cartão próprio, diferente das mensagens. Aceitar, recusar
 * e retirar passam pelo servidor, que decide quem pode; aceitar não muda o valor publicado nem contrata.
 */
export function ProposalCard({ proposal, onChanged }: { proposal: Proposal; onChanged: () => void }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      if (action === "accept") await myJobsApi.acceptProposal(proposal.id);
      else if (action === "decline") await myJobsApi.declineProposal(proposal.id);
      else await myJobsApi.withdrawProposal(proposal.id);
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setError(failure.kind === "network" || failure.kind === "server" ? "Não foi possível responder agora. Tente de novo." : failure.message);
    } finally {
      setBusy(null);
      onChanged(); // relê o estado real, também depois de um conflito
    }
  }

  const accepted = proposal.status === "ACCEPTED";
  const pending = proposal.status === "PENDING";
  const closed = pending && proposal.closedReason !== null;
  const who = proposal.fromMe ? "Você propôs" : `${proposal.authorName} propôs`;
  return (
    <View
      style={[styles.card, proposal.fromMe ? styles.mine : styles.theirs, accepted ? styles.accepted : null]}
      testID="proposal-card"
      accessibilityLabel={`Proposta de valor de ${formatPriceCents(proposal.amountCents)}: ${PROPOSAL_STATUS_LABEL[proposal.status]}`}
    >
      <View style={styles.head}>
        <Text style={styles.kicker}>Proposta de valor</Text>
        <Text style={[styles.status, accepted ? styles.statusOk : pending && !closed ? styles.statusPending : styles.statusOff]} testID="proposal-status">
          {closed ? "Encerrada" : PROPOSAL_STATUS_LABEL[proposal.status]}
        </Text>
      </View>
      <Text style={styles.amount} testID="proposal-amount">
        {formatPriceCents(proposal.amountCents)}
      </Text>
      <Text style={styles.meta}>
        {who} às {hhmm(proposal.createdAt)}
      </Text>

      {accepted ? (
        <Text style={styles.note}>
          Valor combinado nesta conversa. O valor publicado da oportunidade não muda e a contratação continua separada.
        </Text>
      ) : null}
      {closed ? <Text style={styles.note}>{proposal.closedReason}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="proposal-error">
          {error}
        </Text>
      ) : null}

      {proposal.canAccept || proposal.canDecline ? (
        <View style={styles.actions}>
          {proposal.canAccept ? <Button title="Aceitar" onPress={() => void run("accept")} loading={busy === "accept"} disabled={busy !== null} /> : null}
          {proposal.canDecline ? (
            <Button title="Recusar" variant="secondary" onPress={() => void run("decline")} loading={busy === "decline"} disabled={busy !== null} />
          ) : null}
        </View>
      ) : null}
      {proposal.canWithdraw ? (
        <View style={styles.actions}>
          <Button title="Retirar proposta" variant="secondary" onPress={() => void run("withdraw")} loading={busy === "withdraw"} disabled={busy !== null} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: "88%", minWidth: 220, gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: 1, backgroundColor: colors.surface },
  mine: { alignSelf: "flex-end", borderColor: colors.brandBorder },
  theirs: { alignSelf: "flex-start", borderColor: colors.border },
  accepted: { borderColor: colors.success, backgroundColor: colors.successSoft },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kicker: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  status: { fontSize: 12, fontWeight: "800", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  statusPending: { color: colors.warningText, backgroundColor: colors.warningSoft },
  statusOk: { color: colors.success, backgroundColor: colors.surface },
  statusOff: { color: colors.muted, backgroundColor: colors.background },
  amount: { fontSize: 26, fontWeight: "800", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  note: { fontSize: 13, color: colors.textSoft },
  error: { fontSize: 13, color: colors.error, backgroundColor: colors.errorSoft, borderRadius: 8, padding: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
