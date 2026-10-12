import type { RecoveryState } from "@freelah/shared";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { recovery } from "./coordinator";

/** Quando a pessoa volta ao app ou à aba, uma falha pendente ganha uma sonda imediata (com intervalo mínimo). */
export function RecoveryTriggers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS === "web") {
      const onVisible = () => {
        if (document.visibilityState === "visible") recovery.nudge();
      };
      const onNudge = () => recovery.nudge();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onNudge);
      window.addEventListener("online", onNudge);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onNudge);
        window.removeEventListener("online", onNudge);
      };
    }
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") recovery.nudge();
    });
    return () => subscription.remove();
  }, []);
  return <>{children}</>;
}

export function useRecovery(): { state: RecoveryState; retryNow: () => void } {
  const state = useSyncExternalStore(recovery.subscribe, recovery.getState, recovery.getState);
  return { state, retryNow: recovery.retryNow };
}
