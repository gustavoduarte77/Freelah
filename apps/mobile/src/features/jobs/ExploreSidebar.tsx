import type { Category } from "@freelah/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, iconForCategory, type IconName } from "../../components/Icon";
import { colors, radius, shadow } from "../../theme";

/** Largura e espaço da barra lateral de Explorar e da Home (a mesma nas duas telas). */
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_GAP = 28;

/** Cartão da barra lateral. */
export function SidebarCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.sideCard}>
      <Text style={styles.sideTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Categorias em coluna (barra lateral); mesma regra do seletor em chips. */
export function CategoryList({
  categories,
  selected,
  onSelect,
}: {
  categories: Category[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const rows: Array<{ key: string; slug: string | null; label: string; icon: IconName }> = [
    { key: "all", slug: null, label: "Todas", icon: "grid" },
    ...categories.map((item) => ({
      key: item.id,
      slug: item.slug,
      label: item.name,
      icon: iconForCategory(item.slug),
    })),
  ];
  return (
    <View style={styles.categoryList} accessibilityRole="radiogroup">
      {rows.map((row) => {
        const active = selected === row.slug;
        return (
          <Pressable
            key={row.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            aria-checked={active}
            accessibilityLabel={row.label}
            onPress={() => onSelect(row.slug !== null && active ? null : row.slug)}
            style={({ hovered }: { hovered?: boolean }) => [
              styles.categoryRow,
              active ? styles.categoryRowActive : hovered ? styles.categoryRowHover : null,
            ]}
          >
            <Icon name={row.icon} size={16} color={active ? colors.brand : colors.muted} />
            <Text style={[styles.categoryLabel, active ? styles.categoryLabelActive : null]}>{row.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sideCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
    padding: 16,
    gap: 12,
  },
  sideTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  categoryList: { gap: 2 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  categoryRowActive: { backgroundColor: colors.brandSoft },
  categoryRowHover: { backgroundColor: colors.background },
  categoryLabel: { fontSize: 14, fontWeight: "600", color: colors.textSoft, flexShrink: 1 },
  categoryLabelActive: { color: colors.brand },
});
