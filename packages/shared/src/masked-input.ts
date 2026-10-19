// ---------------------------------------------------------------------------
// Campos com máscara (data, horário, valor): onde fica o cursor depois de formatar.
//
// Quando o texto é reformatado a cada tecla ("2010" => "20/10"), o navegador manda o cursor para o
// fim. A posição certa é a mesma "quantidade de caracteres que contam" (os dígitos) do lado escolhido:
// à esquerda do cursor para data e horário, à direita para valores em centavos.
// ---------------------------------------------------------------------------

export interface MaskedEdit {
  /** Texto já formatado. */
  text: string;
  /** Posição do cursor no texto formatado. */
  caret: number;
}

export interface ApplyMaskOptions {
  /**
   * De que lado contar os caracteres significativos: "start" (data, horário) ou "end" (valor, em que
   * os dígitos novos entram à direita e empurram os anteriores).
   */
  anchor?: "start" | "end";
  /** Quais caracteres contam (padrão: dígitos). Os demais são separadores. */
  significant?: RegExp;
  /**
   * Texto do campo antes da edição e o tipo de exclusão de UM caractere ("backward" = Backspace,
   * "forward" = Delete). Se só um separador foi apagado (os dígitos continuam os mesmos), a máscara
   * o recolocaria e o cursor ficaria preso; então a exclusão vale para o dígito vizinho.
   */
  previous?: string;
  deleting?: "backward" | "forward";
}

/**
 * Formata `raw` com `mask` e calcula onde o cursor deve ficar, preservando a quantidade de
 * caracteres significativos entre o cursor e a borda escolhida. `rawCaret` é a posição do cursor em
 * `raw`, depois da edição (inserir, apagar, substituir seleção ou colar).
 */
export function applyMask(
  raw: string,
  rawCaret: number,
  mask: (raw: string) => string,
  options: ApplyMaskOptions = {},
): MaskedEdit {
  const { anchor = "start", significant = /\d/, previous, deleting } = options;
  const counts = (char: string) => significant.test(char);
  const onlySignificant = (value: string) => [...value].filter(counts).join("");
  let source = raw;
  let caretInRaw = Math.min(Math.max(Math.trunc(rawCaret) || 0, 0), raw.length);

  if (
    deleting &&
    previous !== undefined &&
    raw.length === previous.length - 1 &&
    onlySignificant(raw) === onlySignificant(previous)
  ) {
    if (deleting === "backward") {
      let index = caretInRaw - 1;
      while (index >= 0 && !counts(raw[index]!)) index -= 1;
      if (index >= 0) {
        source = raw.slice(0, index) + raw.slice(index + 1);
        caretInRaw = index;
      }
    } else {
      let index = caretInRaw;
      while (index < raw.length && !counts(raw[index]!)) index += 1;
      if (index < raw.length) source = raw.slice(0, index) + raw.slice(index + 1);
    }
  }

  const text = mask(source);
  raw = source;

  if (anchor === "end") {
    // Quantos caracteres significativos ficam à direita do cursor, e a mesma contagem no texto formatado.
    let toTheRight = 0;
    for (const char of raw.slice(caretInRaw)) if (counts(char)) toTheRight += 1;
    let position = text.length;
    while (toTheRight > 0 && position > 0) {
      position -= 1;
      if (counts(text[position]!)) toTheRight -= 1;
    }
    return { text, caret: toTheRight > 0 ? 0 : position };
  }

  let toTheLeft = 0;
  for (const char of raw.slice(0, caretInRaw)) if (counts(char)) toTheLeft += 1;
  if (toTheLeft === 0) return { text, caret: 0 };
  let position = 0;
  let seen = 0;
  while (position < text.length && seen < toTheLeft) {
    if (counts(text[position]!)) seen += 1;
    position += 1;
  }
  // Sem mais dígitos à direita, o cursor vai para o fim (depois de um separador final, como em "20/").
  const restHasDigits = [...text.slice(position)].some(counts);
  if (seen < toTheLeft || !restHasDigits) return { text, caret: text.length };
  // Se o cursor estava logo depois de um separador, continua depois dele ("08:|30").
  if (caretInRaw > 0 && !counts(raw[caretInRaw - 1]!)) {
    while (position < text.length && !counts(text[position]!)) position += 1;
  }
  return { text, caret: position };
}
