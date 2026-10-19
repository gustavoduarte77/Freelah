import {
  RETRY_WARNING,
  buildCreateJobRequest,
  describeDeadline,
  describeSubmissionError,
  formatBrDate,
  formatJobPrice,
  formatPriceCents,
  hasDefinedPrice,
  mapServerFields,
  type Category,
  type SubmissionMode,
} from "@freelah/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { DEMO_MODE } from "../../demo/gate";
import { exploreJobsController, homeJobsController } from "../jobs/registry";
import { submission } from "./api";
import { canPickPhotos } from "./photoFiles";
import { publishPhotos, usePublishPhotos } from "./photos";
import { publishDraft, usePublishDraft, useSubmissionState } from "./store";

/** Revisão, envio (rascunho ou publicação) e resultado. Nada é declarado salvo sem confirmação da API. */
export function PublishReview({
  categories,
  userId,
  userCity,
}: {
  categories: Category[];
  userId: string;
  userCity: string;
}) {
  const router = useRouter();
  const { values } = usePublishDraft();
  const state = useSubmissionState();
  const photos = usePublishPhotos();
  const [confirmingRetry, setConfirmingRetry] = useState(false);

  const built = buildCreateJobRequest(values, new Date());
  const succeededJobId = state.status === "succeeded" ? state.job.id : null;
  const succeededPublished = state.status === "succeeded" && state.job.status === "PUBLISHED";

  // Recusa por campo (400): volta ao formulário com cada mensagem no campo certo. Nada foi salvo.
  useEffect(() => {
    if (state.status === "failed" && state.error.kind === "validation") {
      publishDraft.setErrors(mapServerFields(state.error.fields));
      publishDraft.setStep("form");
      submission.reset();
    }
  }, [state]);

  // Depois de publicar, as listas da Home e do Explorar passam a incluir a nova oportunidade.
  useEffect(() => {
    if (succeededJobId && succeededPublished) {
      homeJobsController.refresh();
      exploreJobsController.refresh();
    }
  }, [succeededJobId, succeededPublished]);

  function send(mode: SubmissionMode, confirmRetry = false) {
    // Recalcula com a hora de agora: a revisão pode ter ficado aberta por um tempo.
    const fresh = buildCreateJobRequest(values, new Date());
    if (!fresh.ok) {
      publishDraft.setErrors(fresh.errors);
      publishDraft.setStep("form");
      return;
    }
    setConfirmingRetry(false);
    void submission.submit(fresh.request, mode, { confirmRetry });
  }

  function startOver() {
    setConfirmingRetry(false);
    submission.reset();
    publishPhotos.clear();
    publishDraft.reset(userCity, userId);
  }

  // ------------------------------------------------------------------ resultado
  if (state.status === "succeeded") {
    const published = state.job.status === "PUBLISHED";
    return (
      <View style={styles.box} accessibilityLiveRegion="polite" testID="publish-result">
        <Text style={styles.resultTitle}>{published ? "Oportunidade publicada" : "Rascunho salvo"}</Text>
        <Text style={styles.body}>
          {published
            ? `“${state.job.title}” já aparece para quem procura trabalho.`
            : `“${state.job.title}” foi salva como rascunho e ainda não aparece para ninguém. Você a encontra em Minhas oportunidades.`}
        </Text>
        {published ? (
          <Button
            title="Ver oportunidade"
            onPress={() => router.push({ pathname: "/oportunidades/[id]", params: { id: state.job.id } })}
          />
        ) : null}
        <Button title="Minhas oportunidades" variant={published ? "secondary" : "primary"} onPress={() => router.push("/minhas-oportunidades")} />
        <Button title="Publicar outra oportunidade" variant="secondary" onPress={startOver} />
      </View>
    );
  }

  if (!built.ok) {
    return (
      <View style={styles.box}>
        <Text style={styles.body}>Alguns dados precisam de ajuste antes da revisão.</Text>
        <Button
          title="Voltar e editar"
          onPress={() => {
            publishDraft.setErrors(built.errors);
            publishDraft.setStep("form");
          }}
        />
      </View>
    );
  }

  const { request, deadline } = built;
  const category = categories.find((c) => c.id === request.categoryId)?.name ?? "";
  const busy = state.status === "submitting";
  const unconfirmed = state.status === "unconfirmed";

  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Revise antes de confirmar</Text>

      <Row label="Título" value={request.title} />
      <Row label="Categoria" value={category} />
      <Row
        label="Valor"
        value={
          hasDefinedPrice(request.proposedPriceCents)
            ? `${formatPriceCents(request.proposedPriceCents)}${request.negotiable ? " · negociável" : " · valor fixo"}`
            : formatJobPrice(request.proposedPriceCents)
        }
      />
      <Row label="Local" value={`${request.city}/${request.state}`} />
      <Row label="Data e horário do serviço" value={`${formatBrDate(request.scheduledDate)} às ${request.startTime}`} />
      <Row label="Publicada até" value={describeDeadline(deadline)} testID="review-deadline" />
      <Row label="Descrição" value={request.description} />
      {request.additionalInfo ? <Row label="Observações" value={request.additionalInfo} /> : null}
      {DEMO_MODE && canPickPhotos() ? <PhotosRow images={photos.images} /> : null}

      {state.status === "failed" && state.error.kind !== "validation" ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="submit-error">
          <Text style={styles.errorText}>{describeSubmissionError(state.error, state.mode)}</Text>
          {state.error.kind === "unauthorized" ? (
            <Button
              title="Entrar de novo"
              onPress={() => {
                // O aviso já foi lido: ao voltar do login, a revisão volta limpa, com os mesmos dados.
                submission.reset();
                router.push({ pathname: "/entrar", params: { redirect: "/publicar" } });
              }}
            />
          ) : null}
        </View>
      ) : null}

      {unconfirmed ? (
        <View style={styles.warnBox} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="submit-unconfirmed">
          <Text style={styles.warnTitle}>Não sabemos se foi salvo</Text>
          <Text style={styles.warnText}>{describeSubmissionError(state.error, state.mode)}</Text>
          <Text style={styles.warnText}>Seus dados continuam aqui e nada será reenviado sozinho.</Text>
          <Button title="Conferir em Minhas oportunidades" onPress={() => router.push("/minhas-oportunidades")} />
          <Button title="Já está na lista: começar uma nova" variant="link" onPress={startOver} />
          {confirmingRetry ? (
            <View style={styles.confirmBox}>
              <Text style={styles.warnText}>{RETRY_WARNING}</Text>
              <Button
                title={state.mode === "publish" ? "Enviar de novo e publicar" : "Enviar de novo como rascunho"}
                onPress={() => send(state.mode, true)}
              />
              <Button title="Cancelar" variant="link" onPress={() => setConfirmingRetry(false)} />
            </View>
          ) : (
            <Button title="Não está na lista: tentar de novo" variant="link" onPress={() => setConfirmingRetry(true)} />
          )}
        </View>
      ) : (
        <View style={styles.actions}>
          <Button title="Publicar agora" onPress={() => send("publish")} loading={busy && state.mode === "publish"} disabled={busy} />
          <Button
            title="Salvar como rascunho"
            variant="link"
            onPress={() => send("draft")}
            loading={busy && state.mode === "draft"}
            disabled={busy}
          />
        </View>
      )}

      <Button title="Voltar e editar" variant="link" onPress={() => publishDraft.setStep("form")} disabled={busy} />
    </View>
  );
}

