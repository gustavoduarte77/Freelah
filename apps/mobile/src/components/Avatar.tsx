import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { Icon } from "./Icon";

/**
 * Avatar circular. Mostra a foto quando houver `uri` e, sem foto, um perfil neutro. As conversas
 * ainda não recebem foto da API, então hoje aparece sempre o placeholder.
 */
export function Avatar({ size = 44, uri }: { size?: number; uri?: string | null }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, box]}
    >
      {uri ? (
        <Image source={{ uri }} style={box} />
      ) : (
        <Icon name="user" size={Math.round(size * 0.5)} color="#8A97AB" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#E6EBF3",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
