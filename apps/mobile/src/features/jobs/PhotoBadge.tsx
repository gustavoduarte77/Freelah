import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { colors } from "../../components/ui";
import { radius } from "../../theme";

/** Indica que a oportunidade tem fotos (ícone de imagem e a quantidade). Não substitui o ícone da categoria. */
export function PhotoBadge({ count, onLight = false }: { count: number; onLight?: boolean }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, onLight ? styles.onLight : null]} accessibilityLabel={`${count} ${count === 1 ? "foto" : "fotos"}`}>
      <Icon name="image" size={13} color={colors.brand} />
      <Text style={styles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  /** Sobre fundo branco (listas): o fundo translúcido branco sumiria. */
  onLight: { backgroundColor: colors.brandSoft },
  text: { fontSize: 12, fontWeight: "700", color: colors.brand },
});