/** Fotos na revisão: miniaturas (a capa primeiro) ou o aviso de que não há nenhuma. */
function PhotosRow({ images }: { images: string[] }) {
  if (images.length === 0) return <Row label="Fotos" value="Nenhuma foto adicionada. O anúncio aparece só com o ícone da categoria." />;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>Fotos</Text>
      <View style={styles.photoRow}>
        {images.map((uri, index) => (
          <Image key={uri.slice(-40) + index} source={{ uri }} style={styles.photo} resizeMode="cover" accessibilityLabel={index === 0 ? "Capa" : `Foto ${index + 1}`} />
        ))}
      </View>
      <Text style={styles.rowValue}>
        {images.length} {images.length === 1 ? "foto" : "fotos"}; a primeira é a capa.
      </Text>
    </View>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
  heading: { fontSize: 20, fontWeight: "800", color: colors.text },
  row: { gap: 2 },
  rowLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase" },
  rowValue: { fontSize: 16, color: colors.text },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 },
  photo: { width: 88, height: 66, borderRadius: 8, backgroundColor: colors.border },
  actions: { gap: 4 },
  body: { fontSize: 15, color: colors.text },
  resultTitle: { fontSize: 24, fontWeight: "800", color: colors.brand },
  errorBox: { backgroundColor: "#FCE8E6", borderRadius: 12, padding: 14, gap: 8 },
  errorText: { color: colors.error, fontSize: 14 },
  warnBox: { backgroundColor: "#FFF4E5", borderRadius: 12, padding: 14, gap: 8 },
  warnTitle: { fontSize: 16, fontWeight: "700", color: "#7A4B00" },
  warnText: { fontSize: 14, color: "#5C3B00" },
  confirmBox: { backgroundColor: "#FFE8CC", borderRadius: 10, padding: 12, gap: 6 },
});
