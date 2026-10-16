import { jobToFormValues, type OwnJob } from "@freelah/shared";
import { createJobFormStore, type JobFormStore } from "./store";

/**
 * Edição em andamento de uma oportunidade, só em memória (como o formulário de publicação): sobrevive
 * a ir ao login e voltar, mas não a recarregar a página. Guarda a versão da oportunidade que a pessoa
 * abriu (`original`): o salvamento só altera o que mudou em relação a ela e a API recusa se, nesse
 * meio tempo, a oportunidade mudou em outro lugar.
 */
export interface EditSession {
  jobId: string;
  ownerId: string;
  original: OwnJob;
  form: JobFormStore;
}

const sessions = new Map<string, EditSession>();

/** A edição guardada desta oportunidade, se for desta conta. */
export function getEditSession(jobId: string, ownerId: string): EditSession | null {
  const session = sessions.get(jobId);
  return session && session.ownerId === ownerId ? session : null;
}

/** Começa uma edição com os dados atuais da oportunidade (descarta a anterior, se houver). */
export function startEditSession(job: OwnJob, ownerId: string, now: Date = new Date()): EditSession {
  const session: EditSession = {
    jobId: job.id,
    ownerId,
    original: job,
    form: createJobFormStore({
      values: jobToFormValues(job),
      errors: {},
      step: "form",
      // Prazo já vencido (rascunho antigo): a sugestão automática ajuda a corrigi-lo ao mudar a data.
      deadlineTouched: Date.parse(job.expiresAt) > now.getTime(),
      ownerId,
    }),
  };
  sessions.set(job.id, session);
  return session;
}

export function discardEditSession(jobId: string): void {
  sessions.delete(jobId);
}
