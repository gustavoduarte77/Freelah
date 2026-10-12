import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionStateProvider } from "../src/features/auth/SessionState";
import { RecoveryTriggers } from "../src/features/recovery/RecoveryProvider";
import { PreferencesSyncProvider } from "../src/features/preferences/PreferencesSyncProvider";

export default function RootLayout() {
  return (
    <SessionStateProvider>
      <PreferencesSyncProvider>
        <RecoveryTriggers>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </RecoveryTriggers>
      </PreferencesSyncProvider>
    </SessionStateProvider>
  );
}
