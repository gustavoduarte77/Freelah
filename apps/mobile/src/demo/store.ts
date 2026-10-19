import { notifyDataChanged } from "../lib/liveRefresh";
import { JOB_PRICE_MAX_CENTS, PROPOSAL_STATUSES, updateProfileSchema, type ProposalStatus, type UpdateProfileInput } from "@freelah/shared";
import {
  CATEGORIES,
  HIRE_ACCEPT_STEP,
  HIRE_CONVERSATION_ID,
  HIRE_MESSAGES,
  HIRE_PROPOSAL_AMOUNT_CENTS,
  HIRE_PROPOSAL_STEP,
  HIRE_TOTAL_STEPS,
  INVITE_STEP,
  SCRIPT_CONVERSATION_ID,
  TOTAL_STEPS,
} from "./data";
import { clearAllJobImages, pruneJobImages, removeJobImages, saveJobImages } from "./images";

// Estado local do Modo Demonstração. Fica só neste navegador (localStorage), nunca vai a servidor
// algum e é totalmente descartável: "Reiniciar" volta ao começo do roteiro.

export type InviteResponse = "accepted" | "declined" | null;

/** Oportunidade criada pela pessoa durante a apresentação. Sem `publishedAt`, é um rascunho. */
export interface CreatedJob {
  id: string;
  title: string;
  description: string;
  additionalInfo: string | null;
  categoryId: string;
  city: string;
  state: string;
  scheduledDate: string;
  startTime: string;
  /** Centavos (maior que zero); `null` = "A negociar", e então `negotiable` é verdadeiro. */
  proposedPriceCents: number | null;
  negotiable: boolean;
  expiresAt: string;
  createdAt: string;
  publishedAt: string | null;
}

/** Proposta de valor de uma conversa do roteiro. As decisões e os pendentes ficam aqui, no estado da demonstração. */
export interface DemoProposal {
  id: string;
  conversationId: string;
  /** Foi a pessoa da demonstração (Lucas) quem propôs. */
  fromMe: boolean;
  amountCents: number;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  /** Vem do roteiro (Roberto propõe numa etapa); some se a demonstração volta antes dela. */
  scripted?: boolean;
}

/** Limite de segurança: cada registro é pequeno, mas o localStorage tem cota. */
const MAX_CREATED_JOBS = 30;

export interface DemoState {
  loggedIn: boolean;
  /** Etapa do roteiro, de 1 a TOTAL_STEPS. */
  step: number;
  /** Resposta da pessoa ao convite (só existe na etapa do convite). */
  response: InviteResponse;
  /**
   * Muda a cada reinício e a cada aceite. Entra no id do interesse da pintura, de modo que a
   * confirmação "Contratação confirmada!" (mostrada uma vez por id) volte a aparecer em cada repetição.
   */
  epoch: number;
  /** Interesses (extras) demonstrados durante a apresentação e interesses retirados. */
  extraInterestJobIds: string[];
  withdrawnInterestIds: string[];
  // --- Segundo roteiro (Lucas contrata Roberto), independente do da pintura ---
  /** Etapa do roteiro da contratação, de 1 a HIRE_TOTAL_STEPS. */
  hireStep: number;
  /** Lucas já enviou o convite a Roberto (pelo botão da conversa ou da lista de interessados). */
  hireInvited: boolean;
  /** Mesmo papel do `epoch`, para este roteiro: a confirmação de contratação volta a aparecer a cada repetição. */
  hireEpoch: number;
  /** Oportunidades criadas na apresentação (a mais recente por último). Somem no "Reiniciar". */
  createdJobs: CreatedJob[];
  /** Propostas de valor das duas conversas do roteiro. */
  proposals: DemoProposal[];
  /** Edição do perfil da própria conta (Lucas); `null` = perfil original do roteiro. Só ele muda: Roberto e Mariana não. */
  profile: UpdateProfileInput | null;
}

const STORAGE_KEY = "freelah:demo:state:v1";

