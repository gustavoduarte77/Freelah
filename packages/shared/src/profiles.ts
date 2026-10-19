import { z } from "zod";

// ---------------------------------------------------------------------------
// Perfil público (GET /profiles/:id). Só dados que a própria pessoa mostraria a qualquer um:
// nunca telefone, e-mail ou data de nascimento. Hoje só o Modo Demonstração responde a esta rota.
// Os campos opcionais têm padrão, para aceitar perfis incompletos (sem serviços ou avaliações).
// ---------------------------------------------------------------------------

/** Avaliação que um cliente deixou para o profissional. */
export const profileReviewSchema = z.object({
  /** Como o cliente aparece (primeiro nome e inicial). */
  author: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  /** Serviço avaliado, quando conhecido. */
  serviceTitle: z.string().nullable().default(null),
  /** Identificador do serviço concluído avaliado (`CompletedService.id`); `null` = avaliação sem publicação. */
  serviceId: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ProfileReview = z.infer<typeof profileReviewSchema>;

/** Papel público da pessoa: quem presta serviços (PROFESSIONAL) e/ou quem contrata (CLIENT). */
export const PROFILE_ROLES = ["PROFESSIONAL", "CLIENT"] as const;
export const profileRoleSchema = z.enum(PROFILE_ROLES);
export type ProfileRole = z.infer<typeof profileRoleSchema>;

export const PROFILE_ROLE_LABEL: Record<ProfileRole, string> = {
  PROFESSIONAL: "Profissional",
  CLIENT: "Contratante",
};

/**
 * Papéis públicos a partir das preferências de onboarding: "encontrar trabalho" é Profissional e
 * "contratar alguém" é Contratante. Sem preferências, nenhum papel. Só expõe estes dois rótulos.
 */
export function rolesFromPreferences(preferences: { wantsWork: boolean; wantsToHire: boolean } | null | undefined): ProfileRole[] {
  const roles: ProfileRole[] = [];
  if (preferences?.wantsWork) roles.push("PROFESSIONAL");
  if (preferences?.wantsToHire) roles.push("CLIENT");
  return roles;
}

/**
 * Serviço concluído que o profissional publicou no perfil: descrição escrita por ele e espaços para
 * fotos. Pode existir sem avaliação; a avaliação pode existir sem ele. Quando os dois são do mesmo
 * serviço, a avaliação aponta para `id` por `serviceId` (nunca se agrupa por nome, data ou texto).
 */
export const completedServiceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** Quando o serviço foi concluído (ISO). */
  completedAt: z.string(),
  /** Quantos espaços de foto exibir (a demonstração só mostra espaços reservados). */
  photoCount: z.number().int().min(0).max(8).default(0),
});
export type CompletedService = z.infer<typeof completedServiceSchema>;

export const publicProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Ocupação em poucas palavras (ex.: "Eletricista residencial"); `null` para quem só contrata. */
  headline: z.string().nullable().default(null),
  /** Apresentação escrita pela pessoa; `null` quando não há. */
  bio: z.string().nullable(),
  /** Serviços ou áreas de atuação; vazio quando a pessoa não oferece serviços. */
  services: z.array(z.string()),
  /** Resumo de todas as avaliações como profissional; `null` quando ainda não há nenhuma. */
  rating: z
    .object({ average: z.number().min(1).max(5), count: z.number().int().positive() })
    .nullable()
    .default(null),
  /** Avaliações mais recentes (podem ser só parte do total de `rating.count`). */
  reviews: z.array(profileReviewSchema).default([]),
  /** Serviços concluídos publicados no perfil (vazio quando não há). */
  completedServices: z.array(completedServiceSchema).default([]),
  /** Papéis da pessoa; perfis antigos, sem este campo, ficam sem papéis. */
  roles: z.array(profileRoleSchema).default([]),
  /** Dado de demonstração: a interface avisa que avaliações e textos são fictícios. */
  isDemo: z.boolean().default(false),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const publicProfileResponseSchema = z.object({ profile: publicProfileSchema });
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;

/** Média com uma casa decimal, no formato brasileiro ("4,7"). */
export function formatRating(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1).replace(".", ",");
}

export interface ProfileHistoryItem {
  service: CompletedService;
  /** Avaliação do mesmo serviço (mesmo `serviceId`), se houver. */
  review: ProfileReview | null;
}

/**
 * Organiza o histórico do perfil: cada serviço concluído com a avaliação do MESMO serviço (por
 * identificador) e, à parte, as avaliações sem publicação. Serviços do mais recente ao mais antigo.
 */
export function groupProfileHistory(profile: Pick<PublicProfile, "completedServices" | "reviews">): {
  items: ProfileHistoryItem[];
  standaloneReviews: ProfileReview[];
} {
  const services = [...profile.completedServices].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const used = new Set<ProfileReview>();
  const items = services.map((service) => {
    const review = profile.reviews.find((candidate) => candidate.serviceId === service.id && !used.has(candidate)) ?? null;
    if (review) used.add(review);
    return { service, review };
  });
  return { items, standaloneReviews: profile.reviews.filter((review) => !used.has(review)) };
}
