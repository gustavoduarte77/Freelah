import { Image, StyleSheet, View } from "react-native";
import { radius } from "../../theme";
import { JobArt } from "./JobArt";

/**
 * Área de mídia da oportunidade. Hoje a API não guarda imagens, então mostra a ilustração da
 * categoria. Quando houver fotos (`images`), a primeira ocupa a área e as demais viram miniaturas;
 * nada aqui permite enviar arquivos.
 */
export function JobMedia({ categorySlug, images = [] }: { categorySlug: string; images?: string[] }) {
  const [main, ...rest] = images;
  if (!main) return <JobArt categorySlug={categorySlug} iconSize={72} style={styles.art} />;
  return (
    <View style={styles.gallery}>
      <Image source={{ uri: main }} style={styles.main} resizeMode="cover" accessibilityLabel="Foto da oportunidade" />
      {rest.length > 0 ? (
        <View style={styles.thumbs}>
          {rest.slice(0, 4).map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel="Foto da oportunidade" />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { height: 260, borderRadius: radius.lg },
  gallery: { gap: 8 },
  main: { height: 320, borderRadius: radius.lg, width: "100%" },
  thumbs: { flexDirection: "row", gap: 8 },
  thumb: { width: 88, height: 66, borderRadius: radius.sm },
});
