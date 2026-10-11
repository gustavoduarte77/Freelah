import { useRouter } from "expo-router";
import { Button } from "../../components/ui";

/** Volta para a tela anterior ou, se não houver, para o início (as telas não têm cabeçalho). */
export function BackLink({ title = "← Voltar" }: { title?: string }) {
  const router = useRouter();
  return (
    <Button
      title={title}
      variant="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
