import { MAX_JOB_IMAGES, makeCover } from "@freelah/shared";
import { useSyncExternalStore } from "react";
import { PhotoError, compressPhoto } from "./photoFiles";

// Fotos do formulário de publicação, só em memória (como o resto do formulário). A primeira é a
// capa; "Tornar capa" a move para o começo. No Modo Demonstração, o servidor simulado as lê daqui
// ao criar a oportunidade.

export interface PublishPhotosState {
  images: string[];
  /** Comprimindo fotos escolhidas. */
  busy: boolean;
  /** Aviso para a pessoa (fotos que não entraram). */
  message: string | null;
}

const EMPTY: PublishPhotosState = { images: [], busy: false, message: null };
let state: PublishPhotosState = EMPTY;
const listeners = new Set<() => void>();

function set(next: PublishPhotosState) {
  state = next;
  for (const listener of [...listeners]) listener();
}

export const publishPhotos = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Comprime e acrescenta as fotos até o limite; as que não entram viram um aviso. */
  async add(files: readonly File[]) {
    if (state.busy || files.length === 0) return;
    const room = MAX_JOB_IMAGES - state.images.length;
    const accepted = files.slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (files.length > accepted.length) {
      problems.push(`Só cabem ${MAX_JOB_IMAGES} fotos: ${files.length - accepted.length} não ${files.length - accepted.length === 1 ? "foi adicionada" : "foram adicionadas"}.`);
    }
    set({ ...state, busy: true, message: null });
    const added: string[] = [];
    for (const file of accepted) {
      try {
        added.push(await compressPhoto(file));
      } catch (error) {
        problems.push(error instanceof PhotoError ? error.message : `Não foi possível preparar “${file.name}”.`);
      }
    }
    set({ images: [...state.images, ...added].slice(0, MAX_JOB_IMAGES), busy: false, message: problems.length > 0 ? problems.join(" ") : null });
  },

  remove(index: number) {
    set({ ...state, images: state.images.filter((_, i) => i !== index), message: null });
  },

  /** A foto escolhida passa a ser a capa. */
  setCover(index: number) {
    set({ ...state, images: makeCover(state.images, index), message: null });
  },

  /** Substitui a lista (o servidor simulado e os testes usam; a tela usa `add`). */
  replace(images: string[]) {
    set({ ...state, images });
  },

  clear() {
    set(EMPTY);
  },
};

export function usePublishPhotos(): PublishPhotosState {
  return useSyncExternalStore(publishPhotos.subscribe, publishPhotos.getState, publishPhotos.getState);
}
