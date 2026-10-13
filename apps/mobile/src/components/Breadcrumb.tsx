import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { Icon } from "./Icon";

export interface Crumb {
  label: string;
  /** Sem destino, é a página atual. */
  href?: Href;
}

/** Trilha discreta para páginas de detalhe: a última parte é a página atual. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const router = useRouter();
  return (
    <View style={styles.row} role="navigation" accessibilityLabel="Você está em">
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.item}>
          {index > 0 ? <Icon name="chevronRight" size={14} color={colors.muted} /> : null}
          {item.href ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(item.href as Href)}
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.link,
                hovered ? styles.linkHover : null,
              ]}
            >
              <Text style={styles.linkText}>{item.label}</Text>
            </Pressable>
          ) : (
            <Text style={styles.current} numberOfLines={1} accessibilityState={{ selected: true }}>
              {item.label}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  link: { paddingVertical: 4, paddingHorizontal: 2, borderRadius: 4, cursor: "pointer" },
  linkHover: { backgroundColor: colors.brandSoft },
  linkText: { fontSize: 14, fontWeight: "600", color: colors.brand },
  current: { fontSize: 14, color: colors.muted, flexShrink: 1 },
});
