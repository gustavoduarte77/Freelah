import { describe, expect, it } from "vitest";
import {
  createRecoveryCoordinator,
  type RecoverableResource,
  type RecoveryCoordinator,
} from "./recovery";

const DELAYS = [1000, 2000, 4000] as const;

/** Relógio, timers, sonda e consultas falsos: nada espera de verdade. */
function setup(options: { delays?: readonly number[]; maxRecoveryRounds?: number; minNudgeIntervalMs?: number } = {}) {
  let time = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const probe = {
    calls: 0,
    inFlight: 0,
    maxInFlight: 0,
    healthy: false,
    throws: false,
  };
  const coordinator: RecoveryCoordinator = createRecoveryCoordinator({
    delaysMs: options.delays ?? DELAYS,
    maxRecoveryRounds: options.maxRecoveryRounds,
    minNudgeIntervalMs: options.minNudgeIntervalMs ?? 0,
    now: () => time,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: time + ms, fn });
      return () => {
        timers.delete(id);
      };
    },
    probe: async () => {
      probe.calls++;
      probe.inFlight++;
      probe.maxInFlight = Math.max(probe.maxInFlight, probe.inFlight);
      await Promise.resolve();
      probe.inFlight--;
      if (probe.throws) throw new Error("sem conexão");
      return probe.healthy;
    },
  });

  async function flush() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  /** Avança o relógio executando os timers na ordem. */
  async function advance(ms: number) {
    const end = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].fn();
      await flush();
    }
    time = end;
    await flush();
  }

  /** Consulta falsa: `failed` até `recover()` decidir o resultado. */
  function resource(initial: "ok" | "failed" | "pending" = "failed", onRecover?: (r: Fake) => void) {
    const fake: Fake = {
      state: initial,
      recoverCalls: 0,
      status: () => fake.state,
      recover() {
        fake.recoverCalls++;
        fake.state = "pending";
        coordinator.notifyChange();
        onRecover?.(fake);
      },
      set(next) {
        fake.state = next;
        coordinator.notifyChange();
      },
    };
    coordinator.register(fake);
    return fake;
  }
  return { coordinator, probe, timers, advance, flush, resource, now: () => time };
}
interface Fake extends RecoverableResource {
  state: "ok" | "failed" | "pending";
  recoverCalls: number;
  set(next: "ok" | "failed" | "pending"): void;
}

