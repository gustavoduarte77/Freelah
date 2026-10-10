# Notas de sessão — checkpoint das etapas 1 e 2

Data: 2026-10-09. Este arquivo resume onde o projeto parou para quem retomar o trabalho. Os requisitos continuam no [PRD](PRD.md), o andamento por etapa em [roadmap.md](roadmap.md) e as instruções de instalação no [README](../README.md). Não há credenciais aqui.

## Estado atual

| Etapa | Situação |
|---|---|
| 0. Fundação técnica | Concluída |
| 1. Banco de dados (Prisma 7 + PostgreSQL) | Concluída |
| 2. Autenticação (Better Auth) | Concluída na API e na Web; **falta conferir a sessão no celular (Expo Go)** |
| 3 em diante | Não iniciadas |

**Banco de dados**
- Schema e migração inicial (`20261009000000_init`) aplicados no Neon (branch `production`) e no PostgreSQL local. Cada um tem as 14 tabelas e as 5 categorias do MVP, e **nenhum usuário**.
- Regras de integridade no banco (CHECK): preferências com ao menos uma opção ativa, valor não negativo, formato do horário, coerência da contratação, denúncia com alvo e bloqueio de si mesmo. Contratação única por oportunidade garantida por campo único e por UPDATE condicional (a ser usado na etapa 8).
- `isDemo` existe em `User` e `Job` para marcar dados de demonstração.

**Autenticação**
- Cadastro (nome, e-mail, senha, telefone, cidade e declaração de 18 anos ou mais), login, logout, `GET /me` e o middleware `requireAuth`. Telas `/entrar` e `/cadastrar` no app.
- O telefone é privado: só aparece no `GET /me`, para o dono da conta.
- Sem verificação de e-mail e sem recuperação de senha (não há provedor de e-mail).

**Ambientes de banco** (mesmo schema e mesmas migrações; a `DATABASE_URL` escolhe o banco)
- Local (padrão, funciona sem internet): `npm run db:local -w @freelah/api` (PostgreSQL 17 embutido no `node_modules`).
- Neon (equipe): arquivo `apps/api/.env.neon` e comandos `db:deploy:neon`, `db:seed:neon` e `dev:api:neon`.
- Testes: banco local `freelah_test`, configurado em `apps/api/.env.test`. Nunca rodam contra o banco do `.env` nem contra o do `.env.neon`.

## Testes (última execução, `npm run check`)

- Lint e typecheck sem erros.
- API: 5 arquivos, 61 testes passando (inclui integração com banco real: cadastro, 18+, duplicidade, sessão, CSRF e as regras do banco).
- Pacote compartilhado: 2 arquivos, 16 testes passando.
- Interface na Web (Chromium via Playwright, script temporário fora do projeto): 14 passos passando (cadastro, validações, sessão após recarregar, sair, login e erros em português).
- Chamadas do app nativo simuladas por HTTP (`expo-origin`, origem `exp://` e cookie reenviado): aceitas.

## Pendências

1. **Sessão no celular:** testar no Expo Go (SecureStore): criar conta, fechar e reabrir o app, e confirmar que continua logado. Exige `EXPO_PUBLIC_API_URL` com o IP do computador em `apps/mobile/.env`.
2. **API contra o Neon:** `npm run dev:api:neon` ainda não foi exercitada com cadastro (nenhum usuário foi gravado no banco compartilhado).
3. **Branch `test` do Neon:** não existe e é opcional (o banco de teste local é o padrão).
4. **Ensaio offline:** rodar a demonstração no computador da apresentação com o Wi-Fi desligado (README, seção "Demonstração sem internet"). O `embedded-postgres` ainda não foi testado nessa máquina; o plano B é o instalador oficial do PostgreSQL.
5. **Equipe:** cada integrante precisa criar o próprio `apps/api/.env` com um `BETTER_AUTH_SECRET` próprio e, se for usar o Neon, o próprio `apps/api/.env.neon`.
6. **Skills do Neon** em `.claude/skills/` e `skills-lock.json`: ficam fora do Git (ignorados). Reinstalam-se com `npx neon@latest skills -s neon -s neon-postgres -y`, mas orientam o uso de Neon Auth e Functions, que não fazem parte da stack aprovada.
7. **Deploy:** hospedagem e cookies entre domínios (`SameSite`/`Secure`) serão decididos na etapa 10.

## Próximos passos

1. **Etapa 3:** onboarding de preferências ("Como você quer usar o Freelah?"), preferências locais antes do login e na conta depois, configurações e abas por preferência (PRD seção 8). A tabela `UserPreference` e a regra de "ao menos uma opção" já existem no banco.
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
