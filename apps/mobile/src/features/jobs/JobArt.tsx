import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, iconForCategory } from "../../components/Icon";
import { gradient } from "../../theme";

// Tons de azul/azul-esverdeado discretos; a categoria escolhe um par de forma estável.
const TONES: Array<[string, string]> = [
  ["#E3EDFE", "#9DBCF3"],
  ["#DDF0F8", "#8EC5E2"],
  ["#E6E4FA", "#B1AAEA"],
  ["#DDF1EA", "#92CDB9"],
  ["#E9EFFB", "#A6BFEB"],
];

function toneFor(slug: string): [string, string] {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? TONES[0]!;
}

/**
 * Ilustração provisória da oportunidade: degradê e ícone da categoria. Enquanto as ofertas não
 * têm imagens próprias, evita fotos externas e mantém o cartão sempre com o mesmo formato.
 */
export function JobArt({
  categorySlug,
  iconSize = 56,
  style,
}: {
  categorySlug: string;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = toneFor(categorySlug);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.art, { backgroundColor: from }, gradient(`linear-gradient(135deg, ${from}, ${to})`), style]}
    >
      <Icon name={iconForCategory(categorySlug)} size={iconSize} color="#FFFFFF" strokeWidth={1.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
