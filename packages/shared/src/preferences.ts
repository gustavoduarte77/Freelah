import { z } from "zod";

const flags = {
  wantsWork: z.boolean("Informe se você quer encontrar trabalho."),
  wantsToHire: z.boolean("Informe se você quer contratar alguém."),
};

/** Preferências de uso (PRD 8): personalizam a interface, mas NÃO são permissões. */
export const preferencesSchema = z.object(flags);
export type Preferences = z.infer<typeof preferencesSchema>;

export const AT_LEAST_ONE_PREFERENCE_MESSAGE =
  "Pelo menos uma preferência precisa ficar ativa: encontrar trabalho ou contratar alguém.";

export function hasAtLeastOnePreference(preferences: Preferences): boolean {
  return preferences.wantsWork || preferences.wantsToHire;
}

/**
 * Corpo de PUT /me/preferences. Estrito: campos desconhecidos (inclusive userId) são recusados,
 * porque o cliente nunca escolhe de qual conta está alterando.
 */
export const updatePreferencesSchema = z.strictObject(flags).refine(hasAtLeastOnePreference, {
  error: AT_LEAST_ONE_PREFERENCE_MESSAGE,
  path: ["wantsWork"],
});

export type UpdatePreferencesInput = z.input<typeof updatePreferencesSchema>;

/** Resposta de GET e PUT /me/preferences. `null` = a conta ainda não escolheu (mostrar o onboarding). */
export const preferencesResponseSchema = z.object({
  preferences: preferencesSchema.nullable(),
});

export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>;
