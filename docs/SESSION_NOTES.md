# Notas de sessão

Checkpoint das etapas 1 e 2 em 2026-10-09; atualizado em 2026-10-11 com a etapa 3 em andamento. Este arquivo resume onde o projeto parou para quem retomar o trabalho. Os requisitos continuam no [PRD](PRD.md), o andamento por etapa em [roadmap.md](roadmap.md) e as instruções de instalação no [README](../README.md). Não há credenciais aqui.

## Estado atual

| Etapa | Situação |
|---|---|
| 0. Fundação técnica | Concluída |
| 1. Banco de dados (Prisma 7 + PostgreSQL) | Concluída |
| 2. Autenticação (Better Auth) | Concluída na API e na Web; **falta conferir a sessão no celular (Expo Go)** |
| 4. Explorar (primeira fatia) | **Implementada e verificada na Web**: categorias, lista, busca, filtros, detalhes e Home mínima (veja "Exploração" abaixo); faltam abas e identidade visual |
| 3. Preferências, onboarding e navegação | **Em andamento**: contrato compartilhado, API de preferências e camada de armazenamento local prontos e verificados; o restante está pendente (veja abaixo) |
| 4 em diante | Não iniciadas |

**Banco de dados**
- Schema e migração inicial (`20261009000000_init`) aplicados no Neon (branch `production`) e no PostgreSQL local. Cada um tem as 14 tabelas e as 5 categorias do MVP, e **nenhum usuário**.
- Regras de integridade no banco (CHECK): preferências com ao menos uma opção ativa, valor não negativo, formato do horário, coerência da contratação, denúncia com alvo e bloqueio de si mesmo. Contratação única por oportunidade garantida por campo único e por UPDATE condicional (a ser usado na etapa 8).
- `isDemo` existe em `User` e `Job` para marcar dados de demonstração.

**Autenticação**
- Cadastro (nome, e-mail, senha, telefone, cidade e declaração de 18 anos ou mais), login, logout, `GET /me` e o middleware `requireAuth`. Telas `/entrar` e `/cadastrar` no app.
- O telefone é privado: só aparece no `GET /me`, para o dono da conta.
- Sem verificação de e-mail e sem recuperação de senha (não há provedor de e-mail).

