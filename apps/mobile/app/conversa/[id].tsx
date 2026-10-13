import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Breadcrumb } from "../../src/components/Breadcrumb";
import { Button, colors } from "../../src/components/ui";
import { useSessionState } from "../../src/features/auth/SessionState";
import { ChatPanel } from "../../src/features/chat/ChatPanel";
import { LoadingBox } from "../../src/features/jobs/components";
import { PAGE_PADDING, WIDE_BREAKPOINT, useBreakpoint } from "../../src/theme";

/**
 * Conversa (PRD 18) em tela cheia: é o caminho no celular e em janelas estreitas. Em telas largas
 * a mesma conversa abre dentro da tela de Mensagens, com a lista e o contexto ao lado.
 */
export default function ConversationScreen() {
  const router = useRouter();
  const { width } = useBreakpoint();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = (Array.isArray(id) ? id[0] : id) ?? "";
  const { state: sessionState, recheck } = useSessionState();

  if (width >= WIDE_BREAKPOINT && conversationId) {
    return <Redirect href={{ pathname: "/mensagens", params: { c: conversationId } }} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Conversa" }} />
      <View style={styles.content}>
        <Breadcrumb items={[{ label: "Mensagens", href: "/mensagens" }, { label: "Conversa" }]} />
        {sessionState.status === "loading" ? (
          <LoadingBox label="Verificando sua sessão…" />
        ) : sessionState.status === "unknown" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.</Text>
            <Button title="Verificar de novo" onPress={recheck} />
          </View>
        ) : sessionState.status === "unauthenticated" ? (
          <View style={styles.gap}>
            <Text style={styles.text}>Entre para ver suas conversas.</Text>
            <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect: `/conversa/${conversationId}` } })} />
          </View>
        ) : (
          <ChatPanel
            key={`${sessionState.session.user.id}:${conversationId}`}
            conversationId={conversationId}
            showJobLink
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: "100%", maxWidth: 900, alignSelf: "center", padding: PAGE_PADDING, gap: 10 },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
});
