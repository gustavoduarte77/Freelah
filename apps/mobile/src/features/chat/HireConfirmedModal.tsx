import { formatBrDate, formatPriceCents, type Conversation } from "@freelah/shared";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { Button, colors } from "../../components/ui";
import { radius, shadow } from "../../theme";

const SEEN_PREFIX = "freelah:hire-confirmation-seen:";
const seenInMemory = new Set<string>();

/** A confirmação aparece uma vez por contratação neste navegador (nunca a cada atualização). */
export function hasSeenHire(interestId: string): boolean {
  if (seenInMemory.has(interestId)) return true;
  try {
    return globalThis.localStorage?.getItem(SEEN_PREFIX + interestId) === "1";
  } catch {
    return false;
  }
}
export function markHireSeen(interestId: string) {
  seenInMemory.add(interestId);
  try {
    globalThis.localStorage?.setItem(SEEN_PREFIX + interestId, "1");
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
}

/**
 * "Contratação confirmada!" (o foco entra na janela e volta ao ponto de origem ao fechar, pelo Modal): janela central com fundo escurecido. Os dados são os do servidor
 * (valor, data, horário e local da oportunidade). Fecha pelo botão, por Esc ou tocando fora.
 */
export function HireConfirmedModal({
  visible,
  conversation,
  onClose,
}: {
  visible: boolean;
  conversation: Conversation;
  onClose: () => void;
}) {
  const { job, other, viewerIsOwner } = conversation;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar confirmação">
        {/* O toque dentro da caixa não fecha. */}
        <Pressable style={styles.card} onPress={() => undefined} accessible={false} testID="hire-confirmed" {...({ role: "dialog", "aria-modal": true, "aria-labelledby": "hire-confirmed-title" } as object)}>
          <View style={styles.circle}>
            <Icon name="check" size={36} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={styles.title} nativeID="hire-confirmed-title" accessibilityRole="header">
            Contratação confirmada!
          </Text>
          <Text style={styles.lead}>
            {viewerIsOwner ? `${other.name} aceitou seu convite para este serviço.` : "Você aceitou o convite para este serviço."}
          </Text>
          <View style={styles.details}>
            <Row label="Oportunidade" value={job.title} />
            <Row label="Valor" value={formatPriceCents(job.proposedPriceCents)} />
            <Row label="Data" value={formatBrDate(job.scheduledDate)} />
            <Row label="Horário" value={job.startTime} />
            <Row label="Local" value={`${job.city}/${job.state}`} />
          </View>
          <View style={styles.action}>
            <Button title="Fechar e continuar" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
    boxShadow: shadow.raised,
  },
  circle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", color: colors.text, textAlign: "center" },
  lead: { fontSize: 15, color: colors.textSoft, textAlign: "center" },
  details: {
    alignSelf: "stretch",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { fontSize: 14, fontWeight: "700", color: colors.text, flexShrink: 1, textAlign: "right" },
  action: { alignSelf: "stretch", marginTop: 4 },
});
