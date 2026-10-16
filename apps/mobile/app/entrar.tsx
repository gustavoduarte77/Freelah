import { signInSchema, safeInternalRedirect } from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Button, colors, FormError, FormScreen, TextField } from "../src/components/ui";
import { fieldErrors } from "../src/features/auth/fieldErrors";
import { authErrorMessage, NETWORK_ERROR_MESSAGE } from "../src/features/auth/messages";
import { authClient } from "../src/lib/auth-client";

export default function SignInScreen() {
  const router = useRouter();
  // Destino pedido por quem veio de uma ação protegida (só caminhos internos são aceitos).
  const redirect = safeInternalRedirect(useLocalSearchParams<{ redirect?: string }>().redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email(parsed.data);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      router.dismissTo((redirect ?? "/") as Href);
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Entrar" }} />
      <Text style={styles.title}>Entrar</Text>
      <FormError message={formError} />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Senha"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <Button title="Entrar" onPress={submit} loading={loading} />
      <Button
        title="Ainda não tenho conta. Criar conta"
        variant="link"
        onPress={() =>
          router.replace(redirect ? { pathname: "/cadastrar", params: { redirect } } : "/cadastrar")
        }
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "800", color: colors.brand },
});
