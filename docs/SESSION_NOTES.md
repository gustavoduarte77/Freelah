# Notas de sessão

Checkpoint das etapas 1 e 2 em 2026-10-09; atualizado em 2026-10-11 com o início da etapa 3. Este arquivo resume onde o projeto parou para quem retomar o trabalho. Os requisitos continuam no [PRD](PRD.md), o andamento por etapa em [roadmap.md](roadmap.md) e as instruções de instalação no [README](../README.md). Não há credenciais aqui.

## Estado atual

| Etapa | Situação |
|---|---|
| 0. Fundação técnica | Concluída |
| 1. Banco de dados (Prisma 7 + PostgreSQL) | Concluída |
| 2. Autenticação (Better Auth) | Concluída na API e na Web; **falta conferir a sessão no celular (Expo Go)** |
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

**Preferências de uso (etapa 3: backend e armazenamento local)**
- Contrato em `packages/shared/src/preferences.ts` e rotas em `apps/api/src/routes/preferences.ts`: `GET /me/preferences` (devolve `{ preferences: null }` se a conta ainda não escolheu) e `PUT /me/preferences` (grava só as preferências do usuário da sessão).
- Rejeita com 400 as duas opções desativadas (`at_least_one_required`) e campos desconhecidos, inclusive `userId` (`validation_error`). Mensagens em português; resposta com `Cache-Control: no-store`.
- Preferências não são permissões: a rota só toca em `UserPreference` e os testes provam que publicações, interesses, conversas e perfil não mudam.
- `createApp` exige o Prisma sempre que recebe a autenticação (sobrecargas de tipo), para que a rota nunca fique indisponível em silêncio.
- **Armazenamento local** (`packages/shared/src/preferences-storage.ts`): interface `LocalPreferencesStore` (`read`, `save`, `clear`) sobre `localStorage` (Web) e `expo-secure-store` (celular), sem dependência nova. A lógica e os adaptadores ficam em `shared` e recebem as dependências por parâmetro; `apps/mobile/src/features/preferences/localPreferences.ts` só escolhe o backend real por `Platform.OS`. Grava o JSON do contrato na chave `freelah.preferences` e não toca nas chaves do Better Auth.
- Erros explícitos: `read` devolve `null` só se nada foi gravado; dado inválido lança `invalid_data` e **não é apagado automaticamente**; falhas lançam `unavailable`, `read_failed` ou `write_failed`. `save` valida antes de acessar o armazenamento e rejeita se a gravação falhar.
- **Ainda não é usada por nenhuma tela**: a integração vem com a sincronização e o onboarding.

**Ambientes de banco** (mesmo schema e mesmas migrações; a `DATABASE_URL` escolhe o banco)
- Local (padrão, funciona sem internet): `npm run db:local -w @freelah/api` (PostgreSQL 17 embutido no `node_modules`).
- Neon (equipe): arquivo `apps/api/.env.neon` e comandos `db:deploy:neon`, `db:seed:neon` e `dev:api:neon`.
- Testes: banco local `freelah_test`, configurado em `apps/api/.env.test`. Nunca rodam contra o banco do `.env` nem contra o do `.env.neon`.

## Testes (última execução, `npm run check`)

- Lint e typecheck sem erros.
- API: 6 arquivos, 79 testes passando (integração com banco real: cadastro, 18+, duplicidade, sessão, CSRF, regras do banco e as 18 de preferências: autenticação, leitura, gravação, persistência após sair e entrar, gravações simultâneas, validação, isolamento entre usuários e dados que não mudam).
- Pacote compartilhado: 4 arquivos, 76 testes passando (9 do contrato de preferências e 51 do armazenamento local: leitura, ida e volta, remoção, dados inválidos, falhas, comportamento da Web e do SecureStore e isolamento das chaves). Três defeitos introduzidos de propósito no módulo foram detectados pelos testes.
- Armazenamento local compilado pelo Metro para Web, iOS e Android (HTTP 200 nos três bundles) e executado de verdade no Chromium (script temporário fora do projeto): 18 passos passando (JSON exato no `localStorage`, persistência após recarregar, dado corrompido sem virar `null` nem ser apagado, cota estourada, `localStorage` bloqueado e chaves de outras partes intactas).
- Verificação manual das rotas de preferências por HTTP contra a API real e o banco local (401, `null`, gravação, os dois erros 400 e o cabeçalho), com limpeza dos dados de teste.
- Interface na Web (Chromium via Playwright, script temporário fora do projeto): 14 passos passando (cadastro, validações, sessão após recarregar, sair, login e erros em português).
- Chamadas do app nativo simuladas por HTTP (`expo-origin`, origem `exp://` e cookie reenviado): aceitas.

