import { useCallback, useEffect, useState } from "react";
import type { HealthResponse } from "@freelah/shared";
import { fetchHealth } from "../../lib/api";

export type ApiHealthState =
  | { status: "loading" }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; message: string };

const TIMEOUT_MS = 8000;

export function useApiHealth() {
  const [state, setState] = useState<ApiHealthState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    fetchHealth(controller.signal)
      .then((data) => setState({ status: "online", data }))
      .catch((error: unknown) => {
        const timedOut = error instanceof Error && error.name === "AbortError";
        setState({
          status: "offline",
          message: timedOut
            ? "A API demorou demais para responder."
            : "Não foi possível conectar à API.",
        });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
