import { describe, expect, it, vi } from "vitest";
import { EXPIRY_INTERVAL_MS, startExpiryJob } from "./expiry";

/** Temporizador manual: o teste decide quando "passa um intervalo". */
function manualTimer() {
  let callback: (() => void) | null = null;
  let intervalMs = 0;
  return {
    setTimer: (cb: () => void, ms: number) => {
      callback = cb;
      intervalMs = ms;
      return "handle";
    },
    clearTimer: vi.fn(() => {
      callback = null;
    }),
    tick: () => callback?.(),
    get active() {
      return callback !== null;
    },
    get lastIntervalMs() {
      return intervalMs;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Varredura que só termina quando o teste manda. */
function slowSweep() {
  const pending: Array<(count: number) => void> = [];
  const sweep = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        pending.push(resolve);
      }),
  );
  return { sweep, finish: (count = 0) => pending.shift()?.(count), get waiting() { return pending.length; } };
}

describe("startExpiryJob", () => {
  it("varre na inicialização e depois a cada intervalo (padrão: 1 minuto)", async () => {
    const timer = manualTimer();
    const sweep = vi.fn(async () => 0);
    startExpiryJob(sweep, timer);
    await flush();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(timer.lastIntervalMs).toBe(EXPIRY_INTERVAL_MS);
    timer.tick();
    await flush();
    timer.tick();
    await flush();
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  it("usa o intervalo informado", () => {
    const timer = manualTimer();
    startExpiryJob(async () => 0, { ...timer, intervalMs: 5_000 });
    expect(timer.lastIntervalMs).toBe(5_000);
  });

  it("nunca roda duas varreduras ao mesmo tempo: disparos durante uma em andamento são ignorados", async () => {
    const timer = manualTimer();
    const slow = slowSweep();
    startExpiryJob(slow.sweep, timer);
    await flush();
    timer.tick();
    timer.tick();
    timer.tick();
    await flush();
    expect(slow.sweep).toHaveBeenCalledTimes(1);
    expect(slow.waiting).toBe(1);

    slow.finish(2);
    await flush();
    timer.tick();
    await flush();
    expect(slow.sweep).toHaveBeenCalledTimes(2);
  });

  it("runNow durante uma varredura em andamento devolve a mesma, sem iniciar outra", async () => {
    const timer = manualTimer();
    const slow = slowSweep();
    const job = startExpiryJob(slow.sweep, timer);
    await flush();
    const a = job.runNow();
    const b = job.runNow();
    expect(a).toBe(b);
    expect(slow.sweep).toHaveBeenCalledTimes(1);
    slow.finish(4);
    expect(await a).toBe(4);
  });

  it("runNow depois que a anterior terminou inicia uma nova", async () => {
    const timer = manualTimer();
    const sweep = vi.fn(async () => 1);
    const job = startExpiryJob(sweep, timer);
    await job.runNow();
    await job.runNow();
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("uma falha é registrada e não impede a próxima varredura nem gera erro sem tratamento", async () => {
    const timer = manualTimer();
    const onError = vi.fn();
    const sweep = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("banco fora do ar"))
      .mockResolvedValue(3);
    const job = startExpiryJob(sweep, { ...timer, onError });
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe("banco fora do ar");
    timer.tick();
    expect(await job.runNow()).toBe(3);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("uma função que falha ao ser chamada (síncrona) também é tratada", async () => {
    const timer = manualTimer();
    const onError = vi.fn();
    const job = startExpiryJob(() => {
      throw new Error("falha imediata");
    }, { ...timer, onError });
    expect(await job.runNow()).toBe(0);
    expect(onError).toHaveBeenCalled();
  });

  it("a falha de uma varredura libera a trava para a seguinte", async () => {
    const timer = manualTimer();
    const sweep = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error("x")).mockResolvedValue(0);
    const job = startExpiryJob(sweep, { ...timer, onError: () => undefined });
    await job.runNow();
    await job.runNow();
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("stop interrompe a execução periódica", async () => {
    const timer = manualTimer();
    const sweep = vi.fn(async () => 0);
    const job = startExpiryJob(sweep, timer);
    await flush();
    job.stop();
    expect(timer.clearTimer).toHaveBeenCalledTimes(1);
    expect(timer.active).toBe(false);
    timer.tick();
    await flush();
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("com o temporizador padrão, dispara pelo relógio e não segura o processo", async () => {
    vi.useFakeTimers();
    try {
      const sweep = vi.fn(async () => 0);
      const job = startExpiryJob(sweep, { intervalMs: 1000 });
      await vi.advanceTimersByTimeAsync(3500);
      expect(sweep).toHaveBeenCalledTimes(4); // início + 3 intervalos
      job.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(sweep).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