**Preferências de uso (etapa 3: backend, armazenamento local e sincronização)**
- Contrato em `packages/shared/src/preferences.ts` e rotas em `apps/api/src/routes/preferences.ts`: `GET /me/preferences` (devolve `{ preferences: null }` se a conta ainda não escolheu) e `PUT /me/preferences` (grava só as preferências do usuário da sessão).
- Rejeita com 400 as duas opções desativadas (`at_least_one_required`) e campos desconhecidos, inclusive `userId` (`validation_error`). Mensagens em português; resposta com `Cache-Control: no-store`.
- Preferências não são permissões: a rota só toca em `UserPreference` e os testes provam que publicações, interesses, conversas e perfil não mudam.
- `createApp` exige o Prisma sempre que recebe a autenticação (sobrecargas de tipo), para que a rota nunca fique indisponível em silêncio.
- **Armazenamento local** (`packages/shared/src/preferences-storage.ts`): interface `LocalPreferencesStore` (`read`, `save`, `clear`) sobre `localStorage` (Web) e `expo-secure-store` (celular), sem dependência nova. A lógica e os adaptadores ficam em `shared` e recebem as dependências por parâmetro; `apps/mobile/src/features/preferences/localPreferences.ts` só escolhe o backend real por `Platform.OS`. Grava o JSON do contrato na chave `freelah.preferences` e não toca nas chaves do Better Auth.
- Erros explícitos: `read` devolve `null` só se nada foi gravado; dado inválido lança `invalid_data` e **não é apagado automaticamente**; falhas lançam `unavailable`, `read_failed` ou `write_failed`. `save` valida antes de acessar o armazenamento e rejeita se a gravação falhar.
- **Sincronização com a conta** (feita): `preferences-api.ts` (cliente de `GET`/`PUT /me/preferences` com `fetch` injetado; erros `network`, `unauthorized`, `server`, `rejected`, `invalid_response`, nunca `null`) e `preferences-sync.ts` (`syncPreferences` e o controlador com estado, compatível com `useSyncExternalStore`), ambos em `packages/shared`. No app: `preferencesApi.ts` (fetch real: `credentials: "include"` na Web; no celular `Cookie` de `authClient.getCookie()` com `credentials: "omit"`; prazo de 8 s), `preferencesSync.ts` (controlador único) e `PreferencesSyncProvider.tsx` (envolve o `Stack` em `_layout.tsx` e liga a sessão ao controlador; `usePreferencesSync()`).
- Regras: o `GET` da conta vem primeiro (se falhar, nada local muda). Conta com preferências prevalece e atualiza o local; conta sem preferências e local válido: `PUT` com o local; nada em lugar nenhum: estado `needs_onboarding`. Falha de rede/API nunca vira `needs_onboarding` nem sobrescreve a conta. Só é "sincronizado" depois de todas as operações terminarem.
- Dado local inválido ou ilegível: estado `error` (origem "este aparelho"), nada é apagado nem enviado; se a conta tinha preferências, elas vêm anexadas ao erro (`accountPreferences`). Falha ao gravar o local: `error` `write_failed`, também com as da conta.
- Logout/sessão expirada (só com sessão resolvida e sem erro; carregando não conta): a cópia local é apagada **somente se a sincronização daquele usuário tinha terminado com sucesso**; senão é preservada. Se o apagamento falhar, o próximo usuário não herda nem envia nada (erro até conseguir apagar). Execuções atrasadas de uma sessão anterior são ignoradas e as execuções são enfileiradas (a nova espera a anterior; no máximo o prazo de 8 s).
- **Onboarding** (feito): `PreferencesScreen.tsx` (`OnboardingScreen`, `InvalidLocalRecovery`, `LocalStorageError`, `PreferencesLoading`) e `preferencesScreenFor()` em `PreferencesSyncProvider.tsx`. As telas substituem **somente o conteúdo da tela inicial `/`** (`/entrar` e `/cadastrar` continuam acessíveis; o onboarding do visitante tem o atalho "Já tenho conta — Entrar" e o de quem tem sessão tem "Sair"). Pergunta "Como você quer usar o Freelah?", duas opções independentes ("Encontrar trabalho", "Contratar alguém"), "Continuar" desabilitado sem seleção (PRD 8.1).
- Controlador estendido: modo **visitante** (`startVisitor()`: só lê o armazenamento local, nunca chama a API; estados `visitor_loading`, `visitor_ready`, `visitor_needs_onboarding`, `visitor_error`), `complete(preferences)` (visitante: grava só no local, sem conta anônima; com sessão: `PUT` e depois grava no local, só então `synced`; chamada duplicada ignorada) e `resolveInvalidLocal("use_account" | "discard")` (sempre por ação explícita; "descartar" pede confirmação que explica a consequência). Se o `PUT` der certo e a gravação local falhar, o estado é `error` com as preferências já salvas e a tela inicial diz que foram salvas na conta mas não neste aparelho. Todas as operações passam por uma fila, e resultados atrasados, logout e troca de usuário seguem as mesmas proteções da sincronização.
- Tela inicial provisória: linha temporária "Preferências (temporário)" agora também para visitantes (mostra a escolha deste aparelho), com o status e o botão "Tentar sincronizar de novo". **Remover quando a tela for substituída (etapa 4).**
- **Limitação aceita (MVP):** corrida entre dois aparelhos no primeiro login (`GET` sem preferências, outro aparelho grava, nosso `PUT` sobrescreve). Evitá-la exigiria "criar só se não existir" no backend.

