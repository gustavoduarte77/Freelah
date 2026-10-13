import { DemoRoot } from "../src/demo/gate"; // precisa vir primeiro (Modo Demonstração; inerte no app normal)
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionStateProvider } from "../src/features/auth/SessionState";
import { RecoveryTriggers } from "../src/features/recovery/RecoveryProvider";
import { PreferencesSyncProvider } from "../src/features/preferences/PreferencesSyncProvider";
import { AppShell } from "../src/components/AppShell";

export default function RootLayout() {
  return (
    <SessionStateProvider>
      <PreferencesSyncProvider>
        <RecoveryTriggers>
          <StatusBar style="dark" />
          <AppShell>
            <DemoRoot>
              <Stack screenOptions={{ headerShown: false }} />
            </DemoRoot>
          </AppShell>
        </RecoveryTriggers>
      </PreferencesSyncProvider>
    </SessionStateProvider>
  );
}
