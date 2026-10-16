import type { CreateJobRequest, MyJobsApi } from "./my-jobs-api";
import { MyJobsApiError } from "./my-jobs-api";
import type { OwnJob } from "./jobs-write";

// Envio de uma nova oportunidade (rascunho ou publicação), sem React.
//
// Regras de segurança do envio:
// - Nunca há reenvio automático. Só uma ação explícita da pessoa envia de novo.
// - Se a API respondeu e recusou, nada foi salvo: a pessoa corrige e tenta de novo.
// - Se a conexão ou a resposta falhou, o servidor PODE ter salvo. O app não declara sucesso nem
//   falha: pede que a pessoa confira "Minhas oportunidades" antes de qualquer novo envio, e o novo
//   envio só acontece com confirmação explícita (`confirmRetry`).
// - Enquanto envia, e depois de um sucesso, novos envios são ignorados (sem duplicar por clique
//   duplo). Para publicar outra oportunidade é preciso `reset()`.

export type SubmissionMode = "draft" | "publish";

export type SubmissionState =
  | { status: "idle" }
  | { status: "submitting"; mode: SubmissionMode }
  | { status: "succeeded"; mode: SubmissionMode; job: OwnJob }
  /** A API recusou: com certeza nada foi salvo. */
  | { status: "failed"; mode: SubmissionMode; error: MyJobsApiError }
  /** Falha de conexão ou resposta ilegível: não sabemos se foi salvo. */
  | { status: "unconfirmed"; mode: SubmissionMode; error: MyJobsApiError };

export const UNCONFIRMED_MESSAGE =
  "Não conseguimos confirmar se a oportunidade foi salva. Antes de tentar de novo, confira em Minhas oportunidades para não criar uma duplicada.";

export const RETRY_WARNING =
  "Se a oportunidade já estiver em Minhas oportunidades, enviar de novo vai criar outra igual. Só continue se você conferiu e ela não está lá.";

/** Mensagem para a pessoa, de acordo com o que realmente sabemos sobre o envio. */
export function describeSubmissionError(error: MyJobsApiError, mode: SubmissionMode): string {
  if (error.outcomeUnknown) return UNCONFIRMED_MESSAGE;
  switch (error.kind) {
    case "unauthorized":
      return "Sua sessão terminou. Entre de novo; o que você preencheu foi mantido.";
    case "validation":
      return "Confira os campos destacados e tente de novo.";
    case "invalid_state":
    case "conflict":
    case "not_found":
      return error.message;
    default:
      return mode === "publish"
        ? "Não foi possível publicar a oportunidade. Nada foi salvo; confira os dados e tente de novo."
        : "Não foi possível salvar o rascunho. Nada foi salvo; confira os dados e tente de novo.";
  }
}

export interface SubmissionController {
  getState(): SubmissionState;
  subscribe(listener: () => void): () => void;
  /**
   * Envia. Ignorado (devolve o estado atual) se já está enviando, se já deu certo, ou se há um
   * resultado desconhecido pendente e `confirmRetry` não é `true`.
   */
  submit(
    request: CreateJobRequest,
    mode: SubmissionMode,
    options?: { confirmRetry?: boolean },
  ): Promise<SubmissionState>;
  /** Volta ao início para uma nova oportunidade. Não faz nada enquanto envia. */
  reset(): void;
}

export function createSubmissionController(deps: { api: Pick<MyJobsApi, "create"> }): SubmissionController {
  let state: SubmissionState = { status: "idle" };
  const listeners = new Set<() => void>();

  function set(next: SubmissionState) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async submit(request, mode, options) {
      if (state.status === "submitting" || state.status === "succeeded") return state;
      if (state.status === "unconfirmed" && options?.confirmRetry !== true) return state;

      set({ status: "submitting", mode });
      try {
        const job = await deps.api.create(request, { publish: mode === "publish" });
        set({ status: "succeeded", mode, job });
      } catch (caught) {
        const error =
          caught instanceof MyJobsApiError
            ? caught
            : // Erro inesperado: não dá para afirmar que nada foi salvo.
              new MyJobsApiError("network", { cause: caught, mutating: true });
        set(error.outcomeUnknown ? { status: "unconfirmed", mode, error } : { status: "failed", mode, error });
      }
      return state;
    },

    reset() {
      if (state.status === "submitting") return;
      set({ status: "idle" });
    },
  };
}

// ---------------------------------------------------------------------------
// Publicar um rascunho que já existe (Minhas oportunidades)
// ---------------------------------------------------------------------------

