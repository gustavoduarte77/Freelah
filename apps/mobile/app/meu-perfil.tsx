import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../src/components/ui";
import { OwnProfileGate } from "../src/features/profile/OwnProfileGate";
import { ProfileCard } from "../src/features/profile/ProfileView";
import { PAGE_PADDING } from "../src/theme";

/** Meu perfil: como as outras pessoas veem a sua conta (nunca mostra telefone nem e-mail), com atalho para editar. */
export default function OwnProfileScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "Meu perfil" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <OwnProfileGate redirect="/meu-perfil">{(profile) => <ProfileCard profile={profile} isOwn />}</OwnProfileGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: PAGE_PADDING, paddingBottom: 48, gap: 14 },
});
