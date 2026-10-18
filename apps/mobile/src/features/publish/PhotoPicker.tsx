import { MAX_JOB_IMAGES } from "@freelah/shared";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { radius } from "../../theme";
import { pickImageFiles } from "./photoFiles";
import { publishPhotos, usePublishPhotos } from "./photos";

/**
 * Fotos da oportunidade (opcional). A primeira é a capa; "Tornar capa" escolhe outra. As fotos são
 * reduzidas no próprio navegador e ficam só neste aparelho (Modo Demonstração): nada é enviado.
 */
export function PhotoPicker() {
  const { images, busy, message } = usePublishPhotos();
  const full = images.length >= MAX_JOB_IMAGES;

  async function choose() {
    const files = await pickImageFiles(true);
    await publishPhotos.add(files);
  }

  return (
    <View style={styles.block} testID="photo-picker">
      <Text style={styles.label}>Fotos (opcional)</Text>
      <Text style={styles.help}>
        Mostre o problema a quem vai fazer o serviço. Até {MAX_JOB_IMAGES} fotos; a primeira é a capa e você pode escolher outra.
      </Text>

      {images.length > 0 ? (
        <View style={styles.grid}>
          {images.map((uri, index) => (
            <View key={uri.slice(-40) + index} style={styles.item}>
              <View>
                <Image
                  source={{ uri }}
                  style={styles.thumb}
                  resizeMode="cover"
                  accessibilityLabel={index === 0 ? "Capa" : `Foto ${index + 1}`}
                />
                {index === 0 ? <Text style={styles.coverTag}>Capa</Text> : null}
              </View>
              <View style={styles.actions}>
                {index > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => publishPhotos.setCover(index)}>
                    <Text style={styles.action}>Tornar capa</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover foto ${index + 1}`}
                  onPress={() => publishPhotos.remove(index)}
                >
                  <Text style={[styles.action, styles.remove]}>Remover</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Sem fotos, o anúncio aparece só com o ícone da categoria.</Text>
      )}

      {message ? (
        <Text style={styles.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}

      <View style={styles.button}>
        <Button
          title={
            busy
              ? "Preparando fotos…"
              : full
                ? `Limite de ${MAX_JOB_IMAGES} fotos`
                : images.length > 0
                  ? "Adicionar mais fotos"
                  : "Adicionar fotos"
          }
          variant="secondary"
          onPress={() => void choose()}
          disabled={busy || full}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  help: { fontSize: 13, color: colors.muted },
  empty: { fontSize: 13, color: colors.muted, fontStyle: "italic" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { gap: 6, width: 120 },
  thumb: { width: 120, height: 90, borderRadius: radius.sm, backgroundColor: colors.border },
  coverTag: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.brand,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  actions: { gap: 2, alignItems: "flex-start" },
  action: { fontSize: 13, fontWeight: "700", color: colors.brand },
  remove: { color: colors.error },
  warn: { fontSize: 13, color: colors.warningText, backgroundColor: colors.warningSoft, borderRadius: 10, padding: 10 },
  button: { alignSelf: "flex-start" },
});
