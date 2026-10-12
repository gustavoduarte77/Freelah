import type { PrismaClient } from "./db";

/** De quanto em quanto tempo a API procura oportunidades com o prazo vencido. */
export const EXPIRY_INTERVAL_MS = 60_000;

/**
 * Grava `EXPIRED` nas oportunidades abertas (`PUBLISHED` e `NEGOTIATING`) cujo prazo terminou.
 *
 * - Só essas duas situações mudam: rascunho, cancelada, contratada, concluída e as que já estão
 *   expiradas nunca entram na condição.
 * - É um único UPDATE condicional, então é seguro rodar a qualquer hora, várias vezes e em mais de
 *   uma instância da API ao mesmo tempo: quem chega depois não encontra mais nada para mudar.
 * - Com `ownerId`, só olha as oportunidades dessa pessoa (usado antes de listar "Minhas
 *   oportunidades").
 * - A leitura pública e a privada já tratam prazo vencido como expirado sem depender desta rotina;
 *   ela só deixa o banco igual ao que a pessoa vê.
 *
 * Devolve quantas oportunidades foram marcadas.
 */
export async function expireOverdueJobs(
  prisma: PrismaClient,
  now: Date = new Date(),
  ownerId?: string,
): Promise<number> {
  const result = await prisma.job.updateMany({
    where: {
      status: { in: ["PUBLISHED", "NEGOTIATING"] },
      expiresAt: { lte: now },
      ...(ownerId ? { ownerId } : {}),
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export interface ExpiryJob {
  /** Executa uma varredura agora. Se já há uma em andamento, devolve a mesma em vez de iniciar outra. */
  runNow(): Promise<number>;
  /** Para a execução periódica (uma varredura em andamento termina normalmente). */
  stop(): void;
}

export interface ExpiryJobOptions {
  intervalMs?: number;
  /** Chamado quando uma varredura falha. A rotina continua e tenta de novo no próximo intervalo. */
  onError?: (error: unknown) => void;
  /** Para testes: substitui `setInterval`/`clearInterval`. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Executa `sweep` agora (na inicialização) e depois a cada intervalo. Nunca há duas varreduras ao
 * mesmo tempo: se a anterior ainda não terminou, o novo disparo reaproveita a que está em
 * andamento. Uma falha (banco fora do ar, por exemplo) é só registrada, nunca derruba a API.
 */
export function startExpiryJob(sweep: () => Promise<number>, options: ExpiryJobOptions = {}): ExpiryJob {
  const intervalMs = options.intervalMs ?? EXPIRY_INTERVAL_MS;
  const setTimer =
    options.setTimer ??
    ((callback: () => void, ms: number) => {
      const handle = setInterval(callback, ms);
      // A varredura não pode manter o processo vivo sozinha.
      handle.unref();
      return handle;
    });
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));
  let running: Promise<number> | null = null;

  function runNow(): Promise<number> {
    if (running) return running;
    const current = Promise.resolve()
      .then(sweep)
      .catch((error: unknown) => {
        options.onError?.(error);
        return 0;
      })
      .finally(() => {
        if (running === current) running = null;
      });
    running = current;
    return current;
  }

  void runNow();
  const handle = setTimer(() => void runNow(), intervalMs);
  return { runNow, stop: () => clearTimer(handle) };
}
