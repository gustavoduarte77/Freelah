import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionStateProvider } from "../src/features/auth/SessionState";
import { PreferencesSyncProvider } from "../src/features/preferences/PreferencesSyncProvider";

export default function RootLayout() {
  return (
    <SessionStateProvider>
      <PreferencesSyncProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </PreferencesSyncProvider>
    </SessionStateProvider>
  );
}
