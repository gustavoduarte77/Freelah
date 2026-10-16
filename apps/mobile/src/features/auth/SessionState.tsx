import { classifySession, sessionRetryDelayMs, type SessionState } from "@freelah/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "../../lib/auth-client";

type AppSession = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;

interface SessionContextValue {
  state: SessionState<AppSession>;
  /** Consulta a sessão de novo (usada pelo botão "Verificar de novo"). */
  recheck: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Dono único da consulta de sessão. Diferencia sessão, ausência de sessão confirmada pela API e
 * estado desconhecido (falha de rede ou do servidor): só o segundo conta como "não entrou".
 * No estado desconhecido nada é apagado nem liberado; a consulta é repetida com espera crescente
 * e para depois de poucas tentativas (o botão "Verificar de novo" continua disponível).
 */
export function SessionStateProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const [wasUnknown, setWasUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const state = classifySession<AppSession>({ data, isPending, error }, { wasUnknown });
  const unknown = state.status === "unknown";

  // Ajustes de estado derivados feitos durante a renderização (padrão recomendado pelo React):
  // lembrar que já estava "desconhecido" evita piscar para "carregando" a cada nova tentativa, e
  // sair desse estado zera a contagem de tentativas.
  if (wasUnknown !== unknown) setWasUnknown(unknown);
  if (!unknown && attempt !== 0) setAttempt(0);

  useEffect(() => {
    if (!unknown || isPending) return;
    const delay = sessionRetryDelayMs(attempt);
    if (delay === null) return;
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      void refetch();
    }, delay);
    return () => clearTimeout(timer);
  }, [unknown, isPending, attempt, refetch]);

  const value: SessionContextValue = {
    state,
    recheck: () => {
      setAttempt(0);
      void refetch();
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionState(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessionState precisa estar dentro de SessionStateProvider.");
  return value;
}
