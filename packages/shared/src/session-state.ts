// Estado da autenticação visto pelo app (PRD 10.3). A pergunta "tem sessão?" tem TRÊS respostas
// honestas, e falha de rede ou erro 5xx NÃO é a resposta "não tem": é "não sei".

export interface SessionSnapshot<T> {
  /** Sessão conhecida (`null` ou ausente se não há ou ainda não se sabe). */
  data: T | null | undefined;
  /** Primeira consulta ainda em andamento. */
  isPending: boolean;
  /** Último erro da consulta de sessão, se houve. */
  error: unknown;
}

export type SessionState<T> =
  | { status: "loading" } // ainda consultando pela primeira vez
  | { status: "authenticated"; session: T }
  | { status: "unauthenticated" } // a API confirmou: não há sessão (resposta vazia ou 401)
  | { status: "unknown"; error: unknown }; // falha de conexão ou do servidor: não dá para saber

function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/**
 * `wasUnknown`: o estado anterior já era "desconhecido". Enquanto uma nova tentativa está em
 * andamento, continua "desconhecido" (e não volta a "carregando"), para a tela não piscar.
 */
export function classifySession<T>(
  snapshot: SessionSnapshot<T>,
  options: { wasUnknown?: boolean } = {},
): SessionState<T> {
  // Uma sessão já conhecida nunca é descartada por causa de uma falha de consulta.
  if (snapshot.data) return { status: "authenticated", session: snapshot.data };
  if (snapshot.error) {
    return statusOf(snapshot.error) === 401
      ? { status: "unauthenticated" }
      : { status: "unknown", error: snapshot.error };
  }
  if (snapshot.isPending) {
    return options.wasUnknown ? { status: "unknown", error: null } : { status: "loading" };
  }
  return { status: "unauthenticated" };
}

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 30_000, 30_000] as const;

/** Espera antes da tentativa automática número `attempt` (0, 1, ...); `null` = parar de tentar sozinho. */
export function sessionRetryDelayMs(attempt: number): number | null {
  return attempt >= 0 && attempt < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempt]! : null;
}
