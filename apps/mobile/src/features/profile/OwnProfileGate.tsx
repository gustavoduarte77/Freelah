import type { MyJobsApiError, PublicProfile } from "@freelah/shared";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, colors } from "../../components/ui";
import { useSessionState } from "../auth/SessionState";
import { LoadingBox } from "../jobs/components";
import { myJobsApi } from "../publish/api";

type OwnState =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "error"; message: string };

/** O perfil da própria conta, relido cada vez que a tela volta ao foco (por exemplo, depois de editar). */
function useOwnProfile() {
  const [state, setState] = useState<OwnState>({ status: "loading" });
  const load = useCallback(() => {
    myJobsApi.ownProfile().then(
      (profile) => setState({ status: "ready", profile }),
      (error: unknown) =>
        setState({ status: "error", message: (error as MyJobsApiError).message ?? "Não foi possível carregar o perfil agora." }),
    );
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const retry = () => {
    setState({ status: "loading" });
    load();
  };
  return { state, retry };
}

function OwnProfileLoader({ children }: { children: (profile: PublicProfile) => ReactNode }) {
  const { state, retry } = useOwnProfile();
  if (state.status === "loading") return <LoadingBox label="Carregando seu perfil…" />;
  if (state.status === "error") {
    return (
      <View style={styles.gap} accessibilityRole="alert">
        <Text style={styles.text}>{state.message}</Text>
        <Button title="Tentar de novo" onPress={retry} />
      </View>
    );
  }
  return <>{children(state.profile)}</>;
}

/**
 * Cerca das telas do próprio perfil: precisa de sessão. Sem sessão leva ao login e volta para `redirect`;
 * com sessão carrega o perfil da conta e o entrega a `children`.
 */
export function OwnProfileGate({ redirect, children }: { redirect: string; children: (profile: PublicProfile) => ReactNode }) {
  const router = useRouter();
  const { state, recheck } = useSessionState();
  if (state.status === "loading") return <LoadingBox label="Verificando sua sessão…" />;
  if (state.status === "unknown") {
    return (
      <View style={styles.gap}>
        <Text style={styles.text}>Não foi possível verificar sua sessão agora. Vamos tentar de novo sozinhos.</Text>
        <Button title="Verificar de novo" onPress={recheck} />
      </View>
    );
  }
  if (state.status === "unauthenticated") {
    return (
      <View style={styles.gap}>
        <Text style={styles.text}>Entre para ver e editar o seu perfil.</Text>
        <Button title="Entrar" onPress={() => router.push({ pathname: "/entrar", params: { redirect } } as unknown as Href)} />
      </View>
    );
  }
  return <OwnProfileLoader>{children}</OwnProfileLoader>;
}

const styles = StyleSheet.create({
  gap: { gap: 12, alignItems: "flex-start" },
  text: { fontSize: 15, color: colors.textSoft },
});
