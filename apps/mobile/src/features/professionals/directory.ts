import { DEMO_MODE } from "../../demo/gate";

/**
 * Quem aparece na descoberta de profissionais e em quais categorias atua (slugs de Category).
 * Guarda só a referência ao perfil público: nome, ocupação, serviços e avaliações vêm sempre de
 * GET /profiles/:id, a mesma fonte da tela de perfil, para a lista nunca divergir dele.
 *
 * Ainda não há busca de profissionais na API: por isso a lista é local e só existe no Modo
 * Demonstração (os ids abaixo são os perfis fictícios dele). No aplicativo normal ela fica vazia.
 * Quem só contrata (como Mariana) não entra aqui.
 */
const DEMO_DIRECTORY: ReadonlyArray<{ profileId: string; categories: readonly string[] }> = [
  { profileId: "demo-profile-roberto", categories: ["servicos-de-manutencao"] },
  { profileId: "demo-profile-lucas", categories: ["construcao-civil", "servicos-de-manutencao"] },
];

export const PROFESSIONAL_DIRECTORY = DEMO_MODE ? DEMO_DIRECTORY : [];
