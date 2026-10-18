import { useEffect, useState } from "react";
import { myJobsApi } from "../publish/api";

/**
 * Id da conversa já existente com a pessoa do perfil, ou `null`. Só olha as conversas da própria
 * sessão: sem login, sem conversa ou sem `profileId` na lista (só o Modo Demonstração o envia),
 * não há o que abrir e a tela não oferece o botão.
 */
export function useConversationWith(profileId: string): string | null {
  const [found, setFound] = useState<{ profileId: string; conversationId: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    myJobsApi.conversations().then(
      (list) => {
        const match = list.find((item) => item.other.profileId === profileId);
        if (active) setFound({ profileId, conversationId: match?.id ?? null });
      },
      () => {
        if (active) setFound({ profileId, conversationId: null });
      },
    );
    return () => {
      active = false;
    };
  }, [profileId]);

  return found?.profileId === profileId ? found.conversationId : null;
}
