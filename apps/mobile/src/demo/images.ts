// Fotos das oportunidades criadas no Modo Demonstração. Ficam no localStorage, uma chave por
// oportunidade (separadas do estado principal, para uma foto grande nunca impedir a gravação dele),
// e só entram se couberem num orçamento total. Se não couberem, `saveJobImages` diz que não salvou
// e quem chamou NÃO cria a oportunidade: nunca se informa sucesso sem as fotos terem sido gravadas.

const PREFIX = "freelah:demo:images:";

/**
 * Teto de todas as fotos juntas, em caracteres. O localStorage costuma dar cerca de 5 milhões de
 * caracteres por origem; metade fica para o estado da demonstração e margem de segurança.
 */
export const IMAGE_BUDGET_CHARS = 2_500_000;

export type SaveImagesResult = { ok: true } | { ok: false; message: string };

const NO_STORAGE =
  "Este navegador não permite guardar as fotos (o armazenamento local está indisponível). Publique sem fotos ou use outro navegador.";
const NO_ROOM =
  "Não há espaço para guardar estas fotos. Remova algumas fotos e tente novamente.";

const cache = new Map<string, string[]>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function keysOf(store: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

function usedChars(store: Storage): number {
  return keysOf(store).reduce((sum, key) => sum + (store.getItem(key)?.length ?? 0), 0);
}

/** Grava as fotos da oportunidade. Só devolve `ok` se elas realmente foram gravadas. */
export function saveJobImages(jobId: string, images: readonly string[]): SaveImagesResult {
  const store = storage();
  if (!store) return { ok: false, message: NO_STORAGE };
  const key = PREFIX + jobId;
  const payload = JSON.stringify(images);
  try {
    if (usedChars(store) + payload.length > IMAGE_BUDGET_CHARS) return { ok: false, message: NO_ROOM };
    store.setItem(key, payload);
    // Confere a gravação (alguns navegadores falham sem lançar erro).
    if (store.getItem(key) !== payload) {
      store.removeItem(key);
      return { ok: false, message: NO_ROOM };
    }
  } catch {
    try {
      store.removeItem(key);
    } catch {
      // nada a fazer
    }
    return { ok: false, message: NO_ROOM };
  }
  cache.set(jobId, [...images]);
  return { ok: true };
}

/** Fotos da oportunidade (a capa primeiro); vazio se não houver ou não puderem ser lidas. */
export function getJobImages(jobId: string): string[] {
  const cached = cache.get(jobId);
  if (cached) return cached;
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(PREFIX + jobId);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    const images = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    cache.set(jobId, images);
    return images;
  } catch {
    return [];
  }
}

export function removeJobImages(jobId: string) {
  cache.delete(jobId);
  try {
    storage()?.removeItem(PREFIX + jobId);
  } catch {
    // sem armazenamento: nada a remover
  }
}

/** Apaga as fotos que não pertencem a nenhuma das oportunidades `keep` (sobras de um estado descartado). */
export function pruneJobImages(keep: readonly string[]) {
  const store = storage();
  if (!store) return;
  try {
    for (const key of keysOf(store)) {
      if (!keep.includes(key.slice(PREFIX.length))) store.removeItem(key);
    }
  } catch {
    // sem armazenamento: nada a remover
  }
}

/** Apaga as fotos de todas as oportunidades (Reiniciar). */
export function clearAllJobImages() {
  cache.clear();
  const store = storage();
  if (!store) return;
  try {
    for (const key of keysOf(store)) store.removeItem(key);
  } catch {
    // sem armazenamento: nada a remover
  }
}
