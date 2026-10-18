import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { colors } from "../../components/ui";
import { radius } from "../../theme";
import { JobArt } from "./JobArt";

/**
 * Área de mídia do detalhe da oportunidade.
 * - Com fotos (`images`, a capa primeiro): a capa em destaque e, abaixo, todas as fotos como
 *   miniaturas; tocar numa miniatura a mostra em destaque.
 * - Sem fotos: a ilustração da categoria. Se o anúncio diz ter fotos (`photoCount`) mas elas não
 *   foram enviadas (anúncios fictícios da demonstração), a ilustração ganha o ícone e a quantidade.
 * Nada aqui permite enviar arquivos.
 */
export function JobMedia({
  categorySlug,
  images = [],
  photoCount = 0,
}: {
  categorySlug: string;
  images?: string[];
  photoCount?: number;
}) {
  const [selected, setSelected] = useState(0);
  const main = images[Math.min(selected, images.length - 1)];
  if (!main) {
    return (
      <View>
        <JobArt categorySlug={categorySlug} iconSize={72} style={styles.art} />
        {photoCount > 0 ? (
          <View style={styles.placeholderBadge} accessibilityLabel={`${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`}>
            <Icon name="image" size={16} color={colors.brand} />
            <Text style={styles.placeholderText}>
              {photoCount} {photoCount === 1 ? "foto" : "fotos"} · ilustrativo na demonstração
            </Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.gallery}>
      <Image
        source={{ uri: main }}
        style={styles.main}
        resizeMode="cover"
        accessibilityLabel={selected === 0 ? "Capa da oportunidade" : `Foto ${selected + 1} da oportunidade`}
      />
      {images.length > 1 ? (
        <View style={styles.thumbs}>
          {images.map((uri, index) => (
            <Pressable
              key={uri.slice(-40) + index}
              accessibilityRole="button"
              accessibilityLabel={index === 0 ? "Ver a capa" : `Ver a foto ${index + 1}`}
              onPress={() => setSelected(index)}
              style={[styles.thumbWrap, index === selected ? styles.thumbActive : null]}
            >
              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
              {index === 0 ? <Text style={styles.coverTag}>Capa</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { height: 260, borderRadius: radius.lg },
  placeholderBadge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  placeholderText: { fontSize: 13, fontWeight: "700", color: colors.brand },
  gallery: { gap: 8 },
  main: { height: 320, borderRadius: radius.lg, width: "100%", backgroundColor: colors.border },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { borderRadius: radius.sm, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  thumbActive: { borderColor: colors.brand },
  thumb: { width: 88, height: 66 },
  coverTag: {
    position: "absolute",
    left: 4,
    top: 4,
    backgroundColor: colors.brand,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
});