**Exploração (etapa 4, primeira fatia; PRD 9, 11, 12, 13, 29.2 a 29.4)**
- **API pública (sem login)**, em `apps/api/src/routes/jobs.ts`: `GET /categories` (só ativas), `GET /jobs` e `GET /jobs/:id`. Respostas com `Cache-Control: no-store`. Nenhuma migração: o schema atual bastou.
- `GET /jobs`: só oportunidades `PUBLISHED` ou `NEGOTIATING` com `expiresAt` no futuro, `publishedAt` preenchido e categoria ativa. Busca (`q`): cada palavra (até 5) precisa aparecer no título, na descrição ou no nome da categoria, sem diferenciar maiúsculas e **sem tratar `%`, `_` e `\` como curingas** (escape do LIKE; um defeito real encontrado nos testes). Filtros: `category` (slug), `city` (parte do nome), `minPriceCents`, `maxPriceCents`, combináveis. Ordem por `publishedAt` e `id` decrescentes, paginação por cursor opaco (`limit` 1 a 50, padrão 20) estável mesmo com datas iguais. Parâmetros inválidos: 400 em português.
- `GET /jobs/:id`: abre qualquer oportunidade não rascunho, inclusive cancelada, contratada, concluída ou expirada, com `acceptingInterests` e `statusMessage` explicando o motivo (PRD 13.4). Rascunho, id malformado ou inexistente: 404. Do contratante saem só nome e cidade (nunca telefone, e-mail ou id). "Expirada" é calculada no servidor (`expiresAt` vencido); **nenhuma rotina grava esse estado ainda** (etapa 5).
- **Contrato** em `packages/shared/src/jobs.ts` (consulta, respostas, estados, formatadores de valor e data) e cliente com controladores de estado em `jobs-client.ts` (lista paginada, recurso único): descarta resposta antiga, não repete requisição para filtros iguais, não duplica itens e nunca transforma erro em lista vazia. `navigation.ts` valida o destino de retorno depois do login (só caminho interno do app).
- **App**: `/explorar` (busca com debounce de 350 ms, chips de categoria, cidade e faixa de valor, "Carregar mais", estados carregando, vazio e erro com "Tentar de novo"), `/oportunidades/[id]` (detalhe completo, avisos de estado, selo "Demonstração") e Home mínima (busca, atalhos, categorias e quatro recentes). A preferência só reordena "Encontrar trabalho" e "Publicar oportunidade" (os dois ficam visíveis). "Publicar" aparece desabilitado ("em breve").
- **Ação protegida**: "Tenho interesse" leva o visitante a `/entrar?redirect=...` (e `/cadastrar` mantém o destino); depois da autenticação ele volta ao detalhe. Com sessão o botão fica desabilitado com "em breve": **o registro de interesse não existe ainda** (etapa 6).
- **Dados de demonstração**: `npm run db:seed:demo -w @freelah/api` (idempotente, só banco local; recusa qualquer URL remota e **não existe versão para o Neon**). Cria 3 contratantes e 1 trabalhador fictícios (sem senha, e-mails `@demo.freelah.invalid`) e 14 oportunidades `isDemo`: 10 visíveis nas 5 categorias (Cataguases, Leopoldina, Muriaé) e 4 escondidas de propósito (cancelada, prazo vencido, contratada e rascunho). Datas relativas ao momento da execução.

**Ambientes de banco** (mesmo schema e mesmas migrações; a `DATABASE_URL` escolhe o banco)
- Local (padrão, funciona sem internet): `npm run db:local -w @freelah/api` (PostgreSQL 17 embutido no `node_modules`).
- Neon (equipe): arquivo `apps/api/.env.neon` e comandos `db:deploy:neon`, `db:seed:neon` e `dev:api:neon`.
- Testes: banco local `freelah_test`, configurado em `apps/api/.env.test`. Nunca rodam contra o banco do `.env` nem contra o do `.env.neon`.

## Testes (última execução, `npm run check`)

- Lint e typecheck sem erros.
- API: 6 arquivos, 79 testes passando (integração com banco real: cadastro, 18+, duplicidade, sessão, CSRF, regras do banco e as 18 de preferências: autenticação, leitura, gravação, persistência após sair e entrar, gravações simultâneas, validação, isolamento entre usuários e dados que não mudam).
- Pacote compartilhado: 6 arquivos, 162 testes passando (9 do contrato, 51 do armazenamento local, 20 do cliente da API e 66 da sincronização e do onboarding: conta com preferências e local divergente, conta sem preferências, ausência em ambos, falhas de rede/API/PUT, local inválido ou ilegível, falha ao gravar o local, cancelamento, repetição, logout, troca de usuário e falha ao apagar a cópia). Defeitos introduzidos de propósito (erro tratado como "sem preferências", sem apagar no logout, sobrescrever dado inválido, ignorar cancelamento, ignorar a limpeza) foram detectados pelos testes.
- Exploração: **API** com 45 testes de integração no banco local isolado (visibilidade por estado e prazo, categoria inativa, ordem, paginação com datas iguais e com publicação nova no meio, busca por título, descrição e categoria, curingas literais, injeção de texto, filtros combinados, 12 casos de parâmetros inválidos, detalhe por estado, rascunho e ids inválidos, ausência de telefone e e-mail) mais 5 testes dos dados de demonstração. **Shared**: 44 do contrato, 27 do cliente e controladores, 24 do destino de retorno. Dez defeitos introduzidos de propósito (sem escape do LIKE, cursor sem desempate, detalhe de rascunho, sem filtro de prazo, vazamento do contratante, categoria inativa, resposta antiga vencendo, erro virando lista vazia, carregar mais duplicado, sem remoção de duplicados) foram detectados.
- Exploração no Chromium (Playwright temporário fora do projeto, API real e banco local com o seed de demonstração): 74 checagens passando. Visitante novo (onboarding, Home, categorias, recentes, ordem por preferência), Explorar (10 abertas e nenhuma escondida, categoria, busca, cidade, faixa de valor, valores inválidos, vazio, limpar), Home para Explorar, paginação com limite 3 (cursor, sem repetir, falha e tentar de novo), detalhes (campos, formatos, estados não abertos por link, rascunho e ids inválidos, sem dados privados na tela nem na rede), login e cadastro com retorno ao detalhe, destino externo ignorado, API fora do ar, erro 500, carregamento, vazio e resposta antiga que não sobrescreve a nova. O onboarding (65 checagens) foi reexecutado e continua passando. Contas de teste removidas.
- Os bundles Web, iOS e Android da exploração compilam no Metro (HTTP 200); iOS e Android **não foram executados**.
- Onboarding no Chromium (Playwright temporário fora do projeto) contra a API real e o banco local: 65 checagens passando — visitante (pergunta e texto do PRD, "Continuar" desabilitado, cada opção e ambas, nenhuma requisição à API, persistência após recarregar), visitante que depois entra (conta com preferências prevalece; conta sem preferências recebe a local), logado sem nada (onboarding, duplo clique = um `PUT`, recarregar sem onboarding), `PUT` com erro 500 e nova tentativa, `PUT` salvo com gravação local falhando, rede caída (erro, não onboarding), dado local inválido (visitante e logado, com e sem preferências na conta: nada apagado sozinho, confirmação, cancelar, usar as da conta, descartar), `localStorage` bloqueado, troca de usuário, "Sair" e o atalho para `/entrar`. 22 contas de teste criadas e removidas (0 restantes). A checagem encontrou um defeito real, corrigido: `accessibilityState.checked` não gerava `aria-checked` na Web (acrescentado `aria-checked`). Cinco defeitos introduzidos de propósito no controlador foram detectados pelos testes unitários.
- Sincronização integrada no Chromium (Playwright temporário fora do projeto) contra a API real e o banco local, com contas de teste criadas e removidas depois (11 contas, 0 restantes): 37 checagens passando — conta com preferências + local divergente (só `GET`, local atualizado), conta sem preferências + local válido (`GET`, `PUT`), nada em lugar nenhum, rede derrubada (erro, local preservado, conta intacta, "tentar de novo" conclui), `GET` e `PUT` com 500, dado inválido (com e sem preferências na conta, sem apagar nem enviar), falha ao gravar o local, recarregar (um `GET`), logout (apaga só se sincronizado), troca de usuário (B não herda as de A) e visitante sem requisições. Os bundles Web, iOS e Android compilam no Metro.
- Armazenamento local compilado pelo Metro para Web, iOS e Android (HTTP 200 nos três bundles) e executado de verdade no Chromium (script temporário fora do projeto): 18 passos passando (JSON exato no `localStorage`, persistência após recarregar, dado corrompido sem virar `null` nem ser apagado, cota estourada, `localStorage` bloqueado e chaves de outras partes intactas).
- Verificação manual das rotas de preferências por HTTP contra a API real e o banco local (401, `null`, gravação, os dois erros 400 e o cabeçalho), com limpeza dos dados de teste.
- Interface na Web (Chromium via Playwright, script temporário fora do projeto): 14 passos passando (cadastro, validações, sessão após recarregar, sair, login e erros em português).
- Chamadas do app nativo simuladas por HTTP (`expo-origin`, origem `exp://` e cookie reenviado): aceitas.

