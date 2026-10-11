import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PreferencesSyncProvider } from "../src/features/preferences/PreferencesSyncProvider";

export default function RootLayout() {
  return (
    <PreferencesSyncProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </PreferencesSyncProvider>
  );
}
