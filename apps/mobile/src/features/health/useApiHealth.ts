import type { HealthResponse } from "@freelah/shared";
import { useEffect, useSyncExternalStore } from "react";
import { healthController } from "../jobs/registry";

export type ApiHealthState =
  | { status: "loading" }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; message: string };

/** Status da API para a linha de diagnóstico da Home; a recuperação é feita pelo coordenador. */
export function useApiHealth(): { state: ApiHealthState } {
  useEffect(() => healthController.load(), []);
  const raw = useSyncExternalStore(healthController.subscribe, healthController.getState, healthController.getState);
  if (raw.status === "loading") return { state: { status: "loading" } };
  if (raw.status === "error") return { state: { status: "offline", message: raw.error.message } };
  if (raw.refreshError) return { state: { status: "offline", message: raw.refreshError.message } };
  return { state: { status: "online", data: raw.data } };
}
