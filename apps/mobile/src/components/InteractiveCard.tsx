import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, shadow } from "../theme";

/** Preferência do sistema por menos movimento (o hover continua, mas sem escala nem transição). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReduced(value),
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/**
 * Cartão clicável padrão: borda sutil, sombra para baixo e, ao passar o mouse, escala mínima com
 * sombra um pouco mais forte. O foco do teclado mostra um contorno. Botões dentro do cartão
 * continuam recebendo os próprios toques (o toque mais interno tem prioridade).
 */
export function InteractiveCard({
  children,
  onPress,
  label,
  style,
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ hovered, focused }: { hovered?: boolean; focused?: boolean }) => [
        styles.card,
        reduced ? null : styles.motion,
        style,
        hovered ? [styles.hover, reduced ? null : styles.hoverScale] : null,
        focused ? styles.focus : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    cursor: "pointer",
  },
  motion: {
    transitionProperty: "transform, box-shadow, border-color",
    transitionDuration: "180ms",
    transitionTimingFunction: "ease-out",
  },
  hover: { borderColor: colors.brandBorder, boxShadow: shadow.hover },
  hoverScale: { transform: [{ scale: 1.015 }] },
  focus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand, outlineOffset: 2 },
});