## Pendências

**Exploração (ainda não feito):** abas e navegação final (PRD 30), identidade visual, imagens, ordenação escolhida pelo usuário, busca sem acento (exigiria a extensão `unaccent`), seed de demonstração no Neon (só se for pedido), rotina que grave `EXPIRED`, layout conferido em celular real (só a Web foi executada, em 420 px de largura), acessibilidade com leitor de tela.

**Etapa 3 (ainda não feito):** configurações ("Preferências de uso") e abas por preferência com placeholders "Em breve".

**Limitações ainda não verificadas na etapa 3:**
- A API e a sincronização de preferências não foram exercitadas contra o Neon (só contra o banco local).
- A sincronização só foi executada na Web (Chromium). No celular (cookie manual + SecureStore) só há compilação dos bundles e testes com fakes; falta conferir no Expo Go.
- **O SecureStore real não foi testado em aparelho nem no Expo Go.** O caminho do celular foi verificado apenas com fakes nos testes unitários e pela compilação dos bundles iOS e Android; o runtime nativo só poderá ser conferido no Expo Go.
- **iOS:** o SecureStore usa o Keychain, que pode sobreviver à desinstalação do app. Uma preferência antiga pode reaparecer depois de reinstalar. O onboarding deve considerar isso (por exemplo, tratar preferência local antiga ao sincronizar com a conta).
- Dado inválido guardado no aparelho (`invalid_data`) nunca é apagado automaticamente: só por ação explícita na tela de recuperação.
- Onboarding só foi executado na Web (Chromium). No celular há compilação dos bundles e testes com fakes; falta conferir no Expo Go (incluindo o SecureStore e o cookie manual).

