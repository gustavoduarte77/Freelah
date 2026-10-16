import type { MyJobsApiError } from "@freelah/shared";
import { useRouter, type Href } from "expo-router";
import { useRef, useState } from "react";
import { myJobsApi } from "../publish/api";

/**
 * Abre a conversa de um interesse (a API a cria na primeira vez, uma só por interesse) e vai para
 * ela. Cliques repetidos enquanto abre são ignorados; falhas viram uma mensagem para a pessoa.
 */
export function useOpenChat() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function open(interestId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const conversationId = await myJobsApi.openConversation(interestId);
      router.push(`/conversa/${conversationId}` as Href);
    } catch (caught) {
      const failure = caught as MyJobsApiError;
      setError(
        failure.kind === "unauthorized" || failure.kind === "invalid_state"
          ? failure.message
          : "Não foi possível abrir a conversa agora. Tente de novo.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { open, busy, error };
}
