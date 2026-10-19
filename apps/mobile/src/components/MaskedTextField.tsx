import { applyMask } from "@freelah/shared";
import { useEffect, useRef, useState } from "react";
import { Platform, type NativeSyntheticEvent, type TextInputSelectionChangeEventData } from "react-native";
import { TextField, type TextFieldProps } from "./ui";

interface Selection {
  start: number;
  end: number;
}

/**
 * Campo com máscara (data, horário, valor) que não deixa o cursor saltar para o fim.
 *
 * A cada edição o texto é reformatado por `mask`; sem cuidado, o campo controlado recebe o texto novo
 * e o cursor vai para o fim. Aqui o cursor é recolocado depois da formatação, no mesmo ponto lógico
 * (mesma quantidade de dígitos antes dele, ou depois dele com `anchor="end"`, para valores).
 *
 * - Web: lê o cursor do próprio <input> no evento de mudança e o restaura depois de o React aplicar
 *   o valor (inclusive quando a máscara devolve o mesmo texto, caso em que o React desfaz a digitação).
 * - Celular: usa a propriedade `selection` do TextInput, solta logo depois para não prender o cursor.
 */
export function MaskedTextField({
  value,
  onChangeValue,
  mask,
  anchor = "start",
  ...rest
}: Omit<TextFieldProps, "value" | "onChangeText" | "onChange" | "selection"> & {
  value: string;
  /** Recebe sempre o texto já formatado. */
  onChangeValue: (masked: string) => void;
  mask: (raw: string) => string;
  /** De que lado contar os dígitos para posicionar o cursor ("end" para valores em centavos). */
  anchor?: "start" | "end";
}) {
  const isWeb = Platform.OS === "web";
  const selection = useRef<Selection>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // --- Web -------------------------------------------------------------------
  function onChangeWeb(event: NativeSyntheticEvent<unknown>) {
    const holder = event as unknown as { target?: unknown; nativeEvent?: { target?: unknown; inputType?: string } };
    const element = (holder.target ?? holder.nativeEvent?.target) as HTMLInputElement | undefined;
    if (!element || typeof element.value !== "string") return;
    const raw = element.value;
    const inputType = holder.nativeEvent?.inputType;
    const deleting =
      inputType === "deleteContentBackward" ? "backward" : inputType === "deleteContentForward" ? "forward" : undefined;
    const edit = applyMask(raw, element.selectionStart ?? raw.length, mask, {
      anchor,
      previous: value,
      ...(deleting ? { deleting } : {}),
    });
    onChangeValue(edit.text);
    // Depois de o React aplicar o valor (microtarefa) e, por garantia, no próximo quadro.
    const restore = () => {
      if (document.activeElement === element && element.value === edit.text) {
        element.setSelectionRange(edit.caret, edit.caret);
      }
    };
    queueMicrotask(restore);
    requestAnimationFrame(restore);
  }

  // --- Celular ---------------------------------------------------------------
  function onChangeNative(text: string) {
    const { start, end } = selection.current;
    // Onde o cursor ficou depois da edição: início da seleção + o que entrou (negativo ao apagar).
    const inserted = text.length - (value.length - (end - start));
    const rawCaret = Math.min(Math.max(start + inserted, 0), text.length);
    // Sem seleção e com um caractere a menos: foi um Backspace (o celular não informa o tipo da edição).
    const deleting = start === end && text.length === value.length - 1 ? "backward" : undefined;
    const edit = applyMask(text, rawCaret, mask, { anchor, previous: value, ...(deleting ? { deleting } : {}) });
    onChangeValue(edit.text);
    const next = { start: edit.caret, end: edit.caret };
    selection.current = next;
    setForced(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setForced(undefined), 120);
  }

  function onSelectionChange(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    selection.current = event.nativeEvent.selection;
  }

  return (
    <TextField
      {...rest}
      value={value}
      {...(isWeb
        ? { onChange: onChangeWeb }
        : { onChangeText: onChangeNative, onSelectionChange, ...(forced ? { selection: forced } : {}) })}
    />
  );
}