export const PUBLISH_DRAFT_UNCONFIRMED_MESSAGE =
  "Não conseguimos confirmar se a oportunidade foi publicada. Confira o estado atual antes de tentar de novo.";

export interface PublishDraftFailure {
  /** Texto para a pessoa. */
  message: string;
  /** A lista pode estar desatualizada: o melhor próximo passo é conferir o estado atual. */
  checkNow: boolean;
  /** É preciso entrar de novo. */
  needsSignIn: boolean;
}

/**
 * O que dizer quando publicar um rascunho falha. Publicar duas vezes nunca duplica nada (a segunda
 * recebe "já foi publicada"), mas ainda assim não declaramos sucesso nem falha sem a resposta da
 * API: quando o resultado é desconhecido, a pessoa confere o estado atual em vez de supor.
 */
export function describePublishDraftError(error: MyJobsApiError): PublishDraftFailure {
  if (error.outcomeUnknown) {
    return { message: PUBLISH_DRAFT_UNCONFIRMED_MESSAGE, checkNow: true, needsSignIn: false };
  }
  switch (error.kind) {
    case "unauthorized":
      return { message: "Sua sessão terminou. Entre de novo para publicar.", checkNow: false, needsSignIn: true };
    case "validation": {
      const details = Object.values(error.fields).join(" ");
      return {
        message: `Este rascunho não pode ser publicado agora. ${details}`.trim(),
        checkNow: false,
        needsSignIn: false,
      };
    }
    case "invalid_state":
    case "conflict":
      return { message: error.message, checkNow: true, needsSignIn: false };
    case "not_found":
      return { message: "Não encontramos mais este rascunho.", checkNow: true, needsSignIn: false };
    default:
      return { message: "Não foi possível publicar. Nada foi alterado.", checkNow: false, needsSignIn: false };
  }
}

// ---------------------------------------------------------------------------
// Conferir uma oportunidade específica (leitura de `GET /me/jobs/:id`)
// ---------------------------------------------------------------------------

/** O que a leitura de uma oportunidade confirmou. Só a API decide: nada aqui é suposição. */
export type CheckedJobOutcome = "published" | "still_draft" | "other";

/**
 * Interpreta o registro devolvido pela API ao conferir um rascunho: publicada (ou em negociação),
 * ainda rascunho, ou outro estado (cancelada, expirada, contratada...).
 */
export function interpretCheckedJob(job: Pick<OwnJob, "status">): CheckedJobOutcome {
  if (job.status === "PUBLISHED" || job.status === "NEGOTIATING") return "published";
  if (job.status === "DRAFT") return "still_draft";
  return "other";
}

export const STILL_DRAFT_MESSAGE =
  "Conferido: a oportunidade continua como rascunho e não foi publicada. Se quiser, tente publicar de novo.";

export interface CheckDraftFailure {
  message: string;
  /** Vale tentar conferir de novo (falha de conexão ou do servidor). */
  retryCheck: boolean;
  /** É preciso entrar de novo. */
  needsSignIn: boolean;
}

/**
 * O que dizer quando a conferência falha. Uma leitura que falha não revela o estado da
 * oportunidade: nunca é tratada como "publicada" nem como "continua rascunho".
 */
