# Roadmap do Freelah

Referência: PRD v2.0. Este arquivo registra o andamento, as simplificações adotadas no MVP e o caminho de evolução. Nenhum requisito é descartado sem aparecer aqui.

## Etapas do MVP

| # | Etapa | Fase do PRD | Estado |
|---|---|---|---|
| 0 | Monorepo, app Expo, API `/health`, pacote compartilhado, lint, documentação | 1 | Concluída |
| 1 | Prisma 7 + Neon: tabelas, migração, seed de categorias | 1 | Pendente |
| 2 | Better Auth: cadastro (com declaração 18+), login, logout, sessão nas 3 plataformas | 1 | Pendente |
| 3 | Onboarding, preferências (local e na conta), configurações, abas por preferência | 2 | Pendente |
| 4 | Home, Explorar, busca, filtros, detalhes (públicos), identidade visual | 2 | Pendente |
| 5 | Publicar (revisão e rascunho), editar, cancelar, Minhas oportunidades, expiração | 3 | Pendente |
| 6 | Interesse, lista de interessados, Meus interesses | 4 | Pendente |
| 7 | Chat (consulta a cada 3 s, buscando só mensagens novas) | 4 | Pendente |
| 8 | Seleção do trabalhador e conclusão do serviço | 4 | Pendente |
| 9 | Denúncia, bloqueio, administração, termos e privacidade | 5 | Pendente |
| 10 | Revisão visual, seed de demonstração, teste Playwright, deploy, APK (EAS) | 6 | Pendente |

## Simplificações e decisões para o protótipo

| Requisito do PRD | No MVP | Evolução |
|---|---|---|
| Recuperação de senha (10.4) | Fora da demonstração; sem tela visível. Depende de provedor de e-mail | Configurar provedor (ex.: Resend) e ligar o fluxo do Better Auth |
| Imagens da oportunidade (15.2) | Adiadas | Armazenamento (S3/R2) com upload por URL assinada |
| Foto de perfil (10.1, 22) | Adiada; app mostra as iniciais. Campo `avatarUrl` previsto no banco | Mesmo armazenamento das imagens |
| Chat em tempo real (18.4) | Consulta a cada 3 s com a conversa aberta; busca isolada em um módulo | Trocar por WebSocket sem mudar as telas |
| Notificações (26.11) | Contadores de não lidas e de novos interessados dentro do app | Tabela de notificações e push |
| Termos e privacidade (22, 23.1) | Texto-base marcado como rascunho, pendente de revisão jurídica | Texto definitivo |
| Moderação (23.4) | Lista de denúncias e mudança de status, só para administradores | Painel completo |
| Localização (34.2) | Cidade e estado em texto, com filtro por cidade | Geolocalização e mapa |

## Fora do escopo do protótipo (PRD seção 35)

Pagamentos e carteira, comissão, verificação facial e de identidade, reputação e avaliações, recomendação, mapa, notificações push, múltiplos idiomas, painel administrativo completo, antifraude.

## Hospedagem (a decidir após o app funcionar localmente)

Critérios: risco de inicialização lenta no plano gratuito, limites gratuitos, API sempre disponível e **cookie de sessão da Web**. Se a Web e a API ficarem em domínios diferentes, alguns navegadores (Safari) podem bloquear o cookie. O ideal é servir a API sob o mesmo domínio da Web. As opções serão comparadas na etapa 10.

## Segurança (resumo do que vale desde o início)

- Credenciais apenas em variáveis de ambiente; `.env*` fora do Git (só `.env.example`).
- A API é a autoridade: valida dados, propriedade dos registros e transições de estado.
- O telefone do usuário é privado e nunca aparece em respostas públicas.
