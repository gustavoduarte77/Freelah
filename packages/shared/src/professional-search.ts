import type { PublicProfile } from "./profiles";

// Busca de profissionais (descoberta): filtra perfis públicos já carregados por texto e categoria.
// Funciona sobre o contrato de perfil existente, sem campos novos.

/** Perfil na lista de descoberta, com as categorias em que a pessoa atua (slugs de Category). */
export interface ProfessionalEntry {
  profile: PublicProfile;
  categories: readonly string[];
}

/** Minúsculas e sem acentos, para "eletrica" encontrar "Elétrica". */
export function foldSearchText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Só quem oferece serviços aparece na descoberta: quem apenas contrata não é listado como profissional. */
export const isProfessional = (profile: PublicProfile): boolean => profile.services.length > 0;

/**
 * Profissionais que combinam com a busca (nome, ocupação ou serviço; todas as palavras precisam
 * aparecer) e com a categoria (`null` = todas). Mantém a ordem recebida.
 */
export function searchProfessionals(
  entries: readonly ProfessionalEntry[],
  query: string,
  category: string | null,
): ProfessionalEntry[] {
  const words = foldSearchText(query).split(/\s+/).filter(Boolean);
  return entries.filter(({ profile, categories }) => {
    if (!isProfessional(profile)) return false;
    if (category && !categories.includes(category)) return false;
    if (words.length === 0) return true;
    const haystack = foldSearchText([profile.name, profile.headline ?? "", ...profile.services].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