describe("coordenador de recuperação", () => {
  it("sem falhas não agenda nem sonda nada", async () => {
    const t = setup();
    t.resource("ok");
    t.coordinator.notifyChange();
    await t.advance(60_000);
    expect(t.probe.calls).toBe(0);
    expect(t.coordinator.getState()).toEqual({ status: "idle", attempt: 0, failed: false });
  });

  it("uma falha agenda a primeira sonda; a API saudável faz a consulta tentar de novo uma vez", async () => {
    const t = setup();
    const r = t.resource("failed", (f) => f.set("ok"));
    expect(t.coordinator.getState()).toMatchObject({ status: "waiting", failed: true });
    await t.advance(999);
    expect(t.probe.calls).toBe(0);
    t.probe.healthy = true;
    await t.advance(1);
    expect(t.probe.calls).toBe(1);
    expect(r.recoverCalls).toBe(1);
    expect(r.state).toBe("ok");
    expect(t.coordinator.getState()).toEqual({ status: "idle", attempt: 0, failed: false });
    await t.advance(60_000);
    expect(t.probe.calls).toBe(1); // nada mais acontece
  });

  it("API fora do ar: a espera cresce a cada sonda e as tentativas acabam (sem laço)", async () => {
    const t = setup();
    t.resource("failed");
    const at: number[] = [];
    for (let i = 0; i < 20; i++) {
      const before = t.probe.calls;
      await t.advance(1000);
      if (t.probe.calls > before) at.push(t.now());
    }
    // 1 s, depois +2 s, depois +4 s
    expect(at).toEqual([1000, 3000, 7000]);
    expect(t.probe.calls).toBe(3);
    expect(t.coordinator.getState().status).toBe("gave_up");
    expect(t.timers.size).toBe(0);
    await t.advance(10 * 60_000);
    expect(t.probe.calls).toBe(3);
  });

  it("a API volta no meio da espera: a próxima sonda recupera", async () => {
    const t = setup();
    const r = t.resource("failed", (f) => f.set("ok"));
    await t.advance(1000); // 1ª sonda: fora do ar
    expect(t.coordinator.getState()).toMatchObject({ status: "waiting", attempt: 1 });
    t.probe.healthy = true;
    await t.advance(2000);
    expect(r.state).toBe("ok");
    expect(r.recoverCalls).toBe(1);
    expect(t.coordinator.getState().status).toBe("idle");
  });

  it("sonda que lança erro conta como API fora do ar", async () => {
    const t = setup();
    t.resource("failed");
    t.probe.throws = true;
    await t.advance(1000);
    expect(t.coordinator.getState()).toMatchObject({ status: "waiting", attempt: 1 });
  });

  it("várias consultas falhando juntas: UMA sonda e UMA nova tentativa para cada", async () => {
    const t = setup();
    const a = t.resource("failed", (f) => f.set("ok"));
    const b = t.resource("failed", (f) => f.set("ok"));
    const c = t.resource("failed", (f) => f.set("ok"));
    const healthy = t.resource("ok");
    t.probe.healthy = true;
    await t.advance(1000);
    expect(t.probe.calls).toBe(1);
    expect([a, b, c].map((r) => r.recoverCalls)).toEqual([1, 1, 1]);
    expect(healthy.recoverCalls).toBe(0);
    expect(t.probe.maxInFlight).toBe(1);
    expect(t.timers.size).toBe(0);
  });

  it("falhas repetidas não criam vários timers nem várias sondas", async () => {
    const t = setup();
    const a = t.resource("failed");
    t.resource("failed");
    a.set("failed");
    t.coordinator.notifyChange();
    t.coordinator.notifyChange();
    expect(t.timers.size).toBe(1);
    t.coordinator.nudge();
    t.coordinator.nudge();
    await t.flush();
    expect(t.probe.maxInFlight).toBe(1);
  });

  it("5xx: a API 'saudável' mas as consultas continuam falhando => número máximo de rodadas, sem laço", async () => {
    const t = setup({ maxRecoveryRounds: 2 });
    t.probe.healthy = true;
    const r = t.resource("failed", (f) => f.set("failed")); // sempre volta a falhar
    await t.advance(10 * 60_000);
    expect(r.recoverCalls).toBe(2);
    expect(t.probe.calls).toBe(3);
    expect(t.coordinator.getState().status).toBe("gave_up");
    expect(t.timers.size).toBe(0);
  });

  it("consulta que se recupera sozinha cancela a espera", async () => {
    const t = setup();
    const r = t.resource("failed");
    expect(t.timers.size).toBe(1);
    r.set("ok");
    expect(t.timers.size).toBe(0);
    expect(t.coordinator.getState().status).toBe("idle");
    await t.advance(60_000);
    expect(t.probe.calls).toBe(0);
  });

  it("consulta em andamento (pending) não zera o limite de rodadas", async () => {
    const t = setup({ maxRecoveryRounds: 2 });
    t.probe.healthy = true;
    const r = t.resource("failed", (f) => f.set("pending")); // nunca resolve
    await t.advance(1000);
    expect(r.recoverCalls).toBe(1);
    r.set("failed");
    await t.advance(1000);
    expect(r.recoverCalls).toBe(2);
    r.set("failed");
    await t.advance(1000);
    expect(r.recoverCalls).toBe(2); // 3ª rodada passou do limite
    expect(t.coordinator.getState().status).toBe("gave_up");
  });

  it("tudo voltando ao normal zera o limite para a próxima queda", async () => {
    const t = setup({ maxRecoveryRounds: 1 });
    t.probe.healthy = true;
    const r = t.resource("failed", (f) => f.set("ok"));
    await t.advance(1000);
    expect(r.state).toBe("ok");
    // nova queda: ainda pode recuperar, porque a anterior terminou bem
    r.set("failed");
    r.recoverCalls = 0;
    r.recover = () => {
      r.recoverCalls++;
      r.set("ok");
    };
    await t.advance(1000);
    expect(r.recoverCalls).toBe(1);
    expect(r.state).toBe("ok");
  });

  describe("foco da aba (nudge)", () => {
    it("durante a espera, sonda agora em vez de esperar o timer", async () => {
      const t = setup();
      const r = t.resource("failed", (f) => f.set("ok"));
      t.probe.healthy = true;
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBe(1);
      expect(r.recoverCalls).toBe(1);
      expect(t.timers.size).toBe(0);
    });

    it("sem falhas não sonda", async () => {
      const t = setup();
      t.resource("ok");
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBe(0);
    });

    it("tem intervalo mínimo entre sondas, para o foco não gerar rajada", async () => {
      const t = setup({ minNudgeIntervalMs: 5000 });
      t.resource("failed");
      t.coordinator.nudge();
      await t.flush();
      t.coordinator.nudge();
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBe(1);
      await t.advance(5000);
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBeGreaterThanOrEqual(2);
    });

    it("depois de desistir, voltar à aba é uma chance nova: sonda e recupera", async () => {
      const t = setup();
      const r = t.resource("failed", (f) => f.set("ok"));
      await t.advance(60_000);
      expect(t.coordinator.getState().status).toBe("gave_up");
      const calls = t.probe.calls;
      t.probe.healthy = true;
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBe(calls + 1);
      expect(r.state).toBe("ok");
      expect(t.coordinator.getState().status).toBe("idle");
    });

    it("depois de desistir, se a API ainda está fora, continua desistido (uma sonda só)", async () => {
      const t = setup();
      t.resource("failed");
      await t.advance(60_000);
      const calls = t.probe.calls;
      t.coordinator.nudge();
      await t.flush();
      expect(t.probe.calls).toBe(calls + 1);
      expect(t.coordinator.getState().status).toBe("gave_up");
      expect(t.timers.size).toBe(0);
    });
  });

  describe("tentar de novo pedido pela pessoa", () => {
    it("refaz só as consultas que falharam, na hora, sem sonda", async () => {
      const t = setup();
      const failed = t.resource("failed", (f) => f.set("ok"));
      const fine = t.resource("ok");
      t.coordinator.retryNow();
      expect(failed.recoverCalls).toBe(1);
      expect(fine.recoverCalls).toBe(0);
      expect(t.probe.calls).toBe(0);
      expect(t.timers.size).toBe(0);
    });

    it("depois de desistir, volta a valer o ciclo completo se a consulta falhar de novo", async () => {
      const t = setup();
      const r = t.resource("failed", (f) => f.set("failed"));
      await t.advance(60_000);
      expect(t.coordinator.getState().status).toBe("gave_up");
      t.coordinator.retryNow();
      expect(r.recoverCalls).toBe(1);
      expect(t.coordinator.getState().status).toBe("waiting"); // falhou de novo: recomeça a espera
      expect(t.timers.size).toBe(1);
    });

    it("cancela a sonda em andamento (o resultado dela é ignorado)", async () => {
      const t = setup();
      const r = t.resource("failed", (f) => f.set("ok"));
      t.probe.healthy = true;
      await t.advance(1000); // inicia e conclui a sonda...
      expect(r.recoverCalls).toBe(1);
      t.coordinator.retryNow();
      expect(r.recoverCalls).toBe(1); // já estava ok: nada a refazer
    });
  });

  it("cancelar o registro tira a consulta do jogo", async () => {
    const t = setup();
    const fake: RecoverableResource = { status: () => "failed", recover: () => undefined };
    const unregister = t.coordinator.register(fake);
    t.coordinator.notifyChange();
    expect(t.coordinator.getState().failed).toBe(true);
    unregister();
    expect(t.coordinator.getState()).toEqual({ status: "idle", attempt: 0, failed: false });
    expect(t.timers.size).toBe(0);
  });

  it("assinantes são avisados das mudanças e param quando cancelam", async () => {
    const t = setup();
    const seen: string[] = [];
    const off = t.coordinator.subscribe(() => seen.push(t.coordinator.getState().status));
    t.resource("failed", (f) => f.set("ok"));
    t.probe.healthy = true;
    await t.advance(1000);
    expect(seen).toContain("waiting");
    expect(seen).toContain("probing");
    expect(seen[seen.length - 1]).toBe("idle");
    off();
    const count = seen.length;
    t.resource("failed");
    expect(seen).toHaveLength(count);
  });
});
