# Roadmap do Freelah

Referência: PRD v2.0. Este arquivo registra o andamento, as simplificações adotadas no MVP e o caminho de evolução. Nenhum requisito é descartado sem aparecer aqui.

## Etapas do MVP

| # | Etapa | Fase do PRD | Estado |
|---|---|---|---|
| 0 | Monorepo, app Expo, API `/health`, pacote compartilhado, lint, documentação | 1 | Concluída |
| 1 | Prisma 7 + Neon: tabelas, migração, seed de categorias | 1 | Concluída (migração e seed aplicados no Neon `production` e no banco local; 46 testes passando) |
| 2 | Better Auth: cadastro (com declaração 18+), login, logout, sessão nas 3 plataformas | 1 | Concluída na API e na Web; falta conferir a sessão no celular (Expo Go) |
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

## Decisões do modelo de dados (etapa 1)

| Tema | Decisão |
|---|---|
| Contratação (PRD 28.11) | Campos no `Job` (`selectedInterestId` único, `hiredAt`, `completedAt`). Um CHECK no banco mantém estado e campos coerentes. A seleção na API (etapa 8) usa `UPDATE ... WHERE status IN (PUBLISHED, NEGOTIATING)` em transação: só uma requisição simultânea vence |
| "Em negociação" | Automático no 1º interessado (etapa 6); a oportunidade segue aceitando interessados até a seleção |
| Usuário | Tabela única do Better Auth, estendida com `phone`, `city`, `avatarUrl` e `adultConfirmedAt` (declaração 18+). O telefone é privado: nunca entra em respostas públicas nem em listas de interessados |
| Valor | `proposedPriceCents` (inteiro, em centavos), evita erro de arredondamento |
| Local | `city` e `state` (2 letras) em texto |
| Conversa | Uma por interesse (`interestId` único), o que evita conversas duplicadas entre as mesmas pessoas na mesma oportunidade |
| IDs | UUID v7 nas tabelas do Freelah; o Better Auth gera os ids das tabelas de autenticação |
| Administradores | Definidos pela variável `ADMIN_EMAILS` (sem coluna de papel no banco) |
| Expiração | Estado `EXPIRED` aplicado pela API (etapa 5) com base em `expiresAt` |
| Marcador de demonstração | `isDemo` em `User` e `Job` (PRD 38.2); o seed de demonstração (etapa 10) marca tudo com `true` e a interface mostra o selo "Demonstração" |
| Bancos por ambiente | Neon (branch `production`, URL só em `apps/api/.env.neon`, comandos `*:neon`) para a equipe; PostgreSQL local (`embedded-postgres`, PG 17, porta 54329) para demonstração offline e testes. Mesmo schema e migrações, sem sincronização; a `DATABASE_URL` escolhe o banco |
| Testes | Usam só `apps/api/.env.test`, por padrão um banco local `freelah_test`. Recusam o mesmo banco do `.env` e bancos remotos sem `ALLOW_REMOTE_TEST_DB=1`. Apagam os dados a cada teste |

## Decisões da autenticação (etapa 2)

| Tema | Decisão |
|---|---|
| Biblioteca | Better Auth 1.7.6 (adaptador do Prisma 7, Express 5 e plugin do Expo, todos na mesma versão). Compatibilidade confirmada na documentação oficial e nos testes. Sem Neon Auth: o Neon é usado só como PostgreSQL |
| Cadastro | Nome, e-mail, senha, telefone, cidade e declaração 18+, validados com o mesmo schema Zod no app e na API (hook `before` do Better Auth). A data da declaração é gravada pelo servidor |
| E-mail | Sem verificação de e-mail e sem recuperação de senha (sem provedor de e-mail); o cadastro já entra logado |
| Sessão | Cookie HttpOnly na Web; SecureStore no celular. CORS com credenciais só para as origens configuradas |
| Proteção CSRF | Verificação de origem fixada como **ligada** em `advanced.disableOriginCheck`, porque o Better Auth a desliga sozinho quando `NODE_ENV=test` (os testes precisam se comportar como a produção) |
| Telemetria | Desligada, para funcionar offline e não enviar dados para fora |
| Rota protegida | `requireAuth` + `GET /me`. As demais rotas protegidas (etapas seguintes) reutilizam o middleware |
| Cookies entre domínios | Web e API em `localhost` (portas diferentes) são o mesmo site. No deploy, se ficarem em domínios diferentes, será preciso rever `SameSite`/`Secure` (etapa 10) |

## Fora do escopo do protótipo (PRD seção 35)

Pagamentos e carteira, comissão, verificação facial e de identidade, reputação e avaliações, recomendação, mapa, notificações push, múltiplos idiomas, painel administrativo completo, antifraude.

## Hospedagem (a decidir após o app funcionar localmente)

Critérios: risco de inicialização lenta no plano gratuito, limites gratuitos, API sempre disponível e **cookie de sessão da Web**. Se a Web e a API ficarem em domínios diferentes, alguns navegadores (Safari) podem bloquear o cookie. O ideal é servir a API sob o mesmo domínio da Web. As opções serão comparadas na etapa 10.

## Segurança (resumo do que vale desde o início)

- Credenciais apenas em variáveis de ambiente; `.env*` fora do Git (só `.env.example`).
- A API é a autoridade: valida dados, propriedade dos registros e transições de estado.
- O telefone do usuário é privado e nunca aparece em respostas públicas.