const INITIAL: DemoState = {
  loggedIn: false,
  step: 1,
  response: null,
  epoch: 0,
  extraInterestJobIds: [],
  withdrawnInterestIds: [],
  hireStep: 1,
  hireInvited: false,
  hireEpoch: 0,
  createdJobs: [],
  proposals: [],
  profile: null,
};

/** A proposta que Roberto envia no roteiro, a partir da etapa HIRE_PROPOSAL_STEP. */
function scriptedProposal(hireEpoch: number, others: readonly DemoProposal[]): DemoProposal {
  const afterMessage = HIRE_MESSAGES[HIRE_PROPOSAL_STEP - 2]?.createdAt ?? new Date().toISOString();
  // Se ela só chega depois de outras propostas da conversa, entra depois delas (a ordem da conversa não se inverte).
  const latestOther = others.filter((proposal) => proposal.conversationId === HIRE_CONVERSATION_ID).map((proposal) => proposal.createdAt).sort().at(-1);
  const createdAt = latestOther
    ? new Date(Math.max(Date.parse(latestOther) + 1000, Date.now())).toISOString()
    : new Date(Date.parse(afterMessage) + 30_000).toISOString();
  return {
    id: `demo-proposal-roberto-${hireEpoch}`,
    conversationId: HIRE_CONVERSATION_ID,
    fromMe: false,
    amountCents: HIRE_PROPOSAL_AMOUNT_CENTS,
    status: "PENDING",
    createdAt,
    decidedAt: null,
    scripted: true,
  };
}

/**
 * Garante que a proposta do roteiro existe quando a etapa já passou dela. Ela respeita as regras da
 * negociação: não chega enquanto a conversa já tem uma proposta pendente ou aceita (uma pendente por
 * vez, acordo final) e aparece assim que isso deixa de valer.
 */
function syncScriptedProposal(next: DemoState): DemoState {
  const has = next.proposals.some((proposal) => proposal.scripted);
  const occupied = next.proposals.some(
    (proposal) => proposal.conversationId === HIRE_CONVERSATION_ID && (proposal.status === "PENDING" || proposal.status === "ACCEPTED"),
  );
  if (next.hireStep >= HIRE_PROPOSAL_STEP && !has && !occupied) {
    return { ...next, proposals: [...next.proposals, scriptedProposal(next.hireEpoch, next.proposals)] };
  }
  if (next.hireStep < HIRE_PROPOSAL_STEP && has) return { ...next, proposals: next.proposals.filter((proposal) => !proposal.scripted) };
  return next;
}

/** Aceita só registros completos; no máximo uma pendente e uma aceita por conversa (as regras da API). */
function loadProposals(value: unknown): DemoProposal[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>([HIRE_CONVERSATION_ID, SCRIPT_CONVERSATION_ID]);
  const proposals: DemoProposal[] = [];
  const pending = new Set<string>();
  const accepted = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Partial<DemoProposal>;
    const valid =
      isText(p.id) &&
      p.id !== "" &&
      isText(p.conversationId) &&
      known.has(p.conversationId) &&
      typeof p.fromMe === "boolean" &&
      Number.isInteger(p.amountCents) &&
      (p.amountCents as number) > 0 &&
      (p.amountCents as number) <= JOB_PRICE_MAX_CENTS &&
      (PROPOSAL_STATUSES as readonly unknown[]).includes(p.status) &&
      isInstant(p.createdAt) &&
      (p.decidedAt === null || isInstant(p.decidedAt));
    if (!valid) continue;
    const proposal = p as DemoProposal;
    if (proposal.status === "PENDING") {
      if (pending.has(proposal.conversationId)) continue;
      pending.add(proposal.conversationId);
    }
    if (proposal.status === "ACCEPTED") {
      if (accepted.has(proposal.conversationId)) continue;
      accepted.add(proposal.conversationId);
    }
    proposals.push({ ...proposal, ...(proposal.scripted === true ? { scripted: true } : {}) });
  }
  return proposals.slice(-50);
}

