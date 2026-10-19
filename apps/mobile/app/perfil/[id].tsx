import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../src/components/Icon";
import { Button, colors } from "../../src/components/ui";
import { LoadingBox } from "../../src/features/jobs/components";
import { ProfileCard } from "../../src/features/profile/ProfileView";
import { useProfile } from "../../src/features/profile/useProfile";
import { PAGE_PADDING, radius } from "../../src/theme";

/** Perfil público de uma pessoa: apresentação, áreas de atuação e avaliações. Nunca mostra contato privado. */
export default function ProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const { state, retry } = useProfile(id);

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: state.status === "ready" ? state.profile.name : "Perfil" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <BackButton />
        </View>
        {state.status === "loading" ? (
          <LoadingBox label="Carregando perfil…" />
        ) : state.status === "error" ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>
              {state.notFound ? "Perfil não encontrado." : "Não foi possível carregar o perfil agora."}
            </Text>
            {state.notFound ? null : <Button title="Tentar de novo" onPress={retry} />}
          </View>
        ) : (
          <ProfileCard profile={state.profile} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Volta para onde a pessoa estava (por exemplo, a conversa); sem histórico, vai para o início. */
function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar para a página anterior"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={({ hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.back,
        hovered ? styles.backHover : null,
        focused ? styles.backFocus : null,
      ]}
    >
      <Icon name="chevronLeft" size={16} color={colors.brand} />
      <Text style={styles.backText}>Voltar</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
  back: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.surface,
    cursor: "pointer",
  },
  backHover: { backgroundColor: colors.brandSoft },
  backFocus: { outlineWidth: 2, outlineStyle: "solid", outlineColor: colors.brand, outlineOffset: 2 },
  backText: { fontSize: 14, fontWeight: "700", color: colors.brand },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 12, padding: 12, gap: 8 },
  errorText: { fontSize: 14, color: colors.error },
});