## Pendências

**Etapa 3 (ainda não feito):** sincronização no primeiro login, tela de onboarding, configurações ("Preferências de uso"), abas por preferência com placeholders "Em breve" e o cliente do app para as rotas.

**Limitações ainda não verificadas na etapa 3:**
- A API de preferências não foi exercitada contra o Neon (só contra o banco local) e nenhuma tela do app consome as rotas ainda.
- **O SecureStore real não foi testado em aparelho nem no Expo Go.** O caminho do celular foi verificado apenas com fakes nos testes unitários e pela compilação dos bundles iOS e Android; o runtime nativo só poderá ser conferido quando uma tela usar o armazenamento.
- **iOS:** o SecureStore usa o Keychain, que pode sobreviver à desinstalação do app. Uma preferência antiga pode reaparecer depois de reinstalar. O onboarding deve considerar isso (por exemplo, tratar preferência local antiga ao sincronizar com a conta).
- Dado inválido guardado no aparelho (`invalid_data`) não é apagado automaticamente: o onboarding/sincronização precisa decidir explicitamente quando chamar `clear()`.

**Pendências gerais:**

1. **Sessão no celular:** testar no Expo Go (SecureStore): criar conta, fechar e reabrir o app, e confirmar que continua logado. Exige `EXPO_PUBLIC_API_URL` com o IP do computador em `apps/mobile/.env`.
2. **API contra o Neon:** `npm run dev:api:neon` ainda não foi exercitada com cadastro (nenhum usuário foi gravado no banco compartilhado).
3. **Branch `test` do Neon:** não existe e é opcional (o banco de teste local é o padrão).
4. **Ensaio offline:** rodar a demonstração no computador da apresentação com o Wi-Fi desligado (README, seção "Demonstração sem internet"). O `embedded-postgres` ainda não foi testado nessa máquina; o plano B é o instalador oficial do PostgreSQL.
5. **Equipe:** cada integrante precisa criar o próprio `apps/api/.env` com um `BETTER_AUTH_SECRET` próprio e, se for usar o Neon, o próprio `apps/api/.env.neon`.
6. **Skills do Neon** em `.claude/skills/` e `skills-lock.json`: ficam fora do Git (ignorados). Reinstalam-se com `npx neon@latest skills -s neon -s neon-postgres -y`, mas orientam o uso de Neon Auth e Functions, que não fazem parte da stack aprovada.
7. **Deploy:** hospedagem e cookies entre domínios (`SameSite`/`Secure`) serão decididos na etapa 10.

## Próximos passos

1. **Etapa 3, próximas fatias:** (a) cliente do app para as rotas e sincronização no primeiro login (conta sem preferências recebe as locais; conta com preferências prevalece; o onboarding só aparece sem preferências locais nem na conta); (b) tela de onboarding; (c) configurações; (d) abas por preferência com placeholders (PRD seções 8 e 30.3).
2. **Etapa 4:** Home, Explorar, busca, filtros, detalhes públicos e identidade visual.
3. Seguir o [roadmap](roadmap.md) até a etapa 10, sempre com funcionalidades completas (tela, API, persistência, autorização e testes), como pede o PRD.

## Como retomar o trabalho

```bash
npm install
# crie apps/api/.env a partir do .env.example (DATABASE_URL e BETTER_AUTH_SECRET)
npm run db:local -w @freelah/api        # terminal 1: banco local (deixe aberto)
npm run db:deploy -w @freelah/api       # uma vez: tabelas
npm run db:seed -w @freelah/api         # uma vez: categorias
npm run dev:api                         # terminal 2: API em http://localhost:3333
npm run dev:web                         # terminal 3: app em http://localhost:8081
npm run check                           # lint + typecheck + testes
```

Regras de segurança que valem sempre: credenciais só em arquivos `.env*` ignorados pelo Git; nenhum comando destrutivo ou reset aponta para o Neon (não existem scripts para isso); os testes apagam todos os dados do banco que usam, por isso só aceitam o banco de teste.
