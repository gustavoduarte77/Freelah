import type { Preferences, PreferencesSyncError } from "@freelah/shared";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, FormError, colors } from "../../components/ui";

function Card({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>{children}</View>
    </SafeAreaView>
  );
}

export function PreferencesLoading() {
  return (
    <Card>
      <Text style={styles.brand}>Freelah</Text>
      <View style={styles.row} accessibilityLiveRegion="polite">
        <ActivityIndicator />
        <Text style={styles.body}>Carregando suas preferências…</Text>
      </View>
    </Card>
  );
}

function describe(error: PreferencesSyncError): string {
  if (error.source === "account") {
    switch (error.kind) {
      case "network":
        return "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";
      case "unauthorized":
        return "Sua sessão expirou. Entre de novo.";
      case "server":
        return "O servidor falhou ao salvar. Tente de novo em instantes.";
      default:
        return "Não foi possível salvar na sua conta. Tente de novo.";
    }
  }
  return error.message;
}

const OPTIONS: { key: keyof Preferences; title: string; text: string }[] = [
  {
    key: "wantsWork",
    title: "Encontrar trabalho",
    text: "Descubra oportunidades, demonstre interesse e converse com contratantes.",
  },
  {
    key: "wantsToHire",
    title: "Contratar alguém",
    text: "Publique oportunidades, encontre interessados e escolha quem realizará o serviço.",
  },
];

interface OnboardingProps {
  saving: boolean;
  saveError: PreferencesSyncError | null;
  signedIn: boolean;
  onSubmit: (preferences: Preferences) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** PRD 8.1: duas opções independentes; "Continuar" só com pelo menos uma marcada. */
export function OnboardingScreen(props: OnboardingProps) {
  const [choice, setChoice] = useState<Preferences>({ wantsWork: false, wantsToHire: false });
  const hasChoice = choice.wantsWork || choice.wantsToHire;

  return (
    <Card>
      <Text style={styles.brand}>Freelah</Text>
      <Text style={styles.title} accessibilityRole="header">
        Como você quer usar o Freelah?
      </Text>
      <Text style={styles.body}>
        Escolha uma ou as duas opções. Você poderá mudar isso depois nas configurações.
      </Text>

      {OPTIONS.map((option) => {
        const checked = choice[option.key];
        return (
          <Pressable
            key={option.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: props.saving }}
            aria-checked={checked}
            accessibilityLabel={option.title}
            disabled={props.saving}
            onPress={() => setChoice((current) => ({ ...current, [option.key]: !current[option.key] }))}
            style={[styles.option, checked ? styles.optionChecked : null]}
          >
            <View style={[styles.box, checked ? styles.boxChecked : null]}>
              {checked ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.hint}>{option.text}</Text>
            </View>
          </Pressable>
        );
      })}

      {!hasChoice ? <Text style={styles.hint}>Marque pelo menos uma opção para continuar.</Text> : null}
      <FormError message={props.saveError ? describe(props.saveError) : null} />
      <Button
        title="Continuar"
        loading={props.saving}
        disabled={!hasChoice}
        onPress={() => props.onSubmit(choice)}
      />
      {props.signedIn ? (
        <Button title="Sair" variant="link" onPress={props.onSignOut} />
      ) : (
        <Button title="Já tenho conta — Entrar" variant="link" onPress={props.onSignIn} />
      )}
    </Card>
  );
}

interface InvalidLocalProps {
  /** Preferências da conta, quando a pessoa tem sessão e a conta já as tinha. */
  accountPreferences: Preferences | null;
  busy: boolean;
  actionError: PreferencesSyncError | null;
  onUseAccount: () => void;
  onDiscard: () => void;
}

/** Dado local ilegível: nada é apagado sem a pessoa pedir e entender a consequência. */
export function InvalidLocalRecovery(props: InvalidLocalProps) {
  const [confirming, setConfirming] = useState(false);
  const hasAccount = props.accountPreferences !== null;

  return (
    <Card>
      <Text style={styles.brand}>Freelah</Text>
      <Text style={styles.title} accessibilityRole="header">
        Não conseguimos ler as preferências deste aparelho
      </Text>
      <Text style={styles.body}>
        {hasAccount
          ? "A escolha guardada neste aparelho está corrompida, mas suas preferências da conta estão intactas."
          : "A escolha guardada neste aparelho está corrompida. Nada foi apagado nem enviado para a sua conta."}
      </Text>
      <FormError message={props.actionError ? describe(props.actionError) : null} />

      {confirming ? (
        <>
          <View style={styles.warning} accessibilityRole="alert">
            <Text style={styles.warningText}>
              {hasAccount
                ? "Isso apaga apenas a escolha corrompida deste aparelho, e não pode ser desfeito. Suas preferências da conta continuam e passam a ser usadas aqui."
                : "Isso apaga a escolha corrompida deste aparelho, e não pode ser desfeito. Você vai precisar escolher de novo."}
            </Text>
          </View>
          <Button title="Sim, descartar" loading={props.busy} onPress={props.onDiscard} />
          <Button title="Cancelar" variant="link" onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          {hasAccount ? (
            <Button
              title="Usar as preferências da minha conta"
              loading={props.busy}
              onPress={props.onUseAccount}
            />
          ) : null}
          <Button
            title="Descartar a escolha deste aparelho"
            variant={hasAccount ? "link" : "primary"}
            disabled={props.busy}
            onPress={() => setConfirming(true)}
          />
        </>
      )}
    </Card>
  );
}

/** Falha de leitura/armazenamento do visitante (não é "sem preferências"). */
export function LocalStorageError(props: {
  error: PreferencesSyncError;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <Card>
      <Text style={styles.brand}>Freelah</Text>
      <Text style={styles.title} accessibilityRole="header">
        Não foi possível acessar as preferências deste aparelho
      </Text>
      <FormError message={props.error.message} />
      <Button title="Tentar de novo" loading={props.busy} onPress={props.onRetry} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  brand: { fontSize: 28, fontWeight: "800", color: colors.brand },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  body: { fontSize: 15, color: "#3C4650" },
  hint: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  option: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionChecked: { borderColor: colors.brand, backgroundColor: "#EAF4F1" },
  optionText: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: "#FFFFFF", fontWeight: "800" },
  warning: { backgroundColor: "#FFF4E5", borderRadius: 10, padding: 12 },
  warningText: { color: "#7A4B00", fontSize: 14 },
});
