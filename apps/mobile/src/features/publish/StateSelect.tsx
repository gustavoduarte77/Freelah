import { useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Icon } from "../../components/Icon";
import { colors, focusRing, noInnerOutline, radius, shadow } from "../../theme";

/** As 27 unidades federativas (26 estados e o Distrito Federal). */
export const BRAZILIAN_STATES: ReadonlyArray<{ uf: string; name: string }> = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

export const isValidUf = (value: string) => BRAZILIAN_STATES.some((state) => state.uf === value);

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Siglas que começam com o texto digitado (ou estados cujo nome começa com ele). */
export function filterStates(query: string) {
  const q = plain(query.trim());
  if (!q) return BRAZILIAN_STATES;
  return BRAZILIAN_STATES.filter((state) => plain(state.uf).startsWith(q) || plain(state.name).startsWith(q));
}

const LIST_WIDTH = 240;
const ROW = 36;

/**
 * Campo de estado: digita-se a sigla e uma lista pesquisável mostra as opções.
 * - Mouse: clicar numa opção a escolhe e avança para o próximo campo (`onAdvance`).
 * - Teclado: setas movem a seleção; Enter confirma a opção destacada sem avançar; com uma sigla
 *   válida já confirmada, Enter avança; Esc fecha a lista.
 * O valor guardado continua sendo só a sigla de duas letras, como a API espera.
 */
export function StateSelect({
  value,
  onChange,
  onAdvance,
  inputRef,
  error,
}: {
  value: string;
  onChange: (uf: string) => void;
  onAdvance: () => void;
  inputRef?: Ref<TextInput>;
  error?: string | undefined;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const box = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  const options = filterStates(value);
  const open = anchor !== null && options.length > 0;

  function openList() {
    box.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }
  function closeList() {
    setAnchor(null);
  }
  function choose(uf: string, advance: boolean) {
    onChange(uf);
    closeList();
    if (advance) onAdvance();
  }

  function onKeyPress(event: { nativeEvent: unknown; preventDefault?: () => void }) {
    const key = (event.nativeEvent as { key: string }).key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault?.();
      if (!open) {
        openList();
        return;
      }
      const step = key === "ArrowDown" ? 1 : -1;
      setHighlight((index) => (index + step + options.length) % options.length);
    } else if (key === "Enter") {
      event.preventDefault?.();
      const picked = open ? options[Math.min(highlight, options.length - 1)] : undefined;
      if (picked && !(isValidUf(value) && options.length === 1 && options[0]?.uf === value)) {
        choose(picked.uf, false); // confirma a opção; o próximo Enter é que avança
      } else if (isValidUf(value)) {
        closeList();
        onAdvance();
      } else {
        openList();
      }
    } else if (key === "Escape") {
      closeList();
    }
  }

  const top = anchor ? anchor.y + anchor.height + 4 : 0;
  const left = anchor ? anchor.x : 0;
  const maxHeight = Math.max(120, Math.min(ROW * 7, windowHeight - top - 12));

  const list =
    !open || !anchor ? null : Platform.OS === "web" ? (
      createPortal(
        <div
          role="listbox"
          aria-label="Estados"
          style={{
            position: "fixed",
            left,
            top,
            width: Math.max(LIST_WIDTH, anchor.width),
            maxHeight,
            overflowY: "auto",
            zIndex: 10000,
            background: "#FFFFFF",
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadow.raised,
            padding: 4,
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {options.map((state, index) => (
            <div
              key={state.uf}
              role="option"
              aria-selected={index === highlight}
              // mouseDown (não click) e preventDefault: o campo não perde o foco antes da escolha.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(state.uf, true);
              }}
              onMouseEnter={() => setHighlight(index)}
              style={{
                height: ROW,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 10px",
                borderRadius: radius.sm,
                cursor: "pointer",
                fontSize: 14,
                color: colors.text,
                background: index === highlight ? colors.brandSoft : "transparent",
              }}
            >
              <strong style={{ width: 26 }}>{state.uf}</strong>
              <span style={{ color: colors.muted }}>{state.name}</span>
            </div>
          ))}
        </div>,
        document.body,
      )
    ) : (
      <View style={styles.nativeList}>
        {options.map((state, index) => (
          <Pressable key={state.uf} onPress={() => choose(state.uf, true)} style={[styles.nativeRow, index === highlight ? styles.nativeRowOn : null]}>
            <Text style={styles.nativeUf}>{state.uf}</Text>
            <Text style={styles.nativeName}>{state.name}</Text>
          </Pressable>
        ))}
      </View>
    );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>UF</Text>
      <View ref={box} style={[styles.inputBox, focused ? focusRing : null, error ? styles.inputError : null]}>
        <TextInput
          ref={inputRef}
          accessibilityLabel="UF"
          value={value}
          onChangeText={(text) => {
            onChange(text);
            setHighlight(0);
            openList();
          }}
          onFocus={() => {
            setFocused(true);
            openList();
          }}
          onBlur={() => {
            setFocused(false);
            closeList();
          }}
          onKeyPress={onKeyPress as never}
          placeholder="MG"
          placeholderTextColor={colors.muted}
          maxLength={2}
          autoCapitalize="characters"
          autoComplete="off"
          style={styles.input}
          {...({ role: "combobox", "aria-expanded": open, "aria-autocomplete": "list" } as object)}
        />
        <Icon name="chevronDown" size={14} color={colors.muted} />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {list}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingRight: 12,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  input: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, ...noInnerOutline },
  error: { fontSize: 13, color: colors.error },
  nativeList: {
    position: "absolute",
    top: 76,
    left: 0,
    width: LIST_WIDTH,
    maxHeight: ROW * 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    zIndex: 100,
  },
  nativeRow: { height: ROW, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10 },
  nativeRowOn: { backgroundColor: colors.brandSoft },
  nativeUf: { width: 26, fontWeight: "800", color: colors.text },
  nativeName: { color: colors.muted },
});
