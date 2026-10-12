import {
  emptyJobForm,
  suggestDeadlineDate,
  maskDateInput,
  maskStateInput,
  maskTimeInput,
  type JobFormErrors,
  type JobFormField,
  type JobFormValues,
} from "@freelah/shared";
import { useSyncExternalStore } from "react";
import { submission } from "./api";

// Formulário em andamento, só em memória: sobrevive à navegação (login, "Minhas oportunidades",
// voltar da revisão) mas não a recarregar a página. É único no app, como o envio.

export interface PublishDraftState {
  values: JobFormValues;
  errors: JobFormErrors;
  step: "form" | "review";
  /** A pessoa já mexeu no prazo: a sugestão automática não o sobrescreve mais. */
  deadlineTouched: boolean;
  /** Quem começou este formulário; se outra conta entrar, ele é descartado. */
  ownerId: string | null;
}

function initial(city = "", ownerId: string | null = null): PublishDraftState {
  return { values: emptyJobForm({ city }), errors: {}, step: "form", deadlineTouched: false, ownerId };
}

let state: PublishDraftState = initial();
const listeners = new Set<() => void>();

function set(next: PublishDraftState) {
  state = next;
  for (const listener of [...listeners]) listener();
}

export const publishDraft = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Começa um formulário novo (cidade da conta) e associa à pessoa. */
  reset(city: string, ownerId: string) {
    set(initial(city, ownerId));
  },

  /** Garante que o formulário em memória é desta conta; senão, começa outro. */
  claim(city: string, ownerId: string) {
    if (state.ownerId !== ownerId) set(initial(city, ownerId));
  },

  /** Altera um campo, com a máscara certa, limpando o erro dele. */
  setField<K extends keyof JobFormValues>(field: K, raw: JobFormValues[K]) {
    let value = raw;
    if (field === "scheduledDate" || field === "deadlineDate") value = maskDateInput(String(raw)) as JobFormValues[K];
    else if (field === "startTime") value = maskTimeInput(String(raw)) as JobFormValues[K];
    else if (field === "state") value = maskStateInput(String(raw)) as JobFormValues[K];

    const values = { ...state.values, [field]: value };
    let deadlineTouched = state.deadlineTouched;
    if (field === "deadlineDate") deadlineTouched = true;
    // Enquanto a pessoa não escolheu o prazo, ele acompanha a data do serviço (dia anterior).
    if (field === "scheduledDate" && !deadlineTouched) {
      values.deadlineDate = suggestDeadlineDate(String(value), new Date());
    }
    const errors = { ...state.errors };
    if (field !== "negotiable") delete errors[field as JobFormField];
    if (field === "scheduledDate" || field === "startTime") delete errors.deadlineDate;
    delete errors._;
    set({ ...state, values, errors, deadlineTouched });
  },

  setErrors(errors: JobFormErrors) {
    set({ ...state, errors });
  },

  setStep(step: "form" | "review") {
    set({ ...state, step });
  },
};

export function usePublishDraft(): PublishDraftState {
  return useSyncExternalStore(publishDraft.subscribe, publishDraft.getState, publishDraft.getState);
}

export function useSubmissionState() {
  return useSyncExternalStore(submission.subscribe, submission.getState, submission.getState);
}
