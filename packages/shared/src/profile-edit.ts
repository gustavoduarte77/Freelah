import { z } from "zod";
import { profileRoleSchema, publicProfileSchema, type ProfileRole, type PublicProfile } from "./profiles";

// ---------------------------------------------------------------------------
// Editar o próprio perfil. Os papéis (Profissional / Contratante) vêm das preferências de uso:
// editar os papéis grava as mesmas preferências do onboarding (preferências não são permissões).
// A mesma validação roda no app, na demonstração e na API.
// ---------------------------------------------------------------------------

export const PROFILE_HEADLINE_MAX = 80;
export const PROFILE_BIO_MAX = 600;
export const PROFILE_CITY_MIN = 2;
export const PROFILE_CITY_MAX = 100;

export const PROFILE_ROLE_REQUIRED_MESSAGE = "Escolha ao menos um papel: Profissional ou Contratante.";
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NO_CONTROL = "Remova os caracteres de controle do texto.";

/** Texto opcional: espaços nas pontas saem e texto vazio vira `null`. */
const optionalText = (max: number, tooLong: string) =>
  z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .pipe(z.string().max(max, tooLong).refine((value) => !CONTROL_CHARS.test(value), NO_CONTROL))
    .transform((value) => (value === "" ? null : value));

/** Corpo de PATCH /me/profile. Só estes quatro campos: nada de e-mail, telefone, id ou preferências à parte. */
export const updateProfileSchema = z.strictObject({
  roles: z
    .array(profileRoleSchema, { error: PROFILE_ROLE_REQUIRED_MESSAGE })
    .min(1, PROFILE_ROLE_REQUIRED_MESSAGE)
    .refine((roles) => new Set(roles).size === roles.length, "Cada papel só pode aparecer uma vez."),
  headline: optionalText(PROFILE_HEADLINE_MAX, `A ocupação pode ter até ${PROFILE_HEADLINE_MAX} caracteres.`),
  bio: optionalText(PROFILE_BIO_MAX, `A apresentação pode ter até ${PROFILE_BIO_MAX} caracteres.`),
  city: z
    .string({ error: "Informe sua cidade." })
    .trim()
    .min(PROFILE_CITY_MIN, "Informe sua cidade.")
    .max(PROFILE_CITY_MAX, `A cidade pode ter até ${PROFILE_CITY_MAX} caracteres.`)
    .refine((value) => !CONTROL_CHARS.test(value), NO_CONTROL),
});
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;

/** Perfil do próprio usuário: o mesmo conteúdo do perfil público (nada privado entra aqui). */
export const ownProfileResponseSchema = z.object({ profile: publicProfileSchema });
export type OwnProfileResponse = z.infer<typeof ownProfileResponseSchema>;

/** Valores do formulário (texto como a pessoa digitou). */
export interface ProfileFormValues {
  roles: ProfileRole[];
  headline: string;
  bio: string;
  city: string;
}

export function profileToFormValues(profile: PublicProfile): ProfileFormValues {
  return { roles: [...profile.roles], headline: profile.headline ?? "", bio: profile.bio ?? "", city: profile.city };
}

/** Liga ou desliga um papel, na ordem fixa Profissional, Contratante. */
export function toggleProfileRole(roles: readonly ProfileRole[], role: ProfileRole): ProfileRole[] {
  const next = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role];
  return (["PROFESSIONAL", "CLIENT"] as const).filter((item) => next.includes(item));
}

export type ProfileFormResult =
  | { ok: true; request: UpdateProfileInput }
  | { ok: false; errors: Partial<Record<keyof ProfileFormValues, string>> };

/** Valida o formulário antes de enviar (a API valida de novo). */
export function buildUpdateProfileRequest(values: ProfileFormValues): ProfileFormResult {
  const parsed = updateProfileSchema.safeParse({
    roles: values.roles,
    headline: values.headline,
    bio: values.bio,
    city: values.city,
  });
  if (parsed.success) return { ok: true, request: parsed.data };
  const errors: Partial<Record<keyof ProfileFormValues, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && key in values && !(key in errors)) errors[key as keyof ProfileFormValues] = issue.message;
  }
  return { ok: false, errors };
}

/** Papéis a partir do pedido: Profissional liga "encontrar trabalho" e Contratante liga "contratar alguém". */
export function preferencesFromRoles(roles: readonly ProfileRole[]): { wantsWork: boolean; wantsToHire: boolean } {
  return { wantsWork: roles.includes("PROFESSIONAL"), wantsToHire: roles.includes("CLIENT") };
}
