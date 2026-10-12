import { createRecoveryCoordinator } from "@freelah/shared";
import { fetchHealth } from "../../lib/api";

const PROBE_TIMEOUT_MS = 5000;

/** Sonda de saúde: `true` só se `/health` respondeu a tempo. Nunca lança. */
async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetchHealth(controller.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Coordenador único do app: uma sonda por vez para todas as consultas que falharem. */
export const recovery = createRecoveryCoordinator({ probe });
