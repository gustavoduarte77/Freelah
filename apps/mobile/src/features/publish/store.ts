import {
  emptyJobForm,
  suggestDeadlineDate,
  maskDateInput,
  maskPriceInput,
  maskStateInput,
  maskTimeInput,
  type JobFormErrors,
  type JobFormField,
  type JobFormValues,
} from "@freelah/shared";
import { useSyncExternalStore } from "react";
import { submission } from "./api";

// Formulário em andamento, só em memória: sobrevive à navegação (login, "Minhas oportunidades",
// voltar da revisão) mas não a recarregar a página. O formulário de publicação é único no app, como
// o envio; cada edição de uma oportunidade tem o seu (veja `editSessions.ts`).

export interface PublishDraftState {
  values: JobFormValues;
  errors: JobFormErrors;
  step: "form" | "review";
  /** A pessoa já mexeu no prazo: a sugestão automática não o sobrescreve mais. */
  deadlineTouched: boolean;
  /** Quem começou este formulário; se outra conta entrar, ele é descartado. */
  ownerId: string | null;
}

export function initialFormState(city = "", ownerId: string | null = null): PublishDraftState {
  return { values: emptyJobForm({ city }), errors: {}, step: "form", deadlineTouched: false, ownerId };
}

/** Armazenamento observável de um formulário de oportunidade (publicação ou edição). */
export function createJobFormStore(first: PublishDraftState) {
  let state = first;
  const listeners = new Set<() => void>();

  function set(next: PublishDraftState) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Troca o estado inteiro (começar outro formulário). */
    replace: set,

    /** Altera um campo, com a máscara certa, limpando o erro dele. */
    setField<K extends keyof JobFormValues>(field: K, raw: JobFormValues[K]) {
      let value = raw;
      if (field === "scheduledDate" || field === "deadlineDate") value = maskDateInput(String(raw)) as JobFormValues[K];
      else if (field === "startTime") value = maskTimeInput(String(raw)) as JobFormValues[K];
      else if (field === "state") value = maskStateInput(String(raw)) as JobFormValues[K];
      else if (field === "price") value = maskPriceInput(String(raw)) as JobFormValues[K];

      const values = { ...state.values, [field]: value };
      let deadlineTouched = state.deadlineTouched;
      if (field === "deadlineDate") deadlineTouched = true;
      // Enquanto a pessoa não escolheu o prazo, ele acompanha a data do serviço (dia anterior).
      if (field === "scheduledDate" && !deadlineTouched) {
        values.deadlineDate = suggestDeadlineDate(String(value), new Date());
      }
      // Ligar "A negociar" limpa o valor digitado; ao desligar, o valor volta vazio e precisa ser informado de novo.
      if (field === "toNegotiate" && value === true) values.price = "";
      const errors = { ...state.errors };
      if (field !== "negotiable" && field !== "toNegotiate") delete errors[field as JobFormField];
      if (field === "toNegotiate") delete errors.price;
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
}

export type JobFormStore = ReturnType<typeof createJobFormStore>;

/** Lê (e acompanha) o estado de um formulário. */
export function useJobForm(store: JobFormStore): PublishDraftState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

const draftStore = createJobFormStore(initialFormState());

export const publishDraft = {
  ...draftStore,

  /** Começa um formulário novo (cidade da conta) e associa à pessoa. */
  reset(city: string, ownerId: string) {
    draftStore.replace(initialFormState(city, ownerId));
  },

  /** Garante que o formulário em memória é desta conta; senão, começa outro. */
  claim(city: string, ownerId: string) {
    if (draftStore.getState().ownerId !== ownerId) draftStore.replace(initialFormState(city, ownerId));
  },
};

export function usePublishDraft(): PublishDraftState {
  return useJobForm(draftStore);
}

export function useSubmissionState() {
  return useSyncExternalStore(submission.subscribe, submission.getState, submission.getState);
}