**Pendências gerais:**

1. **Sessão no celular:** testar no Expo Go (SecureStore): criar conta, fechar e reabrir o app, e confirmar que continua logado. Exige `EXPO_PUBLIC_API_URL` com o IP do computador em `apps/mobile/.env`.
2. **API contra o Neon:** `npm run dev:api:neon` ainda não foi exercitada com cadastro (nenhum usuário foi gravado no banco compartilhado).
3. **Branch `test` do Neon:** não existe e é opcional (o banco de teste local é o padrão).
4. **Ensaio offline:** rodar a demonstração no computador da apresentação com o Wi-Fi desligado (README, seção "Demonstração sem internet"). O `embedded-postgres` ainda não foi testado nessa máquina; o plano B é o instalador oficial do PostgreSQL.
5. **Equipe:** cada integrante precisa criar o próprio `apps/api/.env` com um `BETTER_AUTH_SECRET` próprio e, se for usar o Neon, o próprio `apps/api/.env.neon`.
6. **Skills do Neon** em `.claude/skills/` e `skills-lock.json`: ficam fora do Git (ignorados). Reinstalam-se com `npx neon@latest skills -s neon -s neon-postgres -y`, mas orientam o uso de Neon Auth e Functions, que não fazem parte da stack aprovada.
7. **Deploy:** hospedagem e cookies entre domínios (`SameSite`/`Secure`) serão decididos na etapa 10.

## Próximos passos

1. **Etapa 3, próximas fatias:** (c) configurações (alterar preferências, PRD 8.5; reaproveitar `complete`); (d) abas por preferência com placeholders (PRD seções 8 e 30.3).
2. **Etapa 4:** Home, Explorar, busca, filtros, detalhes públicos e identidade visual.
3. Seguir o [roadmap](roadmap.md) até a etapa 10, sempre com funcionalidades completas (tela, API, persistência, autorização e testes), como pede o PRD.

## Como retomar o trabalho

```bash
npm install
# crie apps/api/.env a partir do .env.example (DATABASE_URL e BETTER_AUTH_SECRET)
npm run db:local -w @freelah/api        # terminal 1: banco local (deixe aberto)
npm run db:deploy -w @freelah/api       # uma vez: tabelas
npm run db:seed -w @freelah/api         # uma vez: categorias
npm run db:seed:demo -w @freelah/api    # opcional: oportunidades de demonstração (só banco local)
npm run dev:api                         # terminal 2: API em http://localhost:3333
npm run dev:web                         # terminal 3: app em http://localhost:8081
npm run check                           # lint + typecheck + testes
```

Regras de segurança que valem sempre: credenciais só em arquivos `.env*` ignorados pelo Git; nenhum comando destrutivo ou reset aponta para o Neon (não existem scripts para isso); os testes apagam todos os dados do banco que usam, por isso só aceitam o banco de teste.
