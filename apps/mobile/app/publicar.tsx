import { buildCreateJobRequest } from "@freelah/shared";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors } from "../src/components/ui";
import { useSessionState } from "../src/features/auth/SessionState";
import { BackLink } from "../src/features/jobs/BackLink";
import { ConnectionBanner, ErrorBox, LoadingBox } from "../src/features/jobs/components";
import { useCategories } from "../src/features/jobs/hooks";
import { submission } from "../src/features/publish/api";
import { PublishForm } from "../src/features/publish/PublishForm";
import { PublishReview } from "../src/features/publish/PublishReview";
import { publishDraft, usePublishDraft, useSubmissionState } from "../src/features/publish/store";

/** Publicar oportunidade (PRD 15): exige login; o formulário e o envio vivem em memória. */
export default function PublishScreen() {
  const router = useRouter();
  const { state: sessionState, recheck } = useSessionState();
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef({ card: 0, body: 0 });

  const scrollToY = (y: number) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current.card + offsets.current.body + y), animated: true });

  let body: ReactNode;
  if (sessionState.status === "loading") {
    body = <LoadingBox label="Verificando sua sessão…" />;
  } else if (sessionState.status === "unknown") {
    body = (
      <View style={styles.gap}>
        <Text style={styles.text}>
          Não foi possível verificar sua sessão agora, então não sabemos se você já entrou. Vamos
          tentar de novo sozinhos.
        </Text>
        <Button title="Verificar de novo" onPress={recheck} />
      </View>
    );
  } else if (sessionState.status === "unauthenticated") {
    body = (
      <View style={styles.gap} testID="publish-login-gate">
        <Text style={styles.text}>Entre ou crie uma conta para publicar uma oportunidade.</Text>
        <Button
          title="Entrar"
          onPress={() => router.push({ pathname: "/entrar", params: { redirect: "/publicar" } })}
        />
        <Button
          title="Criar conta"
          variant="link"
          onPress={() => router.push({ pathname: "/cadastrar", params: { redirect: "/publicar" } })}
        />
      </View>
    );
  } else {
    const { user } = sessionState.session;
    body = <PublishFlow userId={user.id} userCity={user.city ?? ""} scrollToY={scrollToY} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Publicar oportunidade" }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink title="← Voltar" />
        <ConnectionBanner />
        <View
          style={styles.card}
          onLayout={(e: LayoutChangeEvent) => {
            offsets.current.card = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.title} accessibilityRole="header">
            Publicar oportunidade
          </Text>
          <View
            onLayout={(e: LayoutChangeEvent) => {
              offsets.current.body = e.nativeEvent.layout.y;
            }}
          >
            {body}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PublishFlow({
  userId,
  userCity,
  scrollToY,
}: {
  userId: string;
  userCity: string;
  scrollToY: (y: number) => void;
}) {
  const router = useRouter();
  const draft = usePublishDraft();
  const sending = useSubmissionState();
  const categories = useCategories();

  // O formulário em memória é de uma conta só: se outra entrar, começa um novo.
  const mine = draft.ownerId === userId;
  useEffect(() => {
    if (publishDraft.getState().ownerId !== userId) {
      publishDraft.claim(userCity, userId);
      submission.reset();
    }
  }, [userId, userCity]);

  if (!mine) return <LoadingBox />;
  if (categories.state.status === "loading") return <LoadingBox label="Carregando categorias…" />;
  if (categories.state.status === "error") {
    return <ErrorBox error={categories.state.error} onRetry={categories.retry} />;
  }

  // Enviando e resultado só existem na revisão. Com resultado desconhecido, "Voltar e editar" leva ao
  // formulário (com o aviso), e o próximo envio continua exigindo confirmação.
  const inReview =
    draft.step === "review" || sending.status === "submitting" || sending.status === "succeeded";
  if (inReview) {
    return <PublishReview categories={categories.state.data} userId={userId} userCity={userCity} />;
  }

  return (
    <View style={styles.gap}>
      {sending.status === "unconfirmed" ? (
        <View style={styles.warn} accessibilityRole="alert">
          <Text style={styles.warnText}>
            Um envio anterior não foi confirmado. Confira em Minhas oportunidades antes de enviar de novo.
          </Text>
          <Button title="Conferir em Minhas oportunidades" variant="link" onPress={() => router.push("/minhas-oportunidades")} />
        </View>
      ) : null}
      <PublishForm
        form={publishDraft}
        categories={categories.state.data}
        scrollToY={scrollToY}
        submitLabel="Revisar"
        onSubmit={() => {
          const result = buildCreateJobRequest(publishDraft.getState().values, new Date());
          if (!result.ok) return result.errors;
          publishDraft.setStep("review");
          return null;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 16, paddingBottom: 64, gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  gap: { gap: 12 },
  text: { fontSize: 15, color: colors.text },
  warn: { backgroundColor: "#FFF4E5", borderRadius: 12, padding: 12, gap: 4 },
  warnText: { fontSize: 14, color: "#5C3B00" },
});
