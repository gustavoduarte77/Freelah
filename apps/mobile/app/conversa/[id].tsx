import {
  CHAT_POLL_INTERVAL_MS,
  MESSAGE_MAX,
  type ChatMessage,
  type Conversation,
  type MyJobsApiError,
} from "@freelah/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../../src/components/ui";
import { useSessionState } from "../../src/features/auth/SessionState";
import { BackLink } from "../../src/features/jobs/BackLink";
import { LoadingBox } from "../../src/features/jobs/components";
import { myJobsApi } from "../../src/features/publish/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: MyJobsApiError }
  | { status: "ready"; conversation: Conversation };

type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string; signIn: boolean };

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Acrescenta mensagens novas sem repetir as que já estão na tela (a mesma pode chegar pelo envio e pela consulta). */
function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length === 0 ? current : [...current, ...fresh];
}

/** Conversa (PRD 18): histórico, envio e atualização periódica enquanto a tela está aberta. */
export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = (Array.isArray(id) ? id[0] : id) ?? "";
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Conversa" }} />
      <View style={styles.content}>
        <BackLink title="← Voltar" />
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
          <Chat key={`${sessionState.session.user.id}:${conversationId}`} conversationId={conversationId} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Chat({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pollFailed, setPollFailed] = useState(false);
  const [text, setText] = useState("");
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const cursor = useRef<string | null>(null);
  const polling = useRef(false);
  const sending = useRef(false);
  const scroller = useRef<ScrollView>(null);

  // Carrega o cabeçalho e o histórico ao abrir. Resposta atrasada de uma tela já fechada é ignorada.
  useEffect(() => {
    let active = true;
    Promise.all([myJobsApi.conversation(conversationId), myJobsApi.messages(conversationId)]).then(
      ([conversation, history]) => {
        if (!active) return;
        cursor.current = history.cursor;
        setMessages(history.messages);
        setLoad({ status: "ready", conversation });
      },
      (error: unknown) => active && setLoad({ status: "error", error: error as MyJobsApiError }),
    );
    return () => {
      active = false;
    };
  }, [conversationId]);

  /** Busca só as mensagens depois da última vista. Falha de rede não apaga nada da tela. */
  async function poll() {
    if (polling.current) return;
    polling.current = true;
    try {
      const news = await myJobsApi.messages(conversationId, cursor.current);
      cursor.current = news.cursor ?? cursor.current;
      setMessages((current) => merge(current, news.messages));
      setPollFailed(false);
    } catch {
      setPollFailed(true);
    } finally {
      polling.current = false;
    }
  }

  const ready = load.status === "ready";
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => void poll(), CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, conversationId]);

  async function submit() {
    const content = text.trim();
    if (!content || sending.current) return;
    sending.current = true;
    setSend({ kind: "sending" });
    try {
      const message = await myJobsApi.sendMessage(conversationId, content);
      setMessages((current) => merge(current, [message]));
      setText("");
      setSend({ kind: "idle" });
    } catch (caught) {
      const error = caught as MyJobsApiError;
      if (error.kind === "unauthorized") {
        setSend({ kind: "error", message: "Sua sessão terminou. Entre de novo para enviar. O texto foi mantido.", signIn: true });
      } else if (error.outcomeUnknown) {
        setSend({
          kind: "error",
          message: "Não conseguimos confirmar o envio. Veja se a mensagem apareceu na conversa antes de enviar de novo.",
          signIn: false,
        });
        void poll(); // confere agora, sem reenviar
      } else if (error.kind === "validation") {
        setSend({ kind: "error", message: error.fields.content ?? "Confira a mensagem e tente de novo.", signIn: false });
      } else if (error.kind === "invalid_state") {
        setSend({ kind: "error", message: error.message, signIn: false });
        void myJobsApi.conversation(conversationId).then((conversation) => setLoad({ status: "ready", conversation }), () => undefined);
      } else {
        setSend({ kind: "error", message: "Não foi possível enviar. Nada foi enviado; o texto foi mantido.", signIn: false });
      }
    } finally {
      sending.current = false;
    }
  }

  if (load.status === "loading") return <LoadingBox label="Carregando a conversa…" />;
  if (load.status === "error") {
    return (
      <View style={styles.errorBox} accessibilityRole="alert" testID="chat-load-error">
        <Text style={styles.errorText}>
          {load.error.kind === "not_found"
            ? "Não encontramos esta conversa."
            : load.error.kind === "unauthorized"
              ? load.error.message
              : `Não foi possível carregar a conversa. ${load.error.message}`}
        </Text>
        {load.error.kind === "unauthorized" ? (
          <Button title="Entrar de novo" onPress={() => router.push({ pathname: "/entrar", params: { redirect: `/conversa/${conversationId}` } })} />
        ) : load.error.kind === "not_found" ? null : (
          <Button title="Tentar de novo" onPress={() => router.replace(`/conversa/${conversationId}` as never)} />
        )}
      </View>
    );
  }

  const { conversation } = load;
  const busy = send.kind === "sending";
  return (
    <View style={styles.chat}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {conversation.other.name}
        </Text>
        <Text style={styles.subtitle}>{conversation.job.title}</Text>
        <Button
          title="Ver oportunidade"
          variant="link"
          onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: conversation.job.id } })}
        />
      </View>

      {pollFailed ? (
        <Text style={styles.warn} accessibilityLiveRegion="polite" testID="chat-offline">
          Sem conexão agora. Tentando de novo…
        </Text>
      ) : null}

      <ScrollView
        ref={scroller}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        testID="chat-messages"
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>Ainda não há mensagens. Escreva a primeira.</Text>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={[styles.bubble, message.fromMe ? styles.mine : styles.theirs]} testID="chat-message">
              <Text style={message.fromMe ? styles.mineText : styles.theirsText}>{message.content}</Text>
              <Text style={message.fromMe ? styles.mineTime : styles.theirsTime}>{hhmm(message.createdAt)}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {conversation.canSend ? (
        <View style={styles.composer}>
          {send.kind === "error" ? (
            <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="chat-error">
              <Text style={styles.errorText}>{send.message}</Text>
              {send.signIn ? (
                <Button title="Entrar de novo" onPress={() => router.push({ pathname: "/entrar", params: { redirect: `/conversa/${conversationId}` } })} />
              ) : (
                <Button title="Fechar aviso" variant="link" onPress={() => setSend({ kind: "idle" })} />
              )}
            </View>
          ) : null}
          <TextInput
            accessibilityLabel="Mensagem"
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Escreva sua mensagem"
            maxLength={MESSAGE_MAX}
            multiline
            style={styles.input}
            onKeyPress={(event) => {
              const native = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Button title="Enviar" onPress={() => void submit()} loading={busy} disabled={busy || text.trim().length === 0} />
        </View>
      ) : (
        <Text style={styles.warn} testID="chat-blocked">
          {conversation.blockedReason}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center", padding: 16, gap: 8 },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  chat: { flex: 1, gap: 8 },
  header: { gap: 2 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  messages: { flex: 1, backgroundColor: colors.surface, borderRadius: 16 },
  messagesContent: { padding: 12, gap: 8, flexGrow: 1 },
  empty: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 },
  bubble: { maxWidth: "80%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brand },
  theirs: { alignSelf: "flex-start", backgroundColor: "#EEF0F3" },
  mineText: { color: "#FFFFFF", fontSize: 15 },
  theirsText: { color: colors.text, fontSize: 15 },
  mineTime: { color: "#D5E8DD", fontSize: 11, alignSelf: "flex-end" },
  theirsTime: { color: colors.muted, fontSize: 11, alignSelf: "flex-end" },
  composer: { gap: 8 },
  input: {
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  warn: { fontSize: 13, color: "#5C3B00", backgroundColor: "#FFF4E5", borderRadius: 10, padding: 10 },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
});
