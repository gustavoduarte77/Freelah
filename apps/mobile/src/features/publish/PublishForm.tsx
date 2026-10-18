import {
  computeDeadline,
  describeDeadline,
  firstErrorField,
  type Category,
  type JobFormErrors,
  type JobFormField,
} from "@freelah/shared";
import { useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type TextInput } from "react-native";
import { Button, colors, FormError, TextField } from "../../components/ui";
import { radius, useBreakpoint } from "../../theme";
import { CategoryChips } from "../jobs/components";
import { StateSelect, isValidUf } from "./StateSelect";
import { useJobForm, type JobFormStore } from "./store";

type SectionKey = "what" | "where" | "pay" | "top";

/**
 * Posição de cada campo (para rolar até o primeiro erro). Cada campo guarda a seção e a altura dentro
 * dela; a altura da seção é somada na hora de rolar, porque os eventos de layout só informam a
 * posição relativa ao pai. Só um formulário fica na tela por vez.
 */
const fieldPos: Partial<Record<JobFormField, { section: SectionKey; y: number }>> = {};
const sectionY: Partial<Record<SectionKey, number>> = {};
/** Posição das colunas dentro do formulário (só existe no layout largo). */
const columnsY = { value: 0 };

/** A partir desta largura o formulário usa duas colunas: o quê à esquerda, onde/quando e pagamento à direita. */
const TWO_COLUMNS_AT = 1300;

/**
 * Corpo do formulário, usado para publicar e para editar. Os dados vivem em `form` (memória), então
 * nada se perde ao navegar. `onSubmit` valida e segue com a ação; devolve as mensagens por campo
 * quando há erro (o formulário as mostra e rola até o primeiro) ou `null` quando está tudo certo.
 *
 * A ordem acompanha o raciocínio de quem publica: o que precisa ser feito, onde e quando, quanto.
 */
