import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Button, FormScreen, colors } from "../src/components/ui";

/** Rota inexistente: mensagem em português e caminho de volta ao início. */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Página não encontrada" }} />
      <Text style={styles.title} accessibilityRole="header">
        Página não encontrada
      </Text>
      <Text style={styles.text}>O endereço que você abriu não existe ou foi removido.</Text>
      <Button title="Voltar ao início" onPress={() => router.replace("/")} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  text: { fontSize: 15, color: colors.text },
});
