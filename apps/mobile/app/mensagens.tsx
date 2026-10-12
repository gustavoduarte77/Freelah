import { type ConversationListItem, type MyJobsApiError } from "@freelah/shared";
import { Stack, useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../src/components/ui";
import { useSessionState } from "../src/features/auth/SessionState";
import { BackLink } from "../src/features/jobs/BackLink";
import { EmptyBox, LoadingBox, StatusBadge } from "../src/features/jobs/components";
import { myJobsApi } from "../src/features/publish/api";

type State =
  | { status: "loading" }
  | { status: "ready"; conversations: ConversationListItem[]; refreshFailed: boolean }
  | { status: "error"; error: MyJobsApiError };

/** Mensagens (PRD 30): as conversas de quem está logado, com a última mensagem de cada uma. */
export default function MessagesScreen() {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Mensagens" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink title="← Voltar" />
        <Text style={styles.title} accessibilityRole="header">
          Mensagens
        </Text>
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
            <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect: "/mensagens" } })} />
          </View>
        ) : (
          <ConversationList key={sessionState.session.user.id} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConversationList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const conversations = await myJobsApi.conversations();
      setState({ status: "ready", conversations, refreshFailed: false });
    } catch (error) {
      setState((current) =>
        current.status === "ready" ? { ...current, refreshFailed: true } : { status: "error", error: error as MyJobsApiError },
      );
    }
  }, []);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void load();
    }, [load]),
  );

  useEffect(() => {
    let active = true;
    myJobsApi.conversations().then(
      (conversations) => active && setState({ status: "ready", conversations, refreshFailed: false }),
      (error: unknown) => active && setState({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") return <LoadingBox label="Carregando suas conversas…" />;
  if (state.status === "error") {
    return (
      <View style={styles.errorBox} accessibilityRole="alert" testID="conversations-error">
        <Text style={styles.errorText}>
          {state.error.kind === "unauthorized" ? state.error.message : `Não foi possível carregar suas conversas. ${state.error.message}`}
        </Text>
        <Button
          title={state.error.kind === "unauthorized" ? "Entrar de novo" : "Tentar de novo"}
          onPress={() =>
            state.error.kind === "unauthorized"
              ? router.push({ pathname: "/entrar", params: { redirect: "/mensagens" } })
              : (setState({ status: "loading" }), void load())
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.gap}>
      {state.refreshFailed ? <Text style={styles.errorText}>Não foi possível atualizar agora; esta é a última lista carregada.</Text> : null}
      <Button title="Atualizar" variant="link" onPress={() => void load()} />
      {state.conversations.length === 0 ? (
        <EmptyBox
          title="Você ainda não tem conversas"
          text="Abra uma oportunidade em que demonstrou interesse, ou a lista de interessados de uma oportunidade sua, e toque em “Conversar”."
        />
      ) : (
        state.conversations.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            accessibilityLabel={`Abrir conversa com ${item.other.name}`}
            onPress={() => router.push(`/conversa/${item.id}` as Href)}
            style={styles.card}
            testID="conversation-item"
          >
            <View style={styles.row}>
              <Text style={styles.name}>{item.other.name}</Text>
              <StatusBadge status={item.job.status} />
            </View>
            <Text style={styles.meta}>{item.job.title}</Text>
            <Text style={styles.preview} numberOfLines={1}>
              {item.lastMessage ? `${item.lastMessage.fromMe ? "Você: " : ""}${item.lastMessage.content}` : "Ainda sem mensagens"}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
  preview: { fontSize: 14, color: colors.text },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
