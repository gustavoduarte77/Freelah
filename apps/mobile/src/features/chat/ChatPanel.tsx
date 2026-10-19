import {
  CHAT_POLL_INTERVAL_MS,
  MESSAGE_MAX,
  type ChatMessage,
  type Conversation,
  type MyJobsApiError,
  type ProposalsResponse,
} from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { Button, colors } from "../../components/ui";
import { useChatPresence, useLiveRefresh } from "../../lib/liveRefresh";
import { focusRing, noInnerOutline, radius } from "../../theme";
import { LoadingBox } from "../jobs/components";
import { HireBanner } from "./HireBanner";
import { HireConfirmedModal, hasSeenHire, markHireSeen } from "./HireConfirmedModal";
import { ProposalCard } from "./ProposalCard";
import { ProposalComposer } from "./ProposalComposer";
import { myJobsApi } from "../publish/api";

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

/**
 * Conversa (PRD 18): histórico, envio e atualização periódica enquanto está na tela. É o mesmo
 * componente na página de conversa e no painel da tela de mensagens (e é ele que o chat flutuante
 * deverá reaproveitar). Quem o usa só escolhe o que vai no cabeçalho.
 */
export function ChatPanel({
  conversationId,
  headerLeft,
  headerRight,
  showJobLink = false,
  onSent,
}: {
  conversationId: string;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** Mostra "Ver oportunidade" no cabeçalho (quando não há painel de contexto ao lado). */
  showJobLink?: boolean;
  /** Chamado depois de uma mensagem confirmada pela API (para atualizar listas ao redor). */
  onSent?: () => void;
}) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Propostas de valor da conversa (null enquanto não carregaram ou se a API ainda não oferece o recurso).
  const [proposals, setProposals] = useState<ProposalsResponse | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [text, setText] = useState("");
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [inputFocused, setInputFocused] = useState(false);
  // Interesse cuja confirmação de contratação está na tela (null = fechada).
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const polling = useRef(false);
  /** Muda a cada recarga completa; consultas que começaram antes dela são descartadas. */
  const generation = useRef(0);
  const sending = useRef(false);
  const scroller = useRef<ScrollView>(null);

  // Carrega o cabeçalho e o histórico ao abrir. Resposta atrasada de uma conversa já fechada é ignorada.
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

  /** Relê as propostas (poucas por conversa). Falha não apaga nada da tela. */
  async function refreshProposals() {
    try {
      setProposals(await myJobsApi.proposals(conversationId));
    } catch {
      // mantém o que já está na tela
    }
  }

  /** Busca só as mensagens depois da última vista. Falha de rede não apaga nada da tela. */
  async function poll() {
    if (polling.current) return;
    polling.current = true;
    const started = generation.current;
    try {
      const news = await myJobsApi.messages(conversationId, cursor.current);
      if (started !== generation.current) return;
      cursor.current = news.cursor ?? cursor.current;
      setMessages((current) => merge(current, news.messages));
      setPollFailed(false);
      void refreshConversation();
      void refreshProposals();
    } catch {
      setPollFailed(true);
    } finally {
      polling.current = false;
    }
  }

  /** Relê conversa e histórico por inteiro, no lugar (sem tela de carregamento). Falha não apaga nada. */
  async function reloadAll() {
    const started = ++generation.current;
    try {
      const [conversation, history] = await Promise.all([myJobsApi.conversation(conversationId), myJobsApi.messages(conversationId)]);
      if (started !== generation.current) return;
      cursor.current = history.cursor;
      setMessages(history.messages);
      setLoad({ status: "ready", conversation });
      void refreshProposals();
    } catch {
      // mantém o que já está na tela
    }
  }
  useLiveRefresh(() => void reloadAll());
  useChatPresence(conversationId);

  /** Confere a situação real da conversa (convite, contratação); falha de rede não apaga nada. */
  async function refreshConversation() {
    try {
      const conversation = await myJobsApi.conversation(conversationId);
      setLoad({ status: "ready", conversation });
    } catch {
      // mantém o que já está na tela
    }
  }

  // A confirmação de contratação aparece UMA vez por contratação, a partir do estado do servidor.
  const hiredInterestId = load.status === "ready" && load.conversation.interest?.status === "ACCEPTED" ? load.conversation.interest.id : null;
  const unseenHire = hiredInterestId && !hasSeenHire(hiredInterestId) ? hiredInterestId : null;
  if (unseenHire && confirmFor !== unseenHire) setConfirmFor(unseenHire);
  useEffect(() => {
    if (confirmFor) markHireSeen(confirmFor); // marcada ao abrir: as próximas consultas não a reabrem
  }, [confirmFor]);

  const ready = load.status === "ready";
  useEffect(() => {
    if (!ready) return;
    let active = true;
    myJobsApi.proposals(conversationId).then(
      (result) => active && setProposals(result),
      () => undefined, // sem o recurso (ou sem conexão): a conversa segue sem propostas
    );
    return () => {
      active = false;
    };
  }, [ready, conversationId]);
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
      onSent?.();
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

  const signInHref = { pathname: "/entrar", params: { redirect: `/conversa/${conversationId}` } } as const;

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
          <Button title="Entrar de novo" onPress={() => router.push(signInHref)} />
        ) : load.error.kind === "not_found" ? null : (
          <Button title="Tentar de novo" onPress={() => router.replace(`/conversa/${conversationId}` as never)} />
        )}
      </View>
    );
  }

  const { conversation } = load;
  const busy = send.kind === "sending";
  const canSubmit = !busy && text.trim().length > 0;
  // Mensagens e propostas na ordem em que aconteceram (as propostas aparecem como cartões próprios).
  const timeline = [
    ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...(proposals?.proposals ?? []).map((proposal) => ({ kind: "proposal" as const, at: proposal.createdAt, proposal })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <View style={styles.chat}>
      <View style={styles.header}>
        {headerLeft}
        <OtherPerson
          name={conversation.other.name}
          profileId={conversation.other.profileId}
          jobTitle={conversation.job.title}
        />
        {showJobLink ? (
          <Button
            title="Ver oportunidade"
            variant="secondary"
            onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: conversation.job.id } })}
          />
        ) : null}
        {headerRight}
      </View>

      {pollFailed ? (
        <Text style={styles.warn} accessibilityLiveRegion="polite" testID="chat-offline">
          Sem conexão agora. Tentando de novo…
        </Text>
      ) : null}

      <HireBanner conversation={conversation} onChanged={refreshConversation} />

      <ScrollView
        ref={scroller}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        testID="chat-messages"
      >
        {messages.length === 0 && (proposals?.proposals.length ?? 0) === 0 ? (
          <Text style={styles.empty}>Ainda não há mensagens. Escreva a primeira.</Text>
        ) : (
          timeline.map((item) =>
            item.kind === "proposal" ? (
              <ProposalCard key={`proposal-${item.proposal.id}`} proposal={item.proposal} onChanged={() => void refreshProposals()} />
            ) : (
              <View key={item.message.id} style={[styles.bubble, item.message.fromMe ? styles.mine : styles.theirs]} testID="chat-message">
                <Text style={item.message.fromMe ? styles.mineText : styles.theirsText}>{item.message.content}</Text>
                <Text style={item.message.fromMe ? styles.mineTime : styles.theirsTime}>{hhmm(item.message.createdAt)}</Text>
              </View>
            ),
          )
        )}
      </ScrollView>

      <HireConfirmedModal visible={confirmFor !== null} conversation={conversation} onClose={() => setConfirmFor(null)} />

      {proposals ? (
        <View style={styles.proposalBar}>
          <ProposalComposer conversationId={conversationId} state={proposals} onSent={() => void refreshProposals()} />
        </View>
      ) : null}

      {conversation.canSend ? (
        <View style={styles.composer}>
          {send.kind === "error" ? (
            <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="chat-error">
              <Text style={styles.errorText}>{send.message}</Text>
              {send.signIn ? (
                <Button title="Entrar de novo" onPress={() => router.push(signInHref)} />
              ) : (
                <Button title="Fechar aviso" variant="link" onPress={() => setSend({ kind: "idle" })} />
              )}
            </View>
          ) : null}
          <View style={[styles.bar, inputFocused ? focusRing : null]}>
            <TextInput
              accessibilityLabel="Mensagem"
              testID="chat-input"
              value={text}
              onChangeText={setText}
              placeholder="Escreva sua mensagem"
              placeholderTextColor={colors.muted}
              maxLength={MESSAGE_MAX}
              multiline
              style={styles.input}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyPress={(event) => {
                const native = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem"
              accessibilityState={{ disabled: !canSubmit, busy }}
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={({ hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
                styles.sendButton,
                !canSubmit ? styles.sendDisabled : hovered ? styles.sendHover : null,
                focused ? styles.sendFocus : null,
              ]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="send" size={18} color="#FFFFFF" />}
            </Pressable>
          </View>
          {Platform.OS === "web" ? (
            <Text style={styles.keyHint}>Enter envia · Shift + Enter quebra a linha</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.warn} testID="chat-blocked">
          {conversation.blockedReason}
        </Text>
      )}
    </View>
  );
}

/**
 * Avatar e nome da outra pessoa. Quando ela tem perfil público, o bloco inteiro abre o perfil (a
 * conversa continua montada por baixo e é retomada ao voltar); sem perfil, é só texto.
 */
function OtherPerson({ name, profileId, jobTitle }: { name: string; profileId?: string; jobTitle: string }) {
  const router = useRouter();
  const content = (hovered = false) => (
    <>
      <Avatar size={40} />
      <View style={styles.headerText}>
        <Text style={[styles.title, hovered ? styles.titleHover : null]} accessibilityRole="header" numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {jobTitle}
        </Text>
      </View>
    </>
  );
  if (!profileId) return <View style={styles.person}>{content()}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ver perfil de ${name}`}
      testID="chat-open-profile"
      onPress={() => router.push(`/perfil/${encodeURIComponent(profileId)}` as Href)}
      style={({ focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.person,
        styles.personLink,
        focused ? styles.personFocus : null,
      ]}
    >
      {({ hovered }: { pressed: boolean; hovered?: boolean }) => content(hovered)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chat: { flex: 1, gap: 10, minHeight: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  person: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  personLink: { cursor: "pointer", borderRadius: radius.md, ...noInnerOutline },
  personFocus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand, outlineOffset: 2 },
  titleHover: { color: colors.brand, textDecorationLine: "underline" },
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted },
  proposalBar: { paddingHorizontal: 12, paddingTop: 8 },
  messages: { flex: 1, backgroundColor: colors.background, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  messagesContent: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { fontSize: 14, color: colors.muted, textAlign: "center", marginTop: 24 },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  mineText: { color: "#FFFFFF", fontSize: 15, lineHeight: 21 },
  theirsText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  mineTime: { color: "#C7DAF8", fontSize: 11, alignSelf: "flex-end" },
  theirsTime: { color: colors.muted, fontSize: 11, alignSelf: "flex-end" },
  composer: { gap: 6 },
  // A barra de composição guarda o campo e o botão de envio, alinhado à direita.
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
    ...noInnerOutline,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    ...noInnerOutline,
  },
  sendHover: { backgroundColor: colors.brandDark },
  sendDisabled: { backgroundColor: "#A9C3EE", cursor: "auto" },
  // Foco do botão redondo: anel azul que acompanha o círculo (sem o contorno preto do navegador).
  sendFocus: { boxShadow: "0 0 0 3px rgba(29, 95, 214, 0.35)" },
  keyHint: { fontSize: 12, color: colors.muted, paddingHorizontal: 8 },
  warn: { fontSize: 13, color: "#5C3B00", backgroundColor: "#FFF4E5", borderRadius: 10, padding: 10 },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 12, gap: 6 },
  errorText: { fontSize: 14, color: colors.error },
});
