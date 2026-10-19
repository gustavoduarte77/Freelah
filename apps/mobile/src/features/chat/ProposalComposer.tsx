import {
  NOT_NEGOTIABLE_MESSAGE,
  PRICE_FORMAT_MESSAGE,
  PRICE_ZERO_MESSAGE,
  maskPriceInput,
  parsePriceInput,
  type MyJobsApiError,
  type ProposalsResponse,
} from "@freelah/shared";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaskedTextField } from "../../components/MaskedTextField";
import { Button, colors } from "../../components/ui";
import { myJobsApi } from "../publish/api";

/**
 * Enviar uma proposta de valor. O servidor diz se dá (`canPropose`); aqui só se coleta o valor, com a
 * mesma máscara do formulário de publicação, e nada é considerado enviado sem a resposta da API.
 */
export function ProposalComposer({
  conversationId,
  state,
  onSent,
}: {
  conversationId: string;
  state: ProposalsResponse;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Oportunidade de valor fixo: o recurso não existe nela, e a conversa diz isso em vez de esconder o botão.
  if (!state.canPropose) {
    return state.proposeBlockedReason === NOT_NEGOTIABLE_MESSAGE ? (
      <Text style={styles.hint} testID="proposal-not-negotiable">
        {NOT_NEGOTIABLE_MESSAGE}
      </Text>
    ) : null;
  }
  if (!open) {
    return (
      <View style={styles.row}>
        <Button
          title="Propor valor"
          variant="secondary"
          onPress={() => {
            setValue("");
            setError(null);
            setOpen(true);
          }}
        />
      </View>
    );
  }

  async function send() {
    if (busy) return;
    const cents = value.trim() ? parsePriceInput(value) : null;
    if (cents === null) return setError(value.trim() ? PRICE_FORMAT_MESSAGE : "Informe o valor da proposta.");
    if (cents <= 0) return setError(PRICE_ZERO_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await myJobsApi.createProposal(conversationId, cents);
      setOpen(false);
      setValue("");
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setError(failure.kind === "network" || failure.kind === "server" ? "Não foi possível enviar agora. Tente de novo." : failure.message);
    } finally {
      setBusy(false);
      onSent(); // relê as propostas: também mostra o estado real depois de um conflito
    }
  }

  return (
    <View style={styles.box} testID="proposal-composer">
      <Text style={styles.title}>Propor um valor</Text>
      <Text style={styles.hint}>A outra pessoa poderá aceitar ou recusar. O valor publicado da oportunidade não muda.</Text>
      <MaskedTextField
        label="Valor da proposta"
        prefix="R$"
        mask={maskPriceInput}
        anchor="end"
        value={value}
        onChangeValue={(next) => {
          setValue(next);
          setError(null);
        }}
        error={error ?? undefined}
        placeholder="0,00"
        keyboardType="number-pad"
        maxLength={24}
        returnKeyType="send"
        onSubmitEditing={() => void send()}
      />
      <View style={styles.row}>
        <Button title="Enviar proposta" onPress={() => void send()} loading={busy} disabled={busy} />
        <Button title="Cancelar" variant="secondary" onPress={() => setOpen(false)} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.brandBorder, backgroundColor: colors.brandSoft },
  title: { fontSize: 15, fontWeight: "800", color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
});
