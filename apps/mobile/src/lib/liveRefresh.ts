import { useEffect, useRef } from "react";

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
