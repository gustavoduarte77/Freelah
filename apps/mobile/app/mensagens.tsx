import { formatJobDate, formatPriceCents, type ConversationListItem, type MyJobsApiError } from "@freelah/shared";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { Icon, type IconName } from "../src/components/Icon";
import { Button, colors } from "../src/components/ui";
import { useSessionState } from "../src/features/auth/SessionState";
import { ChatPanel } from "../src/features/chat/ChatPanel";
import { EmptyBox, LoadingBox, StatusBadge } from "../src/features/jobs/components";
import { useJobDetail } from "../src/features/jobs/hooks";
import { JobArt } from "../src/features/jobs/JobArt";
import { myJobsApi } from "../src/features/publish/api";
import { CONTENT_MAX_WIDTH, PAGE_PADDING, WIDE_BREAKPOINT, radius, shadow, useBreakpoint } from "../src/theme";

type State =
  | { status: "loading" }
  | { status: "ready"; conversations: ConversationListItem[]; refreshFailed: boolean }
  | { status: "error"; error: MyJobsApiError };

/** A lista também se atualiza sozinha, para a última mensagem de cada conversa não ficar velha. */
const LIST_REFRESH_MS = 10_000;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Mensagens (PRD 30): em telas largas, lista de conversas, conversa e contexto da oportunidade. */
export default function MessagesScreen() {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Mensagens" }} />
      {sessionState.status === "loading" ? (
        <View style={styles.pad}>
          <LoadingBox label="Verificando sua sessão…" />
        </View>
      ) : sessionState.status === "unknown" ? (
        <View style={[styles.pad, styles.gap]}>
          <Text style={styles.text}>Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.</Text>
          <Button title="Verificar de novo" onPress={recheck} />
        </View>
      ) : sessionState.status === "unauthenticated" ? (
        <View style={[styles.pad, styles.gap]}>
          <Text style={styles.text}>Entre para ver suas conversas.</Text>
          <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect: "/mensagens" } })} />
        </View>
      ) : (
        <Inbox key={sessionState.session.user.id} />
      )}
    </SafeAreaView>
  );
}

