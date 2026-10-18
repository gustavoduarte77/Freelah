import { MAX_IMAGE_CHARS } from "@freelah/shared";

// Seleção e compressão de fotos na Web. Cada foto vira um JPEG pequeno (data URL) antes de ser
// guardada: tamanhos e qualidades vão caindo até caber em MAX_IMAGE_CHARS.

/** Do maior para o menor: lado máximo em pixels e qualidade do JPEG. */
const ATTEMPTS: ReadonlyArray<readonly [number, number]> = [
  [960, 0.72],
  [800, 0.65],
  [640, 0.55],
  [480, 0.5],
];

/** A seleção de arquivos só existe na Web (o aplicativo de celular não tem este seletor). */
export const canPickPhotos = (): boolean => typeof document !== "undefined" && typeof FileReader !== "undefined";

/** Abre o seletor de arquivos do navegador. Devolve lista vazia se a pessoa cancelar. */
export function pickImageFiles(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

export class PhotoError extends Error {}

/** Reduz e comprime a foto. Lança `PhotoError` com uma mensagem para a pessoa se não for possível. */
export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new PhotoError(`“${file.name}” não é uma imagem.`);
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    throw new PhotoError(`Não foi possível abrir “${file.name}”. Use uma foto JPG, PNG ou WebP.`);
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoError("Este navegador não consegue preparar a foto.");

  for (const [maxSide, quality] of ATTEMPTS) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#FFFFFF"; // JPEG não tem transparência
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
  }
  throw new PhotoError(`“${file.name}” é detalhada demais para a demonstração. Escolha outra foto.`);
}
