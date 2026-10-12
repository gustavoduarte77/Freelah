import {
  computeDeadline,
  describeDeadline,
  firstErrorField,
  type Category,
  type JobFormErrors,
  type JobFormField,
} from "@freelah/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Button, colors, FormError, TextField } from "../../components/ui";
import { CategoryChips } from "../jobs/components";
import { useJobForm, type JobFormStore } from "./store";

/** Altura de cada campo dentro do formulário (para rolar até o primeiro erro). Só um formulário fica na tela. */
const fieldY: Partial<Record<JobFormField | "top", number>> = {};

/**
 * Corpo do formulário, usado para publicar e para editar. Os dados vivem em `form` (memória), então
 * nada se perde ao navegar. `onSubmit` valida e segue com a ação; devolve as mensagens por campo
 * quando há erro (o formulário as mostra e rola até o primeiro) ou `null` quando está tudo certo.
 */
export function PublishForm({
  form,
  categories,
  scrollToY,
  submitLabel,
  onSubmit,
  submitting = false,
}: {
  form: JobFormStore;
  categories: Category[];
  /** Rola a tela até a posição (relativa ao início do formulário). */
  scrollToY: (y: number) => void;
  submitLabel: string;
  onSubmit: () => JobFormErrors | null;
  /** Há um envio em andamento: o botão fica ocupado e desabilitado. */
  submitting?: boolean;
}) {
  const { values, errors } = useJobForm(form);

  const track = (field: JobFormField | "top") => (event: LayoutChangeEvent) => {
    fieldY[field] = event.nativeEvent.layout.y;
  };
  // Campos lado a lado: a posição é a da linha (a do campo seria relativa à linha).
  const trackRow = (fields: JobFormField[]) => (event: LayoutChangeEvent) => {
    for (const field of fields) fieldY[field] = event.nativeEvent.layout.y;
  };

  function submit() {
    const found = onSubmit();
    if (!found) {
      form.setErrors({});
      return;
    }
    form.setErrors(found);
    const first = firstErrorField(found);
    scrollToY(Math.max(0, (first ? fieldY[first] : fieldY.top) ?? 0) - 12);
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
    <View style={styles.form}>
      <View onLayout={track("top")}>
        <FormError
          message={
            errors._ ?? (hasErrors ? "Corrija os campos destacados para continuar. O que você digitou foi mantido." : null)
          }
        />
      </View>

      <Block onLayout={track("title")}>
        <TextField
          label="Título"
          value={values.title}
          onChangeText={(v) => form.setField("title", v)}
          error={errors.title}
          placeholder="Ex.: Pintura de sala"
          maxLength={100}
        />
      </Block>

      <Block onLayout={track("description")}>
        <TextField
          label="Descrição"
          value={values.description}
          onChangeText={(v) => form.setField("description", v)}
          error={errors.description}
          placeholder="Explique o que precisa ser feito"
          multiline
          numberOfLines={5}
          maxLength={2000}
          style={styles.multiline}
        />
      </Block>

      <Block onLayout={track("categoryId")}>
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
      </Block>

      <View style={styles.row} onLayout={trackRow(["city", "state"])}>
        <Block style={styles.grow}>
          <TextField
            label="Cidade"
            value={values.city}
            onChangeText={(v) => form.setField("city", v)}
            error={errors.city}
            maxLength={80}
            autoComplete="off"
          />
        </Block>
        <Block style={styles.narrow}>
          <TextField
            label="UF"
            value={values.state}
            onChangeText={(v) => form.setField("state", v)}
            error={errors.state}
            placeholder="MG"
            maxLength={2}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Block>
      </View>

      <View style={styles.row} onLayout={trackRow(["scheduledDate", "startTime"])}>
        <Block style={styles.grow}>
          <TextField
            label="Data do serviço"
            value={values.scheduledDate}
            onChangeText={(v) => form.setField("scheduledDate", v)}
            error={errors.scheduledDate}
            placeholder="DD/MM/AAAA"
            keyboardType="number-pad"
            maxLength={10}
          />
        </Block>
        <Block style={styles.narrow}>
          <TextField
            label="Horário"
            value={values.startTime}
            onChangeText={(v) => form.setField("startTime", v)}
            error={errors.startTime}
            placeholder="HH:MM"
            keyboardType="number-pad"
            maxLength={5}
          />
        </Block>
      </View>

      <Block onLayout={track("price")}>
        <TextField
          label="Valor (R$)"
          value={values.price}
          onChangeText={(v) => form.setField("price", v)}
          error={errors.price}
          placeholder="200,00"
          keyboardType="decimal-pad"
          maxLength={12}
        />
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
      </Block>

      <Block onLayout={track("deadlineDate")}>
        <TextField
          label="Publicada até (último dia)"
          value={values.deadlineDate}
          onChangeText={(v) => form.setField("deadlineDate", v)}
          error={errors.deadlineDate}
          placeholder="DD/MM/AAAA"
          keyboardType="number-pad"
          maxLength={10}
        />
        <Text style={styles.hint}>
          {"instant" in deadline
            ? `A oportunidade aparece até ${describeDeadline(deadline)}, horário de Brasília.`
            : "Depois desse dia ela deixa de aparecer. O prazo máximo é de 60 dias e não passa do início do serviço."}
        </Text>
      </Block>

      <Block onLayout={track("additionalInfo")}>
        <TextField
          label="Informações adicionais (opcional)"
          value={values.additionalInfo}
          onChangeText={(v) => form.setField("additionalInfo", v)}
          error={errors.additionalInfo}
          placeholder="Ferramentas, acesso ao local, observações…"
          multiline
          numberOfLines={3}
          maxLength={1000}
          style={styles.multilineSmall}
        />
      </Block>

      <Button title={submitLabel} onPress={submit} loading={submitting} disabled={submitting} />
    </View>
  );
}

function Block({
  children,
  onLayout,
  style,
}: {
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: object;
}) {
  return (
    <View onLayout={onLayout} style={[styles.block, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  block: { gap: 6 },
  row: { flexDirection: "row", gap: 12 },
  grow: { flex: 1 },
  narrow: { width: 110 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  error: { fontSize: 13, color: colors.error },
  hint: { fontSize: 13, color: colors.muted },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  multilineSmall: { minHeight: 80, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
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