function Inbox() {
  const router = useRouter();
  const { width } = useBreakpoint();
  const wide = width >= WIDE_BREAKPOINT;
  const params = useLocalSearchParams<{ c?: string | string[] }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(first(params.c) ?? null);
  const [listOpen, setListOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);

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

  // Ao voltar de outra tela, recarrega; a primeira vez já é coberta pelo carregamento inicial.
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
    const timer = setInterval(() => void load(), LIST_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  // O link /mensagens?c=<id> (vindo de "Conversar") escolhe a conversa.
  const requested = first(params.c);
  useEffect(() => {
    if (requested) setSelectedId(requested);
  }, [requested]);

  if (state.status === "loading") {
    return (
      <View style={styles.pad}>
        <LoadingBox label="Carregando suas conversas…" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.pad}>
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
      </View>
    );
  }

  const { conversations, refreshFailed } = state;
  const selected = conversations.find((item) => item.id === selectedId) ?? null;

  function open(item: ConversationListItem) {
    if (wide) setSelectedId(item.id);
    else router.push(`/conversa/${item.id}` as Href);
  }

  const list = (
    <ConversationList
      conversations={conversations}
      refreshFailed={refreshFailed}
      selectedId={wide ? selectedId : null}
      onOpen={open}
    />
  );

  // Janela estreita: só a lista; cada conversa abre em tela cheia.
  if (!wide) {
    return (
      <ScrollView contentContainerStyle={styles.narrow}>
        <Text style={styles.title} accessibilityRole="header">
          Mensagens
        </Text>
        {list}
      </ScrollView>
    );
  }

  return (
    <View style={styles.panes}>
      {listOpen ? (
        <View style={[styles.pane, styles.listPane]}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle} accessibilityRole="header">
              Mensagens
            </Text>
            <PaneToggle icon="panelLeft" label="Recolher lista de conversas" onPress={() => setListOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.listScroll}>{list}</ScrollView>
        </View>
      ) : null}

      <View style={[styles.pane, styles.chatPane]}>
        {selectedId ? (
          <ChatPanel
            key={selectedId}
            conversationId={selectedId}
            onSent={() => void load()}
            headerLeft={
              listOpen ? null : (
                <PaneToggle icon="panelLeft" label="Mostrar lista de conversas" onPress={() => setListOpen(true)} />
              )
            }
            headerRight={
              <PaneToggle
                icon="panelRight"
                label={contextOpen ? "Recolher detalhes da oportunidade" : "Mostrar detalhes da oportunidade"}
                active={contextOpen}
                onPress={() => setContextOpen((value) => !value)}
              />
            }
          />
        ) : (
          <View style={styles.noChat}>
            {listOpen ? null : (
              <View style={styles.noChatBar}>
                <PaneToggle icon="panelLeft" label="Mostrar lista de conversas" onPress={() => setListOpen(true)} />
              </View>
            )}
            <View style={styles.noChatBody}>
              <Icon name="chat" size={44} color={colors.brandBorder} strokeWidth={1.5} />
              <Text style={styles.noChatTitle}>
                {conversations.length === 0 ? "Você ainda não tem conversas" : "Selecione uma conversa"}
              </Text>
              <Text style={styles.noChatText}>
                {conversations.length === 0
                  ? "Abra uma oportunidade em que demonstrou interesse, ou a lista de interessados de uma oportunidade sua, e toque em “Conversar”."
                  : "Escolha alguém na lista para ver o histórico e responder."}
              </Text>
            </View>
          </View>
        )}
      </View>

      {selected && contextOpen ? (
        <View style={[styles.pane, styles.contextPane]}>
          <ContextPanel item={selected} />
        </View>
      ) : null}
    </View>
  );
}