let savedJobIds: string[] = [];
const isText = (value: unknown): value is string => typeof value === "string";
const isDay = (value: unknown): value is string => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isInstant = (value: unknown): value is string => isText(value) && Number.isFinite(Date.parse(value));

/** Aceita só registros completos; qualquer item corrompido é descartado em vez de quebrar a demonstração. */
function loadCreatedJobs(value: unknown): CreatedJob[] {
  if (!Array.isArray(value)) return [];
  // Ids de TODOS os registros salvos, inclusive os descartados abaixo: as fotos deles não são apagadas.
  savedJobIds = value.flatMap((item) => (typeof item === "object" && item !== null && isText((item as { id?: unknown }).id) ? [(item as { id: string }).id] : []));
  const jobs: CreatedJob[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const job = item as Partial<CreatedJob>;
    const valid =
      isText(job.id) &&
      job.id !== "" &&
      isText(job.title) &&
      isText(job.description) &&
      (job.additionalInfo === null || isText(job.additionalInfo)) &&
      CATEGORIES.some((category) => category.id === job.categoryId) &&
      isText(job.city) &&
      isText(job.state) &&
      isDay(job.scheduledDate) &&
      isText(job.startTime) &&
      // Valor zero é um registro antigo recuperável ("Valor a confirmar"): é mantido, com as fotos, até o
      // responsável regularizá-lo. Só o que não tem como existir (negativo, decimal, "sem valor e valor
      // fixo") é descartado.
      ((job.proposedPriceCents === null && job.negotiable === true) ||
        (Number.isInteger(job.proposedPriceCents) && (job.proposedPriceCents as number) >= 0)) &&
      typeof job.negotiable === "boolean" &&
      isInstant(job.expiresAt) &&
      isInstant(job.createdAt) &&
      (job.publishedAt === null || isInstant(job.publishedAt));
    if (valid) jobs.push(job as CreatedJob);
  }
  return jobs.slice(-MAX_CREATED_JOBS);
}

/** Perfil salvo: só vale se passar na mesma validação da edição; estados antigos (sem o campo) ficam no original. */
function loadProfile(value: unknown): UpdateProfileInput | null {
  const parsed = updateProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function load(): DemoState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL };
    const value = JSON.parse(raw) as Partial<DemoState>;
    const step = Number(value.step);
    const hireStep = Number(value.hireStep);
    return syncScriptedProposal({
      loggedIn: value.loggedIn === true,
      step: Number.isInteger(step) && step >= 1 && step <= TOTAL_STEPS ? step : 1,
      response: value.response === "accepted" || value.response === "declined" ? value.response : null,
      epoch: Number.isInteger(value.epoch) ? (value.epoch as number) : 0,
      extraInterestJobIds: Array.isArray(value.extraInterestJobIds) ? value.extraInterestJobIds.filter((v) => typeof v === "string") : [],
      withdrawnInterestIds: Array.isArray(value.withdrawnInterestIds) ? value.withdrawnInterestIds.filter((v) => typeof v === "string") : [],
      // Estados salvos antes deste roteiro existir começam do início dele.
      hireStep: Number.isInteger(hireStep) && hireStep >= 1 && hireStep <= HIRE_TOTAL_STEPS ? hireStep : 1,
      hireInvited: value.hireInvited === true,
      hireEpoch: Number.isInteger(value.hireEpoch) ? (value.hireEpoch as number) : 0,
      createdJobs: loadCreatedJobs(value.createdJobs),
      proposals: loadProposals(value.proposals),
      profile: loadProfile(value.profile),
    });
  } catch {
    return { ...INITIAL };
  }
}

let state: DemoState = load();
// Fotos sem nenhum registro salvo correspondente. As de registros descartados por estarem corrompidos
// ficam: apagar dados da pessoa sem necessidade não é recuperável.
pruneJobImages(savedJobIds);
/** Muda só quando nenhuma tela aberta sabe se atualizar sozinha: aí as telas são remontadas e releem o estado. */
let version = 0;
const listeners = new Set<() => void>();

