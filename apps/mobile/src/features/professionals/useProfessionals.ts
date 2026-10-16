import { isProfessional, type ProfessionalEntry } from "@freelah/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchProfile } from "../profile/useProfile";
import { PROFESSIONAL_DIRECTORY } from "./directory";

export type ProfessionalsState =
  | { status: "loading" }
  /** `failed`: quantos perfis do diretório não puderam ser carregados (os demais aparecem). */
  | { status: "ready"; entries: ProfessionalEntry[]; failed: number };

/** Carrega os perfis públicos do diretório em paralelo, pela mesma rota da tela de perfil. */
export function useProfessionals() {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ attempt: number; state: ProfessionalsState } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all(PROFESSIONAL_DIRECTORY.map(({ profileId }) => fetchProfile(profileId))).then((results) => {
      if (!active) return;
      const entries: ProfessionalEntry[] = [];
      results.forEach((result, index) => {
        // Perfil sem serviços não é de profissional: fica fora mesmo que esteja no diretório.
        if (result.status === "ready" && isProfessional(result.profile)) {
          entries.push({ profile: result.profile, categories: PROFESSIONAL_DIRECTORY[index]!.categories });
        }
      });
      const failed = results.filter((result) => result.status === "error").length;
      setLoaded({ attempt, state: { status: "ready", entries, failed } });
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const state: ProfessionalsState = loaded?.attempt === attempt ? loaded.state : { status: "loading" };
  return { state, retry };
}