export function describeCheckDraftError(error: MyJobsApiError): CheckDraftFailure {
  switch (error.kind) {
    case "unauthorized":
      return { message: "Sua sessão terminou. Entre de novo para conferir.", retryCheck: false, needsSignIn: true };
    case "not_found":
      return {
        message: "Não encontramos mais esta oportunidade. Use “Atualizar” para ver a lista atual.",
        retryCheck: false,
        needsSignIn: false,
      };
    case "network":
    case "server":
    case "invalid_response":
      return {
        message: "Não foi possível conferir agora, então o estado da oportunidade continua desconhecido. Tente conferir de novo.",
        retryCheck: true,
        needsSignIn: false,
      };
    default:
      return {
        message: "Não foi possível conferir agora. O estado da oportunidade continua desconhecido.",
        retryCheck: true,
        needsSignIn: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Cancelar uma oportunidade (Minhas oportunidades)
// ---------------------------------------------------------------------------

export const CANCEL_JOB_UNCONFIRMED_MESSAGE =
  "Não conseguimos confirmar se a oportunidade foi cancelada. Confira o estado atual antes de tentar de novo.";

export const STILL_OPEN_MESSAGE = "Conferimos: a oportunidade continua ativa. Nada foi cancelado.";

export interface CancelJobFailure {
  /** Texto para a pessoa. */
  message: string;
  /** A lista pode estar desatualizada ou o resultado é desconhecido: conferir o estado atual. */
  checkNow: boolean;
  /** É preciso entrar de novo. */
  needsSignIn: boolean;
}

/**
 * O que dizer quando cancelar falha. Só a resposta da API diz se cancelou: sem resposta confiável
 * o cancelamento nunca é dado como feito, e a pessoa confere o estado atual (GET da oportunidade).
 */
export function describeCancelJobError(error: MyJobsApiError): CancelJobFailure {
  if (error.outcomeUnknown) {
    return { message: CANCEL_JOB_UNCONFIRMED_MESSAGE, checkNow: true, needsSignIn: false };
  }
  switch (error.kind) {
    case "unauthorized":
      return { message: "Sua sessão terminou. Entre de novo para cancelar.", checkNow: false, needsSignIn: true };
    case "invalid_state":
    case "conflict":
      return { message: error.message, checkNow: true, needsSignIn: false };
    case "not_found":
      return { message: "Não encontramos mais esta oportunidade.", checkNow: true, needsSignIn: false };
    default:
      return { message: "Não foi possível cancelar. Nada foi alterado.", checkNow: false, needsSignIn: false };
  }
}

/** O que a leitura de uma oportunidade confirmou depois de uma tentativa de cancelar. */
export type CheckedCancelOutcome = "cancelled" | "still_open" | "other";

/** Cancelada; ainda ativa (rascunho, publicada ou em negociação); ou outro estado (expirada, contratada...). */
export function interpretCheckedCancel(job: Pick<OwnJob, "status">): CheckedCancelOutcome {
  if (job.status === "CANCELLED") return "cancelled";
  if (job.status === "DRAFT" || job.status === "PUBLISHED" || job.status === "NEGOTIATING") return "still_open";
  return "other";
}

// ---------------------------------------------------------------------------
// Editar uma oportunidade
// ---------------------------------------------------------------------------

export const UPDATE_JOB_UNCONFIRMED_MESSAGE =
  "Não conseguimos confirmar se as alterações foram salvas. Confira o estado atual antes de tentar de novo.";

export const EDIT_NO_CHANGES_MESSAGE = "Você não alterou nada ainda.";

export interface UpdateJobFailure {
  /** Texto para a pessoa. */
  message: string;
  /** Mensagens por campo da API (só em recusa por validação); nada foi salvo. */
  fields: Record<string, string>;
  /** O resultado é desconhecido ou o estado mudou: o melhor próximo passo é conferir o estado atual. */
  checkNow: boolean;
  /** Alterada em outro lugar: a versão aberta ficou velha e só dá para continuar com a atual. */
  stale: boolean;
  /** É preciso entrar de novo (o que foi digitado continua guardado). */
  needsSignIn: boolean;
}

/**
 * O que dizer quando salvar uma edição falha. Só a resposta da API diz que salvou: sem resposta
 * confiável a alteração nunca é dada como salva, e nada é reenviado sozinho.
 */
export function describeUpdateJobError(error: MyJobsApiError): UpdateJobFailure {
  const base = { fields: {}, checkNow: false, stale: false, needsSignIn: false };
  if (error.outcomeUnknown) return { ...base, message: UPDATE_JOB_UNCONFIRMED_MESSAGE, checkNow: true };
  switch (error.kind) {
    case "unauthorized":
      return { ...base, message: "Sua sessão terminou. Entre de novo para salvar. O que você digitou foi mantido.", needsSignIn: true };
    case "validation":
      return { ...base, message: "Alguns campos não foram aceitos. Nada foi salvo.", fields: error.fields };
    case "conflict":
      return {
        ...base,
        message: "Esta oportunidade foi alterada em outro lugar. Suas alterações não foram salvas.",
        stale: true,
      };
    case "invalid_state":
      return { ...base, message: error.message, checkNow: true };
    case "not_found":
      return { ...base, message: "Não encontramos mais esta oportunidade." };
    default:
      return { ...base, message: "Não foi possível salvar. Nada foi alterado." };
  }
}

/** O que a leitura confirmou depois de um salvamento sem resposta confiável. */
export type CheckedEditOutcome = "unchanged" | "changed" | "locked";

/**
 * Compara só a versão: se continua a que a pessoa abriu, o servidor não aplicou nada; se mudou, não
 * dá para saber (sem adivinhar) se foi este salvamento ou outra tela; se não pode mais ser editada, ela travou.
 */
export function interpretCheckedEdit(
  openedUpdatedAt: string,
  current: Pick<OwnJob, "updatedAt" | "canEdit">,
): CheckedEditOutcome {
  if (!current.canEdit) return "locked";
  return current.updatedAt === openedUpdatedAt ? "unchanged" : "changed";
}
