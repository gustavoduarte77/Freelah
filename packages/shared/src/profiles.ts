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
  createdAt: z.string(),
});
export type ProfileReview = z.infer<typeof profileReviewSchema>;

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