function commit(next: DemoState, refresh: boolean) {
  const jobsChanged =
    (state.response === "accepted") !== (next.response === "accepted") || isHireAccepted(state) !== isHireAccepted(next);
  state = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento: a demonstração segue em memória
  }
  // Telas com dados na tela se atualizam no lugar (sem piscar). Só se nenhuma o fizer, a tela é remontada.
  if (refresh && !notifyDataChanged(jobsChanged)) version += 1;
  listeners.forEach((listener) => listener());
}

export const getState = (): DemoState => state;
export const getVersion = (): number => version;
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Controles -------------------------------------------------------------

/** Avança uma etapa; no fim do roteiro (ou com o convite já respondido) não faz nada. */
export function advance() {
  if (state.step >= TOTAL_STEPS || state.response !== null) return;
  commit({ ...state, step: state.step + 1 }, true);
}

/** Volta uma etapa; se o convite já foi respondido, desfaz a resposta antes. */
export function back() {
  if (state.response !== null) {
    commit({ ...state, response: null, epoch: state.epoch + 1 }, true);
    return;
  }
  if (state.step <= 1) return;
  commit({ ...state, step: state.step - 1 }, true);
}

/** Guarda a edição do perfil da conta de demonstração. */
export function saveProfile(profile: UpdateProfileInput) {
  commit({ ...state, profile }, false);
}

/** Reinício completo: os dois roteiros, convites, contratações e interesses feitos durante a apresentação. */
export function reset() {
  clearAllJobImages();
  commit({ ...INITIAL, loggedIn: state.loggedIn, epoch: state.epoch + 1, hireEpoch: state.hireEpoch + 1 }, true);
}

// --- Segundo roteiro: Lucas contrata Roberto ---

export const isHireAccepted = (s: DemoState): boolean => s.hireStep >= HIRE_ACCEPT_STEP;

/** O roteiro para antes do aceite até Lucas enviar o convite (pelo botão, como no app real). */
export const isHireWaitingInvite = (s: DemoState): boolean => s.hireStep === HIRE_ACCEPT_STEP - 1 && !s.hireInvited;

export function advanceHire() {
  if (state.hireStep >= HIRE_TOTAL_STEPS || isHireWaitingInvite(state)) return;
  commit(syncScriptedProposal({ ...state, hireStep: state.hireStep + 1 }), true);
}

/** Volta uma etapa; desfaz primeiro o aceite e depois o convite, na ordem inversa em que aconteceram. */
export function backHire() {
  if (isHireAccepted(state)) {
    commit(syncScriptedProposal({ ...state, hireStep: state.hireStep - 1, hireEpoch: state.hireEpoch + 1 }), true);
    return;
  }
  if (state.hireInvited) {
    commit({ ...state, hireInvited: false }, true);
    return;
  }
  if (state.hireStep <= 1) return;
  commit(syncScriptedProposal({ ...state, hireStep: state.hireStep - 1 }), true);
}

/** Convite de Lucas a Roberto. Só vale depois de combinarem o serviço na conversa e uma vez. */
export function inviteHire(): boolean {
  if (state.hireStep !== HIRE_ACCEPT_STEP - 1 || state.hireInvited) return false;
  commit({ ...state, hireInvited: true }, true);
  return true;
}

// --- Sessão e ações do usuário ---

export function setLoggedIn(loggedIn: boolean) {
  commit({ ...state, loggedIn }, false);
}

/** Transições locais do convite. Só valem na etapa do convite e enquanto não foi respondido. */
export function respondToInvite(response: "accepted" | "declined"): boolean {
  if (state.step !== INVITE_STEP || state.response !== null) return false;
  // Remonta as telas para que todos os painéis (lista, detalhe, lateral) releiam o novo estado.
  commit({ ...state, response, epoch: response === "accepted" ? state.epoch + 1 : state.epoch }, true);
  return true;
}

// --- Oportunidades criadas na apresentação ---