export function PublishForm({
  form,
  categories,
  scrollToY,
  submitLabel,
  onSubmit,
  submitting = false,
  photos,
}: {
  form: JobFormStore;
  categories: Category[];
  /** Rola a tela até a posição (relativa ao início do formulário). */
  scrollToY: (y: number) => void;
  submitLabel: string;
  onSubmit: () => JobFormErrors | null;
  /** Há um envio em andamento: o botão fica ocupado e desabilitado. */
  submitting?: boolean;
  /** Seção opcional de fotos (só a publicação a usa), logo depois das observações. */
  photos?: ReactNode;
}) {
  const { values, errors } = useJobForm(form);
  // Enter leva ao próximo campo, na ordem do formulário. Nunca envia: o envio é só pelo botão.
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const stateRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const deadlineRef = useRef<TextInput>(null);
  const timeRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  // Campos de várias linhas usam Enter para quebrar a linha; Ctrl/Cmd + Enter avança.
  function advanceOnCtrlEnter(event: { nativeEvent: unknown }, next: () => void) {
    const native = event.nativeEvent as { key: string; ctrlKey?: boolean; metaKey?: boolean };
    if (native.key === "Enter" && (native.ctrlKey || native.metaKey)) next();
  }
  const { width } = useBreakpoint();
  const twoColumns = width >= TWO_COLUMNS_AT;

  const trackSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    sectionY[key] = event.nativeEvent.layout.y;
  };
  const track = (section: SectionKey, fields: JobFormField[]) => (event: LayoutChangeEvent) => {
    for (const field of fields) fieldPos[field] = { section, y: event.nativeEvent.layout.y };
  };

  function submit() {
    // A sigla digitada precisa ser uma UF existente (a API só confere o formato de duas letras).
    // Confere antes de seguir, para um formulário com UF inválida nunca chegar à revisão.
    if (values.state && !isValidUf(values.state)) {
      form.setErrors({ state: "Escolha uma sigla de estado válida, por exemplo MG." });
      const y = (sectionY.where ?? 0) + (fieldPos.state?.y ?? 0) + (twoColumns ? columnsY.value : 0);
      scrollToY(Math.max(0, y) - 12);
      return;
    }
    const found = onSubmit();
    if (!found) {
      form.setErrors({});
      return;
    }
    form.setErrors(found);
    const first = firstErrorField(found);
    const pos = first ? fieldPos[first] : undefined;
    const offset = twoColumns && pos && pos.section !== "top" ? columnsY.value : 0;
    const y = pos ? offset + (sectionY[pos.section] ?? 0) + pos.y : (sectionY.top ?? 0);
    scrollToY(Math.max(0, y) - 12);
  }

  const selectedSlug = categories.find((c) => c.id === values.categoryId)?.slug ?? null;
  const deadline = computeDeadline({
    deadlineDate: values.deadlineDate,
    scheduledDate: values.scheduledDate,
    startTime: values.startTime,
    now: new Date(),
  });
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <View style={[styles.form, twoColumns ? null : styles.singleWidth]}>
      <View onLayout={trackSection("top")}>
        <FormError
          message={
            errors._ ?? (hasErrors ? "Corrija os campos destacados para continuar. O que você digitou foi mantido." : null)
          }
        />
      </View>

      <View
        style={twoColumns ? styles.columns : styles.stack}
        onLayout={(event: LayoutChangeEvent) => {
          columnsY.value = event.nativeEvent.layout.y;
        }}
      >
      <View style={twoColumns ? styles.leftColumn : styles.stack}>
      <Section
        title="O que precisa ser feito"
        step={1}
        onLayout={trackSection("what")}
      >
        <View onLayout={track("what", ["title"])}>
          <TextField
            label="Título"
            value={values.title}
            onChangeText={(v) => form.setField("title", v)}
            error={errors.title}
            placeholder="Ex.: Pintura de sala"
            maxLength={100}
            inputRef={titleRef}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => descriptionRef.current?.focus()}
          />
        </View>

        <View style={styles.block} onLayout={track("what", ["categoryId"])}>
          <Text style={styles.label}>Categoria</Text>
          <CategoryChips
            categories={categories}
            selected={selectedSlug}
            showAll={false}
            onSelect={(slug) =>
              form.setField("categoryId", categories.find((c) => c.slug === slug)?.id ?? "")
            }
          />
          {errors.categoryId ? <Text style={styles.error}>{errors.categoryId}</Text> : null}
        </View>

        <View onLayout={track("what", ["description"])}>
          <TextField
            label="Descrição"
            value={values.description}
            onChangeText={(v) => form.setField("description", v)}
            error={errors.description}
            placeholder="Explique o serviço, o problema a resolver e o resultado esperado"
            multiline
            numberOfLines={5}
            maxLength={2000}
            style={styles.multiline}
            inputRef={descriptionRef}
            onKeyPress={(event) => advanceOnCtrlEnter(event, () => notesRef.current?.focus())}
          />
        </View>

        <View onLayout={track("what", ["additionalInfo"])}>
          <TextField
            label="Observações (opcional)"
            help="Use para o que não cabe na descrição: ferramentas ou materiais, acesso ao local, horário de entrada e outros cuidados."
            value={values.additionalInfo}
            onChangeText={(v) => form.setField("additionalInfo", v)}
            error={errors.additionalInfo}
            placeholder="Ferramentas, acesso ao local, cuidados…"
            multiline
            numberOfLines={3}
            maxLength={1000}
            style={styles.multilineSmall}
            inputRef={notesRef}
            onKeyPress={(event) => advanceOnCtrlEnter(event, () => cityRef.current?.focus())}
          />
        </View>

        {photos}
      </Section>
      </View>

      <View style={twoColumns ? styles.rightColumn : styles.stack}>
      <Section title="Onde e quando" step={2} onLayout={trackSection("where")}>
        <View style={styles.row} onLayout={track("where", ["city", "state"])}>
          <View style={styles.grow}>
            <TextField
              label="Cidade"
              value={values.city}
              onChangeText={(v) => form.setField("city", v)}
              error={errors.city}
              maxLength={80}
              autoComplete="off"
              inputRef={cityRef}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => stateRef.current?.focus()}
            />
          </View>
          <View style={styles.narrow}>
            <StateSelect
              value={values.state}
              onChange={(v) => form.setField("state", v)}
              onAdvance={() => dateRef.current?.focus()}
              inputRef={stateRef}
              error={errors.state}
            />
          </View>
        </View>

        <View style={styles.row} onLayout={track("where", ["scheduledDate", "deadlineDate", "startTime"])}>
          <View style={styles.field}>
            <TextField
              label="Data do serviço"
              help="Informe o dia em que o trabalho deverá ser realizado."
              value={values.scheduledDate}
              onChangeText={(v) => form.setField("scheduledDate", v)}
              error={errors.scheduledDate}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
              inputRef={dateRef}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => deadlineRef.current?.focus()}
            />
          </View>
          <View style={styles.field}>
            <TextField
              label="Publicada até"
              help="Informe até quando esta oportunidade ficará disponível para receber interessados. Escolha uma data que permita encontrar e selecionar alguém antes do serviço."
              value={values.deadlineDate}
              onChangeText={(v) => form.setField("deadlineDate", v)}
              error={errors.deadlineDate}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
              inputRef={deadlineRef}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => timeRef.current?.focus()}
            />
          </View>
          <View style={styles.field}>
            <TextField
              label="Horário"
              help="Informe o horário previsto para começar o serviço."
              value={values.startTime}
              onChangeText={(v) => form.setField("startTime", v)}
              error={errors.startTime}
              placeholder="HH:MM"
              keyboardType="number-pad"
              maxLength={5}
              inputRef={timeRef}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => priceRef.current?.focus()}
            />
          </View>
        </View>
        <Text style={styles.hint}>
          {"instant" in deadline
            ? `A oportunidade aparece até ${describeDeadline(deadline)}, horário de Brasília.`
            : "Depois do dia em “Publicada até” ela deixa de receber interessados. O prazo máximo é de 60 dias e não passa do início do serviço."}
        </Text>
      </Section>

      <Section title="Pagamento" step={3} onLayout={trackSection("pay")}>
        <View onLayout={track("pay", ["price"])} style={styles.block}>
          <View style={styles.payRow}>
            <View style={styles.field}>
              <TextField
                label="Valor (R$)"
                value={values.price}
                onChangeText={(v) => form.setField("price", v)}
                error={errors.price}
                placeholder="200,00"
                keyboardType="decimal-pad"
                maxLength={12}
                inputRef={priceRef}
                returnKeyType="done"
              />
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: values.negotiable }}
              aria-checked={values.negotiable}
              accessibilityLabel="Valor negociável"
              onPress={() => form.setField("negotiable", !values.negotiable)}
              style={styles.checkRow}
            >
              <View style={[styles.checkBox, values.negotiable ? styles.checkBoxOn : null]}>
                {values.negotiable ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.checkLabel}>Valor negociável</Text>
            </Pressable>
          </View>
        </View>
      </Section>
      </View>
      </View>

      <Button title={submitLabel} onPress={submit} loading={submitting} disabled={submitting} />
    </View>
  );
}

function Section({
  title,
  step,
  children,
  onLayout,
}: {
  title: string;
  step: number;
  children: ReactNode;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.section} onLayout={onLayout}>
      <View style={styles.sectionHeader}>
        <View style={styles.step}>
          <Text style={styles.stepText}>{step}</Text>
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  singleWidth: { width: "100%", maxWidth: 960 },
  stack: { gap: 16 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  leftColumn: { flex: 3, gap: 16, minWidth: 0 },
  rightColumn: { flex: 2, gap: 16, minWidth: 0 },
  section: {
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { fontSize: 13, fontWeight: "800", color: colors.brand },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  block: { gap: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  grow: { flexGrow: 1, flexBasis: 220 },
  narrow: { width: 110 },
  // Três campos de agendamento na mesma linha em telas largas; empilham nas estreitas.
  field: { flexGrow: 1, flexBasis: 150 },
  payRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 14 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  error: { fontSize: 13, color: colors.error },
  hint: { fontSize: 13, color: colors.muted },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  multilineSmall: { minHeight: 80, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, cursor: "pointer" },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  checkLabel: { fontSize: 15, color: colors.text },
});
