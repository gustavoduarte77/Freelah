import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { colors, radius, shadow } from "../theme";
import { Icon } from "./Icon";

const TIP_WIDTH = 280;
const EDGE = 12;

interface Anchor {
  x: number;
  y: number;
  height: number;
}

/**
 * Ícone "i" com balão de ajuda. Abre ao passar o mouse, ao focar pelo teclado ou ao tocar/clicar
 * (clicar de novo, tocar fora ou Esc fecha). O texto também vai como dica de acessibilidade do
 * botão, então leitores de tela o anunciam mesmo com o balão fechado. Na Web o balão é desenhado
 * no topo da página (portal), por cima de qualquer campo vizinho, e nunca passa das bordas da
 * janela; no celular ele aparece logo abaixo do ícone.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Fixado: aberto por clique/toque, então o mouse sair de cima não fecha.
  // (ref, porque os eventos de hover do Pressable podem guardar uma versão antiga do callback)
  const pinned = useRef(false);
  const box = useRef<View>(null);
  const open = anchor !== null;

  function show() {
    box.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, y, height }));
  }
  function hide() {
    pinned.current = false;
    setAnchor(null);
  }

  // Toque/clique fora, Esc e rolagem fecham o balão (Web).
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onPointer = (event: Event) => {
      const node = box.current as unknown as HTMLElement | null;
      if (node && event.target instanceof Node && !node.contains(event.target)) hide();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  const left = anchor ? Math.max(EDGE, Math.min(anchor.x - 8, windowWidth - TIP_WIDTH - EDGE)) : 0;
  const top = anchor ? anchor.y + anchor.height + 6 : 0;

  const tip =
    anchor === null ? null : Platform.OS === "web" ? (
      createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left,
            top,
            width: TIP_WIDTH,
            zIndex: 10000,
            background: colors.text,
            color: "#FFFFFF",
            borderRadius: radius.md,
            padding: "10px 14px",
            fontSize: 13,
            lineHeight: "19px",
            boxShadow: shadow.raised,
            pointerEvents: "none",
            fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
          }}
        >
          {text}
        </div>,
        document.body,
      )
    ) : (
      <View style={styles.nativeTip} pointerEvents="none">
        <Text style={styles.nativeTipText}>{text}</Text>
      </View>
    );

  return (
    <View ref={box} style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ajuda: ${label}`}
        accessibilityHint={text}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (open && pinned.current) {
            hide();
          } else {
            pinned.current = true;
            show();
          }
        }}
        onHoverIn={show}
        onHoverOut={() => {
          if (!pinned.current) setAnchor(null);
        }}
        onFocus={show}
        onBlur={hide}
        style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.button, focused ? styles.focus : null]}
      >
        <Icon name="info" size={16} color={open ? colors.brand : colors.muted} />
      </Pressable>
      {tip}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  button: { padding: 4, borderRadius: radius.pill, cursor: "pointer" },
  focus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand },
  nativeTip: {
    position: "absolute",
    top: 30,
    left: -8,
    width: TIP_WIDTH,
    zIndex: 100,
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nativeTipText: { fontSize: 13, lineHeight: 19, color: "#FFFFFF" },
});