function PaneToggle({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={({ hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.toggle,
        active ? styles.toggleActive : hovered ? styles.toggleHover : null,
        focused ? styles.toggleFocus : null,
      ]}
    >
      <Icon name={icon} size={18} color={active ? colors.brand : colors.textSoft} />
    </Pressable>
  );
}

function ConversationList({
  conversations,
  refreshFailed,
  selectedId,
  onOpen,
}: {
  conversations: ConversationListItem[];
  refreshFailed: boolean;
  selectedId: string | null;
  onOpen: (item: ConversationListItem) => void;
}) {
  return (
    <View style={styles.list}>
      {refreshFailed ? <Text style={styles.errorText}>Não foi possível atualizar agora; esta é a última lista carregada.</Text> : null}
      {conversations.length === 0 ? (
        <EmptyBox
          title="Você ainda não tem conversas"
          text="Abra uma oportunidade em que demonstrou interesse, ou a lista de interessados de uma oportunidade sua, e toque em “Conversar”."
        />
      ) : (
        conversations.map((item) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              accessibilityLabel={`Abrir conversa com ${item.other.name}`}
              accessibilityState={{ selected: active }}
              onPress={() => onOpen(item)}
              style={({ hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
                styles.item,
                active ? styles.itemActive : hovered ? styles.itemHover : null,
                focused ? styles.itemFocus : null,
              ]}
              testID="conversation-item"
            >
              <Avatar size={46} />
              <View style={styles.itemBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.other.name}
                </Text>
                <Text style={styles.context} numberOfLines={1}>
                  {item.job.title}
                </Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {item.lastMessage ? `${item.lastMessage.fromMe ? "Você: " : ""}${item.lastMessage.content}` : "Ainda sem mensagens"}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

/** Contexto da oportunidade da conversa: dados públicos dela e um atalho para a página completa. */
function ContextPanel({ item }: { item: ConversationListItem | null }) {
  const router = useRouter();
  const { state, retry } = useJobDetail(item?.job.id ?? "");
  if (!item) return null;
  return (
    <ScrollView contentContainerStyle={styles.contextScroll}>
      <Text style={styles.contextTitle} accessibilityRole="header">
        Oportunidade
      </Text>
      {state.status === "ready" ? (
        <>
          <JobArt categorySlug={state.data.category.slug} iconSize={40} style={styles.contextArt} />
          <Text style={styles.contextCategory}>{state.data.category.name}</Text>
          <Text style={styles.contextJob}>{state.data.title}</Text>
          <StatusBadge status={state.data.status} />
          <Text style={styles.contextPrice}>{formatPriceCents(state.data.proposedPriceCents)}</Text>
          <Text style={styles.contextMeta}>{state.data.negotiable ? "Valor negociável" : "Valor fixo"}</Text>
          <View style={styles.contextRow}>
            <Icon name="calendar" size={15} color={colors.muted} />
            <Text style={styles.contextMeta}>
              {formatJobDate(state.data.scheduledDate)} às {state.data.startTime}
            </Text>
          </View>
          <View style={styles.contextRow}>
            <Icon name="pin" size={15} color={colors.muted} />
            <Text style={styles.contextMeta}>
              {state.data.city}/{state.data.state}
            </Text>
          </View>
        </>
      ) : state.status === "loading" ? (
        <>
          <Text style={styles.contextJob}>{item.job.title}</Text>
          <StatusBadge status={item.job.status} />
          <LoadingBox label="Carregando detalhes…" />
        </>
      ) : (
        <>
          <Text style={styles.contextJob}>{item.job.title}</Text>
          <StatusBadge status={item.job.status} />
          <Text style={styles.contextMeta}>Não foi possível carregar os detalhes agora.</Text>
          <Button title="Tentar de novo" variant="link" onPress={retry} />
        </>
      )}
      <View style={styles.contextAction}>
        <Button
          title="Ver oportunidade"
          variant="secondary"
          onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: item.job.id } })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { padding: PAGE_PADDING, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  narrow: { padding: PAGE_PADDING, gap: 14, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: "800", color: colors.text },
  // Três painéis ocupam a altura da janela; cada um rola por conta própria.
  panes: {
    flex: 1,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    flexDirection: "row",
    gap: 16,
    padding: PAGE_PADDING,
    minHeight: 0,
  },
  pane: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    minHeight: 0,
    overflow: "hidden",
  },
  listPane: { width: 360 },
  chatPane: { flex: 1, minWidth: 0, padding: 16 },
  contextPane: { width: 320 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 8 },
  listTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  listScroll: { padding: 8 },
  list: { gap: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.md, cursor: "pointer" },
  itemActive: { backgroundColor: colors.brandSoft },
  itemHover: { backgroundColor: colors.background },
  itemFocus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand },
  itemBody: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  context: { fontSize: 12, fontWeight: "600", color: colors.brand },
  preview: { fontSize: 14, color: colors.muted },
  toggle: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", cursor: "pointer" },
  toggleActive: { backgroundColor: colors.brandSoft },
  toggleHover: { backgroundColor: colors.background },
  toggleFocus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand },
  noChat: { flex: 1 },
  noChatBar: { flexDirection: "row" },
  noChatBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  noChatTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  noChatText: { fontSize: 14, color: colors.muted, textAlign: "center", maxWidth: 360 },
  contextScroll: { padding: 20, gap: 8, alignItems: "flex-start" },
  contextTitle: { fontSize: 14, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  contextArt: { width: "100%", height: 120, borderRadius: radius.md },
  contextCategory: { fontSize: 12, fontWeight: "700", color: colors.brand, textTransform: "uppercase" },
  contextJob: { fontSize: 18, fontWeight: "800", color: colors.text },
  contextPrice: { fontSize: 24, fontWeight: "800", color: colors.brand, marginTop: 4 },
  contextMeta: { fontSize: 14, color: colors.muted },
  contextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contextAction: { alignSelf: "stretch", marginTop: 12 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
});