export type CreateJobResult = { ok: true; job: CreatedJob } | { ok: false; message: string };

/**
 * Cria a oportunidade (rascunho ou já publicada). Fica no estado da demonstração, e só nele.
 * Com fotos, elas são gravadas primeiro: se não couberem, nada é criado e o motivo volta em `message`.
 */
export function createJob(
  fields: Omit<CreatedJob, "id" | "createdAt" | "publishedAt">,
  publish: boolean,
  images: readonly string[] = [],
): CreateJobResult {
  const now = new Date().toISOString();
  const job: CreatedJob = {
    ...fields,
    id: `demo-job-novo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    publishedAt: publish ? now : null,
  };
  if (images.length > 0) {
    const saved = saveJobImages(job.id, images);
    if (!saved.ok) return { ok: false, message: saved.message };
  }
  const all = [...state.createdJobs, job];
  for (const dropped of all.slice(0, Math.max(0, all.length - MAX_CREATED_JOBS))) removeJobImages(dropped.id);
  commit({ ...state, createdJobs: all.slice(-MAX_CREATED_JOBS) }, false);
  return { ok: true, job };
}

/** Publica um rascunho criado na apresentação. Devolve `null` se ele não existe ou já está publicado. */
export function publishCreatedJob(id: string): CreatedJob | null {
  const current = state.createdJobs.find((job) => job.id === id);
  if (!current || current.publishedAt !== null) return null;
  const published: CreatedJob = { ...current, publishedAt: new Date().toISOString() };
  commit({ ...state, createdJobs: state.createdJobs.map((job) => (job.id === id ? published : job)) }, false);
  return published;
}

// --- Propostas de valor (PRD 18.5) ---

/** Propostas de uma conversa, da mais antiga para a mais nova. */
export function proposalsOf(conversationId: string): DemoProposal[] {
  return state.proposals.filter((proposal) => proposal.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Nova proposta da pessoa da demonstração. A elegibilidade já foi conferida por quem chama. */
export function createProposal(conversationId: string, amountCents: number): DemoProposal {
  const proposal: DemoProposal = {
    id: `demo-proposal-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    conversationId,
    fromMe: true,
    amountCents,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  commit({ ...state, proposals: [...state.proposals, proposal].slice(-50) }, false);
  return proposal;
}

/** Decide uma proposta pendente. Devolve `null` se ela não existe ou já foi decidida (nada muda). */
export function decideProposal(id: string, status: Exclude<ProposalStatus, "PENDING">, refresh = false): DemoProposal | null {
  const current = state.proposals.find((proposal) => proposal.id === id);
  if (!current || current.status !== "PENDING") return null;
  const decided: DemoProposal = { ...current, status, decidedAt: new Date().toISOString() };
  commit(syncScriptedProposal({ ...state, proposals: state.proposals.map((proposal) => (proposal.id === id ? decided : proposal)) }), refresh);
  return decided;
}

/** Controle da demonstração: a outra pessoa responde à proposta pendente da pessoa da demonstração. */
export function simulateCounterpart(conversationId: string, status: "ACCEPTED" | "DECLINED"): boolean {
  const pending = state.proposals.find((proposal) => proposal.conversationId === conversationId && proposal.fromMe && proposal.status === "PENDING");
  return pending ? decideProposal(pending.id, status, true) !== null : false;
}

export const hasPendingOwnProposal = (s: DemoState, conversationId: string): boolean =>
  s.proposals.some((proposal) => proposal.conversationId === conversationId && proposal.fromMe && proposal.status === "PENDING");

export function addExtraInterest(jobId: string) {
  if (state.extraInterestJobIds.includes(jobId)) return;
  commit({ ...state, extraInterestJobIds: [...state.extraInterestJobIds, jobId] }, false);
}

export function withdrawInterest(interestId: string) {
  if (state.withdrawnInterestIds.includes(interestId)) return;
  commit({ ...state, withdrawnInterestIds: [...state.withdrawnInterestIds, interestId] }, false);
}
