import { signUpSchema } from "@freelah/shared";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Button, colors, FormError, FormScreen, TextField } from "../src/components/ui";
import { fieldErrors } from "../src/features/auth/fieldErrors";
import { authErrorMessage, NETWORK_ERROR_MESSAGE } from "../src/features/auth/messages";
import { authClient } from "../src/lib/auth-client";

export default function SignUpScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    password: "",
  });
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setFormError(null);
    const parsed = signUpSchema.safeParse({ ...form, adultConfirmed });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await authClient.signUp.email(parsed.data);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      router.dismissTo("/");
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Criar conta" }} />
      <Text style={styles.title}>Criar conta</Text>
      <Text style={styles.subtitle}>Uma conta só serve para procurar trabalho e para contratar.</Text>
      <FormError message={formError} />
      <TextField
        label="Nome"
        value={form.name}
        onChangeText={set("name")}
        error={errors.name}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="E-mail"
        value={form.email}
        onChangeText={set("email")}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Telefone com DDD"
        value={form.phone}
        onChangeText={set("phone")}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="(32) 99999-0000"
      />
      <Text style={styles.hint}>O telefone é privado: nunca aparece para outras pessoas.</Text>
      <TextField
        label="Cidade"
        value={form.city}
        onChangeText={set("city")}
        error={errors.city}
        autoComplete="address-line2"
      />
      <TextField
        label="Senha (mínimo de 8 caracteres)"
        value={form.password}
        onChangeText={set("password")}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />

      <View style={styles.adultRow}>
        <Switch
          value={adultConfirmed}
          onValueChange={setAdultConfirmed}
          accessibilityLabel="Declaro que tenho 18 anos ou mais"
          trackColor={{ true: colors.brand }}
        />
        <Text style={styles.adultText}>Declaro que tenho 18 anos ou mais.</Text>
      </View>
      {errors.adultConfirmed ? <Text style={styles.error}>{errors.adultConfirmed}</Text> : null}

      <Button title="Criar conta" onPress={submit} loading={loading} />
      <Button
        title="Já tenho conta. Entrar"
        variant="link"
        onPress={() => router.replace("/entrar")}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "800", color: colors.brand },
  subtitle: { fontSize: 15, color: colors.muted },
  hint: { fontSize: 13, color: colors.muted, marginTop: -8 },
  adultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  adultText: { flex: 1, fontSize: 15, color: colors.text },
  error: { fontSize: 13, color: colors.error },
});
