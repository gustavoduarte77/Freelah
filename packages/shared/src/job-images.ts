// ---------------------------------------------------------------------------
// Fotos da oportunidade (por enquanto só no Modo Demonstração). Cada foto é um JPEG já reduzido,
// como data URL, para caber no armazenamento do navegador. A primeira da lista é a capa.
// ---------------------------------------------------------------------------

export const MAX_JOB_IMAGES = 5;
/** Tamanho máximo de cada foto, em caracteres do data URL (cerca de 150 KB de imagem). */
export const MAX_IMAGE_CHARS = 200_000;

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export type JobImagesResult = { ok: true; images: string[] } | { ok: false; message: string };

/** Confere quantidade, formato e tamanho. Não altera a ordem (a capa é a primeira). */
export function validateJobImages(value: unknown): JobImagesResult {
  if (!Array.isArray(value)) return { ok: false, message: "As fotos precisam ser uma lista." };
  if (value.length > MAX_JOB_IMAGES) {
    return { ok: false, message: `Use no máximo ${MAX_JOB_IMAGES} fotos.` };
  }
  for (const item of value) {
    if (typeof item !== "string" || !JPEG_DATA_URL.test(item)) {
      return { ok: false, message: "Uma das fotos não está em um formato aceito." };
    }
    if (item.length > MAX_IMAGE_CHARS) return { ok: false, message: "Uma das fotos é grande demais." };
  }
  return { ok: true, images: value as string[] };
}

/** Move a foto `index` para o começo (ela vira a capa); as demais mantêm a ordem. */
export function makeCover(images: readonly string[], index: number): string[] {
  if (index <= 0 || index >= images.length) return [...images];
  return [images[index]!, ...images.slice(0, index), ...images.slice(index + 1)];
}
