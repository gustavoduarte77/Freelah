import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../components/ui";
import { radius } from "../../theme";
import { JobArt } from "./JobArt";
import { PhotoPlaceholder } from "./PhotoPlaceholder";

/**
 * Área de mídia do detalhe da oportunidade.
 * - Com fotos (`images`, a capa primeiro): a capa em destaque e, abaixo, todas as fotos como
 *   miniaturas; tocar numa miniatura a mostra em destaque.
 * - Sem fotos: a ilustração da categoria. Se o anúncio diz ter fotos (`photoCount`) mas elas não
 *   foram enviadas (anúncios fictícios da demonstração), aparecem espaços cinza com o ícone de imagem.
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
    // Anúncio fictício que diz ter fotos: espaços cinza com o ícone de imagem, na mesma proporção da
    // galeria real (capa grande e miniaturas). Nenhuma fotografia nem arquivo de imagem é usado.
    if (photoCount > 0) {
      return (
        <View style={styles.gallery} testID="photo-placeholders" accessibilityLabel={`${photoCount} ${photoCount === 1 ? "foto" : "fotos"} (espaços reservados)`}>
          <PhotoPlaceholder iconSize={56} style={styles.mainPlaceholder} testID="photo-placeholder-main" />
          {photoCount > 1 ? (
            <View style={styles.thumbs}>
              {Array.from({ length: photoCount }, (_, index) => (
                <PhotoPlaceholder key={index} iconSize={20} style={[styles.thumb, styles.thumbPlaceholder]} testID="photo-placeholder-thumb" />
              ))}
            </View>
          ) : null}
          <Text style={styles.placeholderCaption}>Fotos de exemplo: espaços reservados na demonstração.</Text>
        </View>
      );
    }
    return (
      <View>
        <JobArt categorySlug={categorySlug} iconSize={72} style={styles.art} />
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
  mainPlaceholder: { height: 320, borderRadius: radius.lg, width: "100%" },
  thumbPlaceholder: { borderRadius: radius.sm },
  placeholderCaption: { fontSize: 12, color: colors.muted },
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
