import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

// Canal para atualizar telas já abertas "no lugar", sem remontá-las. No aplicativo normal ninguém
// emite nada (só o Modo Demonstração chama `notifyDataChanged`), então os ouvintes ficam inertes.

type Listener = () => void;

const screens = new Set<Listener>();
const jobCaches = new Set<Listener>();

/** Telas e painéis com dados na tela: recarregam sem piscar quando o estado mudou por fora. */
export function useLiveRefresh(refresh: () => void) {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  useEffect(() => {
    const listener = () => latest.current();
    screens.add(listener);
    return () => {
      screens.delete(listener);
    };
  }, []);
}

/** Caches de oportunidades (detalhes e listas) que devem ser descartados quando o estado de uma vaga muda. */
export function onJobsInvalidated(listener: Listener): () => void {
  jobCaches.add(listener);
  return () => {
    jobCaches.delete(listener);
  };
}

/**
 * Avisa que os dados mudaram. `jobsChanged` descarta os caches de oportunidades (antes das telas,
 * para que elas já releiam dados novos). Devolve `true` se alguma tela abriu para atualizar no
 * lugar; senão quem chamou decide como atualizar (por exemplo, remontando).
 */
export function notifyDataChanged(jobsChanged: boolean): boolean {
  if (jobsChanged) jobCaches.forEach((listener) => listener());
  screens.forEach((listener) => listener());
  return screens.size > 0;
}

// --- Presença do chat -------------------------------------------------------------------------
// Quantos painéis de conversa estão visíveis agora (a conversa pode estar na rota /conversa/[id] ou
// escolhida na lista de /mensagens, e nesse caso a URL não muda). Só o Modo Demonstração lê isso,
// para mostrar os controles apenas enquanto a conversa está aberta.

let chatsOnScreen = 0;
const chatListeners = new Set<Listener>();

export const subscribeChatPresence = (listener: Listener): (() => void) => {
  chatListeners.add(listener);
  return () => {
    chatListeners.delete(listener);
  };
};
export const isChatOnScreen = (): boolean => chatsOnScreen > 0;

/**
 * Declara que um painel de conversa está na tela: montado E com a tela em foco. O Stack do
 * expo-router mantém a tela anterior montada (escondida) quando se navega para outra, então só
 * estar montado não basta.
 */
export function useChatPresence() {
  useFocusEffect(
    useCallback(() => {
      chatsOnScreen += 1;
      chatListeners.forEach((listener) => listener());
      return () => {
        chatsOnScreen -= 1;
        chatListeners.forEach((listener) => listener());
      };
    }, []),
  );
}
