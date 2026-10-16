import { publicProfileResponseSchema, type PublicProfile } from "@freelah/shared";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../lib/api";
import { publicFetch } from "../jobs/jobsApi";

export type ProfileState =
  | { status: "loading" }
  | { status: "error"; notFound: boolean }
  | { status: "ready"; profile: PublicProfile };

/** Perfil público (GET /profiles/:id): rota pública, sem sessão. */
export async function fetchProfile(id: string): Promise<ProfileState> {
  try {
    const response = await publicFetch(`${API_URL}/profiles/${encodeURIComponent(id)}`);
    if (!response.ok) return { status: "error", notFound: response.status === 404 };
    const parsed = publicProfileResponseSchema.safeParse(await response.json());
    return parsed.success ? { status: "ready", profile: parsed.data.profile } : { status: "error", notFound: false };
  } catch {
    return { status: "error", notFound: false };
  }
}

export function useProfile(id: string) {
  // O resultado guarda a tentativa a que pertence: enquanto não chega o da atual, está carregando.
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; state: ProfileState } | null>(null);
  const key = `${id}#${attempt}`;

  useEffect(() => {
    let active = true;
    void fetchProfile(id).then((state) => active && setLoaded({ key: `${id}#${attempt}`, state }));
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const state: ProfileState = loaded?.key === key ? loaded.state : { status: "loading" };
  return { state, retry };
}
