import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "../../components/Icon";
import { colors } from "../../components/ui";

/**
 * Espaço reservado para uma foto: bloco cinza com o ícone de imagem ao centro. É o que a
 * demonstração mostra no lugar de qualquer foto de exemplo (nunca fotografias nem arquivos de imagem).
 */
export function PhotoPlaceholder({
  iconSize = 40,
  style,
  testID = "photo-placeholder",
}: {
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.box, style]} testID={testID}>
      <Icon name="image" size={iconSize} color={colors.muted} strokeWidth={1.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#E3E7EE", alignItems: "center", justifyContent: "center" },
});
