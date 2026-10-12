// Recuperação coordenada depois de uma queda da API: UMA sonda de saúde por vez, com espera
// crescente e limite, e uma única nova tentativa para cada consulta que falhou. Sem React, sem
// fetch real e sem timers reais (tudo injetado), para ser testado por completo.

declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(id: unknown): void;

export type RecoveryStatus =
  | "idle" // nada a recuperar
  | "waiting" // esperando para sondar a API de novo
  | "probing" // uma sonda está em andamento
  | "gave_up"; // acabaram as tentativas automáticas (ação da pessoa ou foco da aba retomam)

export interface RecoveryState {
  status: RecoveryStatus;
  /** Número da próxima sonda (0 = primeira). */
  attempt: number;
  /** Há pelo menos uma consulta registrada com falha recuperável. */
  failed: boolean;
}

/** Uma consulta que sabe dizer se falhou e como tentar de novo. */
export interface RecoverableResource {
  /** `failed`: erro de rede ou do servidor; `pending`: em andamento; `ok`: tudo certo (ou erro que não adianta repetir). */
  status(): "ok" | "failed" | "pending";
  /** Nova tentativa (precisa ser idempotente enquanto já está carregando). */
  recover(): void;
}

export interface RecoveryDeps {
  /** `true` se a API respondeu como saudável. Pode lançar: conta como "fora do ar". */
  probe: () => Promise<boolean>;
  /** Agenda `callback`; devolve a função que cancela. */
  setTimer?: (callback: () => void, ms: number) => () => void;
  now?: () => number;
  /** Esperas antes de cada sonda automática; o fim da lista encerra as tentativas. */
  delaysMs?: readonly number[];
  /** Quantas vezes a API pode estar "saudável" e as consultas ainda assim continuarem falhando. */
  maxRecoveryRounds?: number;
  /** Intervalo mínimo entre sondas pedidas pelo foco da aba. */
  minNudgeIntervalMs?: number;
}

export interface RecoveryCoordinator {
  getState(): RecoveryState;
  subscribe(listener: () => void): () => void;
  register(resource: RecoverableResource): () => void;
  /** Alguma consulta registrada mudou de estado. */
  notifyChange(): void;
  /** A aba voltou ao foco (ou a rede voltou): sonda agora, se houver falhas. */
  nudge(): void;
  /** A pessoa pediu para tentar de novo: refaz as consultas que falharam, sem esperar a sonda. */
  retryNow(): void;
}

export const DEFAULT_RECOVERY_DELAYS_MS = [3_000, 5_000, 10_000, 20_000, 30_000, 30_000] as const;

export function createRecoveryCoordinator(deps: RecoveryDeps): RecoveryCoordinator {
  const delays = deps.delaysMs ?? DEFAULT_RECOVERY_DELAYS_MS;
  const maxRounds = deps.maxRecoveryRounds ?? 3;
  const minNudge = deps.minNudgeIntervalMs ?? 5_000;
  const now = deps.now ?? (() => Date.now());
  const setTimer =
    deps.setTimer ??
    ((callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    });

  const resources = new Set<RecoverableResource>();
  const listeners = new Set<() => void>();
  let state: RecoveryState = { status: "idle", attempt: 0, failed: false };
  let cancelTimer: (() => void) | null = null;
  let probing = false;
  let epoch = 0; // invalida a sonda em andamento quando algo a torna irrelevante
  let rounds = 0;
  let lastProbeAt = Number.NEGATIVE_INFINITY;

  function setState(next: RecoveryState) {
    if (next.status === state.status && next.attempt === state.attempt && next.failed === state.failed) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function summary() {
    let failed = false;
    let pending = false;
    for (const resource of resources) {
      const status = resource.status();
      if (status === "failed") failed = true;
      else if (status === "pending") pending = true;
    }
    return { failed, pending };
  }

  function stopTimer() {
    cancelTimer?.();
    cancelTimer = null;
  }

  function goIdle(options: { resetRounds: boolean }) {
    stopTimer();
    epoch++;
    probing = false;
    if (options.resetRounds) rounds = 0;
    setState({ status: "idle", attempt: 0, failed: summary().failed });
  }

  function giveUp(attempt: number) {
    stopTimer();
    setState({ status: "gave_up", attempt, failed: summary().failed });
  }

  function recoverAll() {
    for (const resource of [...resources]) {
      if (resource.status() === "failed") resource.recover();
    }
  }

  function scheduleProbe(attempt: number) {
    const delay = delays[attempt];
    if (delay === undefined) {
      giveUp(attempt);
      return;
    }
    stopTimer();
    setState({ status: "waiting", attempt, failed: true });
    cancelTimer = setTimer(() => {
      cancelTimer = null;
      void runProbe(attempt);
    }, delay);
  }

  async function runProbe(attempt: number) {
    if (probing) return;
    if (!summary().failed) {
      goIdle({ resetRounds: false });
      return;
    }
    probing = true;
    const mine = ++epoch;
    lastProbeAt = now();
    setState({ status: "probing", attempt, failed: true });

    let healthy = false;
    try {
      healthy = await deps.probe();
    } catch {
      healthy = false;
    }
    if (mine !== epoch) return; // substituída por uma ação mais nova
    probing = false;

    if (!summary().failed) {
      goIdle({ resetRounds: false });
      return;
    }
    if (!healthy) {
      scheduleProbe(attempt + 1);
      return;
    }
    // A API respondeu, então as consultas voltam a tentar uma vez. Se mesmo assim continuarem
    // falhando (por exemplo, erro 5xx só nas rotas de dados), há um número máximo de rodadas.
    rounds++;
    if (rounds > maxRounds) {
      giveUp(attempt);
      return;
    }
    setState({ status: "idle", attempt: 0, failed: false });
    recoverAll();
  }

  function notifyChange() {
    const { failed, pending } = summary();
    if (failed) {
      if (state.status === "idle") scheduleProbe(0);
      else setState({ ...state, failed: true });
      return;
    }
    // Sem falhas: nada a sondar. Só zera o limite de rodadas quando tudo voltou ao normal.
    if (state.status !== "idle" || state.failed) goIdle({ resetRounds: !pending });
    else if (!pending) rounds = 0;
  }

  function nudge() {
    if (!summary().failed || probing) return;
    if (now() - lastProbeAt < minNudge) return;
    const fromGaveUp = state.status === "gave_up";
    stopTimer();
    if (fromGaveUp) rounds = 0; // voltar à aba é uma chance nova
    void runProbe(fromGaveUp ? delays.length : state.attempt);
  }

  function retryNow() {
    stopTimer();
    epoch++;
    probing = false;
    rounds = 0;
    setState({ status: "idle", attempt: 0, failed: false });
    recoverAll();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register(resource) {
      resources.add(resource);
      notifyChange();
      return () => {
        resources.delete(resource);
        notifyChange();
      };
    },
    notifyChange,
    nudge,
    retryNow,
  };
}
