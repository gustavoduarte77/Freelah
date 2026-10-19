import { useState, type ReactNode, type Ref } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, focusRing, noInnerOutline, radius, shadow } from "../theme";
import { InfoTip } from "./InfoTip";

// Os tokens vivem em src/theme; este reexport mantém os imports antigos funcionando.
export { colors };

/** Tela centralizada em um cartão, com rolagem e ajuste para o teclado. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | undefined;
  /** Explicação curta, mostrada num balão ao lado do rótulo. */
  help?: string;
  /** Referência do campo, para o formulário levar o foco ao próximo. */
  inputRef?: Ref<TextInput>;
  /** Texto fixo à esquerda, dentro da caixa (ex.: "R$"). Não faz parte do valor digitado. */
  prefix?: string;
}

export function TextField({ label, error, help, inputRef, prefix, style, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {help ? <InfoTip text={help} label={label} /> : null}
      </View>
      {prefix ? (
        <View
          style={[
            styles.input,
            styles.prefixBox,
            error ? styles.inputError : null,
            focused ? focusRing : null,
          ]}
        >
          <Text style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no">
            {prefix}
          </Text>
          <TextInput
            ref={inputRef}
            accessibilityLabel={label}
            placeholderTextColor={colors.muted}
            style={[styles.prefixInput, noInnerOutline, style]}
            {...input}
            onFocus={(event) => {
              setFocused(true);
              input.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              input.onBlur?.(event);
            }}
          />
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          style={[styles.input, error ? styles.inputError : null, style]}
          {...input}
        />
      )}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "link";
}

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        variant === "link" ? styles.link : isPrimary ? styles.button : variant === "danger" ? styles.danger : styles.secondary,
        hovered && !inactive ? (isPrimary ? styles.buttonHover : variant === "danger" ? styles.dangerHover : styles.softHover) : null,
        pressed && !inactive ? styles.pressed : null,
        focused ? styles.focus : null,
        inactive ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#FFFFFF" : colors.brand} />
      ) : (
        <Text style={isPrimary ? styles.buttonText : variant === "danger" ? styles.dangerText : styles.linkText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    padding: 24,
    gap: 16,
  },
  field: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 4, zIndex: 2 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  prefixBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 0 },
  prefix: { fontSize: 16, fontWeight: "700", color: colors.muted },
  prefixInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text, minWidth: 0 },
  error: { fontSize: 13, color: colors.error },
  button: {
    backgroundColor: colors.brand,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
    cursor: "pointer",
  },
  buttonHover: { backgroundColor: colors.brandDark },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
    cursor: "pointer",
  },
  danger: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E9B8B3",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    alignItems: "center",
    cursor: "pointer",
  },
  dangerHover: { backgroundColor: colors.errorSoft },
  dangerText: { color: colors.error, fontSize: 15, fontWeight: "700" },
  softHover: { backgroundColor: colors.brandSoft },
  link: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    alignItems: "center",
    cursor: "pointer",
  },
  linkText: { color: colors.brand, fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.85 },
  focus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand, outlineOffset: 2 },
  disabled: { opacity: 0.55, cursor: "default" },
  banner: { backgroundColor: colors.errorSoft, borderRadius: radius.sm, padding: 12 },
  bannerText: { color: colors.error, fontSize: 14 },
});
