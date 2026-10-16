import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../components/ui";
import { isChatOnScreen, subscribeChatPresence } from "../lib/liveRefresh";
import { radius, shadow } from "../theme";
import { API_URL } from "../lib/api";
import { TOTAL_STEPS } from "./data";
import { handleDemoRequest } from "./server";
import { advance, back, getState, getVersion, reset, subscribe } from "./store";

// Carregado SOMENTE quando EXPO_PUBLIC_DEMO_MODE=1 (veja gate.ts). No aplicativo normal este arquivo,
// os dados fictícios e a conta de demonstração nem entram no pacote.

/**
 * Troca o `fetch` global por um que atende às chamadas ao endereço da API sem sair do navegador.
 * Qualquer outro endereço segue para o `fetch` original.
 */
export function installDemoFetch() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_URL)) return original(input, init);
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    let body: string | undefined;
    if (typeof init?.body === "string") body = init.body;
    else if (typeof input === "object" && "text" in input && method !== "GET") body = await input.clone().text();
    const result = handleDemoRequest(method, url.slice(API_URL.length) || "/", body);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

/** Remonta as telas abertas a cada ação dos controles, para que releiam o estado da demonstração. */
export function DemoRoot({ children }: { children: ReactNode }) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  // Os controles só existem enquanto a conversa simulada está na tela (em qualquer das duas telas que a mostram).
  const chatOpen = useSyncExternalStore(subscribeChatPresence, isChatOnScreen, isChatOnScreen);
  return (
    <>
      {/* Quando a barra aparece, reserva o espaço dela para não cobrir o rodapé da conversa. */}
      <View style={[styles.content, chatOpen ? styles.contentWithBar : null]}>
        <Fragment key={version}>{children}</Fragment>
      </View>
      {chatOpen ? <DemoControls /> : null}
    </>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (element.isContentEditable) return true;
  const role = element.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

function DemoControls() {
  const state = useSyncExternalStore(subscribe, getState, getState);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        advance();
      } else if (key === "b") {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const atEnd = state.step >= TOTAL_STEPS || state.response !== null;
  const atStart = state.step <= 1 && state.response === null;
  const note = state.response === "accepted" ? " · convite aceito" : state.response === "declined" ? " · convite recusado" : "";

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="toolbar" accessibilityLabel="Controles da demonstração" testID="demo-controls">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Modo demonstração</Text>
        </View>
        <Text style={styles.title}>Controles da demonstração</Text>
        <Text style={styles.step} accessibilityLiveRegion="polite" testID="demo-step">
          Etapa {state.step} de {TOTAL_STEPS}
          {note}
        </Text>
        <ControlButton label="Voltar" hint="B" onPress={back} disabled={atStart} />
        <ControlButton label="Avançar" hint="A" onPress={advance} disabled={atEnd} primary />
        <ControlButton label="Reiniciar" onPress={reset} />
      </View>
    </View>
  );
}

function ControlButton({
  label,
  hint,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label} (tecla ${hint})` : label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, primary ? styles.buttonPrimary : null, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={[styles.buttonText, primary ? styles.buttonTextPrimary : null]}>
        {label}
        {hint ? <Text style={styles.hint}> {hint}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  contentWithBar: { paddingBottom: 64 },
  wrap: { position: "fixed" as "absolute", left: 0, right: 0, bottom: 12, alignItems: "center", zIndex: 50 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    maxWidth: "96%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.raised,
  },
  badge: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "800", color: colors.warningText, textTransform: "uppercase" },
  title: { fontSize: 12, fontWeight: "700", color: colors.textSoft },
  step: { fontSize: 13, fontWeight: "800", color: colors.text },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 13, fontWeight: "700", color: colors.text },
  buttonTextPrimary: { color: "#FFFFFF" },
  hint: { fontSize: 11, fontWeight: "800", opacity: 0.7 },
});
