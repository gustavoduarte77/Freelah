# Freelah

Plataforma que conecta quem procura bicos, trabalhos temporários e renda extra com quem precisa contratar um serviço. Protótipo (MVP) para o Tech Summit Energisa.

> **Estado atual: etapa 2 (autenticação) concluída na API e na Web**; a sessão no celular (Expo Go) ainda precisa ser conferida em um aparelho. Banco com o mesmo schema no Neon (equipe) e no PostgreSQL local (demonstração offline). O app mostra o status da API; as funcionalidades do produto entram nas próximas etapas. Veja [docs/roadmap.md](docs/roadmap.md).

## Estrutura

```
apps/
  mobile/     App Expo (Android, iOS e Web) com Expo Router
  api/        API REST em Node.js + Express 5 + TypeScript
packages/
  shared/     Código compartilhado (validações Zod e tipos do contrato da API)
docs/         Roadmap e roteiro da demonstração
```

É um monorepo com npm workspaces. O `packages/shared` é consumido direto como TypeScript, sem etapa de compilação.

## Requisitos

- Node.js 22.12 ou superior (testado com 24) e npm 10+
- Para testar no celular: o app **Expo Go** (Android ou iOS), com o celular na mesma rede Wi-Fi do computador

## Instalação

```bash
npm install
cp .env.example apps/api/.env       # variáveis da API (preencha BETTER_AUTH_SECRET e DATABASE_URL)
cp .env.example apps/mobile/.env    # variável do app (EXPO_PUBLIC_API_URL)
```

Os arquivos `.env` **não são versionados**. O `.env.example` mostra quais variáveis existem e indica a qual app cada uma pertence (a API ignora as variáveis que não usa).

## Executar

Em dois terminais, a partir da raiz:

```bash
npm run dev:api     # API em http://localhost:3333  (teste: /health)
npm run dev:web     # app na Web em http://localhost:8081
```

Para o celular (Expo Go):

```bash
npm run dev:mobile  # mostra um QR code; escaneie com o Expo Go
```

### Expo Go no celular: API na rede local

No celular, `localhost` é o próprio celular. Defina em `apps/mobile/.env` o IP do computador:

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333
```

(descubra o IP com `ipconfig` no Windows) e reinicie o `npm run dev:mobile`. No Windows, permita a porta **3333** (e a 8081) no firewall quando for solicitado. A API já escuta em todas as interfaces de rede.

## Modo Demonstração Offline

Para apresentações sem API, banco nem internet: `npm run demo:web` e abrir http://localhost:8082 (conta `usuario@gmail.com` / `12345678`). Os dados são fictícios e o modo não existe no app normal. Detalhes em [docs/modo-demonstracao-offline.md](docs/modo-demonstracao-offline.md).

## Banco de dados (PostgreSQL + Prisma)

O Freelah usa PostgreSQL com o **mesmo schema e as mesmas migrações em todos os ambientes**. Quem escolhe o banco é só a variável `DATABASE_URL` de `apps/api/.env`; o código não muda.

| Ambiente | Banco | Quando usar |
|---|---|---|
| Desenvolvimento da equipe | Neon, branch `production` (`.env.neon`) | Dados compartilhados entre computadores diferentes |
| Demonstração offline e desenvolvimento sozinho | PostgreSQL local (`npm run db:local`) | Um único computador, sem internet |
| Testes automáticos | PostgreSQL local, banco `freelah_test` | Sempre. Os testes **apagam todos os dados** do banco usado |

Não há sincronização entre os bancos: cada um é independente.

### PostgreSQL local (sem instalar nada)

O pacote `embedded-postgres` traz o PostgreSQL 17 dentro do `node_modules` (cerca de 100 MB). Os dados ficam em `apps/api/.local-db/`, fora do Git.

```bash
npm run db:local -w @freelah/api   # inicia o banco; deixe o terminal aberto (Ctrl+C encerra)
```

Na primeira execução ele cria os bancos `freelah_local` (uso diário e demonstração) e `freelah_test` (testes) e mostra as URLs. Coloque cada uma no arquivo correspondente:

- `apps/api/.env` → `DATABASE_URL=postgresql://freelah:freelah@127.0.0.1:54329/freelah_local?sslmode=disable`
- `apps/api/.env.test` → `DATABASE_URL=postgresql://freelah:freelah@127.0.0.1:54329/freelah_test?sslmode=disable`

(Essa senha é descartável: vale só para o banco local, que escuta apenas em 127.0.0.1.) Em outro terminal, com o banco no ar:

```bash
npm run db:deploy -w @freelah/api        # cria as tabelas
npm run db:seed -w @freelah/api          # cadastra as 5 categorias (pode repetir sem duplicar)
npm run db:migrate:test -w @freelah/api  # cria as tabelas no banco de testes
npm run db:reset:local -w @freelah/api   # (quando quiser) apaga os dados locais e recarrega as categorias
```

O `db:reset:local` **se recusa a rodar** se a `DATABASE_URL` não for de `localhost`/`127.0.0.1`, então nunca atinge o Neon.

### Neon (desenvolvimento compartilhado)

A URL do Neon fica **somente** em `apps/api/.env.neon` (ignorado pelo Git; cada integrante tem o seu, compartilhado por um canal seguro, nunca pelo Git ou pelo chat). O `.env` local não muda, e o PostgreSQL local continua sendo o padrão. Para preencher:

1. Em console.neon.tech, abra o projeto do Freelah e o branch `production`.
2. Clique em **Connect** e **desmarque Connection pooling** (precisa ser a conexão direta, sem `-pooler` no endereço).
3. Copie a string de conexão e cole em `apps/api/.env.neon`, na linha `DATABASE_URL=`.

Os comandos do Neon têm sufixo `:neon` e só leem o `.env.neon`:

```bash
npm run db:deploy:neon -w @freelah/api   # aplica as migrações (nunca apaga dados)
npm run db:seed:neon -w @freelah/api     # cadastra as categorias (pode repetir)
npm run dev:api:neon                     # API de desenvolvimento usando o Neon
```

Antes de cada um, o lançador (`scripts/with-env.ts`) valida a URL, recusa conexão com `-pooler` ou banco local e mostra só o endereço e o nome do banco, sem usuário, senha ou parâmetros. Ele também sobrescreve qualquer `DATABASE_URL` já definida no terminal. Não existe reset nem `migrate dev` para o Neon: as migrações são criadas no banco local (`db:migrate`) e só depois aplicadas no Neon com `db:deploy:neon`. Se o driver reclamar de `channel_binding`, remova `&channel_binding=require` da URL.

### Como os testes ficam isolados

Os testes de integração leem **somente** `apps/api/.env.test` e se recusam a rodar se:
- o banco de teste for o mesmo de **qualquer outro** arquivo `.env*` (`.env`, `.env.neon`...), inclusive pela conexão com pooler do mesmo branch; ou
- o banco de teste for remoto (Neon) sem `ALLOW_REMOTE_TEST_DB=1` no próprio `.env.test`. Mesmo com a permissão, o banco do `.env.neon` é sempre recusado. O branch `test` do Neon (ainda não criado) é uma reserva opcional e deve ser usado por uma pessoa por vez.

Sem `.env.test`, esses testes são pulados. O `prisma generate` roda sozinho antes de `dev`, `test` e `typecheck`.

### Alterar o schema

Edite `apps/api/prisma/schema.prisma` e rode `npm run db:migrate -w @freelah/api` (cria a migração e aplica no banco de `.env`). As regras `CHECK`, que o Prisma não expressa, ficam no SQL da migração.

### Demonstração sem internet

Prepare o computador da apresentação **com internet, antes do evento**:

1. Copie o projeto ou clone e rode `npm ci` (o `node_modules` precisa estar completo, inclusive `@embedded-postgres`).
2. Rode `db:local`, `db:deploy` e `db:seed` uma vez e confirme que funciona.
3. Ensaie com o Wi-Fi desligado. No dia: `db:local`, `dev:api` e `dev:web` em três terminais.
4. Use o Expo em modo offline (`EXPO_OFFLINE=1`). O celular só conecta se estiver na mesma rede local do computador; a Web no próprio computador não precisa de rede nenhuma.

## Autenticação (Better Auth)

Cadastro e login por e-mail e senha, com uma conta única para procurar trabalho e contratar (PRD 10). A API usa o Better Auth 1.7.6 sobre o mesmo banco do Prisma; o app usa o cliente do Better Auth.

**Variáveis de `apps/api/.env`** (modelo no `.env.example`):

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Banco usado pela API (local por padrão; o Neon usa `dev:api:neon`) |
| `BETTER_AUTH_SECRET` | Segredo que assina os cookies de sessão. Mínimo de 32 caracteres, nunca no Git. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `BETTER_AUTH_URL` | Endereço da API (`http://localhost:3333` no desenvolvimento) |
| `TRUSTED_ORIGINS` | Origens autorizadas a enviar cadastro e login: `http://localhost:8081` (Web) e `freelah://` (app). O Expo Go (`exp://`) é liberado automaticamente só em desenvolvimento |

A API não sobe sem `DATABASE_URL` e sem um `BETTER_AUTH_SECRET` válido. Cada pessoa da equipe usa o próprio segredo (a sessão é verificada no banco; trocar o segredo só desconecta quem estava logado).

**O que existe:** `POST /api/auth/sign-up/email`, `/sign-in/email`, `/sign-out` e `GET /api/auth/get-session` (do Better Auth), e `GET /me` (perfil do próprio usuário). Ações protegidas usam o middleware `requireAuth` (`apps/api/src/middleware/require-auth.ts`), que responde 401 sem sessão. No app, as telas são `/entrar` e `/cadastrar`, e a tela inicial mostra o usuário e o botão **Sair**.

**Regras:** o cadastro exige nome, e-mail, senha (8 a 128 caracteres), telefone com DDD, cidade e a declaração de **18 anos ou mais**. As regras vivem em `packages/shared/src/auth.ts` e são validadas no app **e** na API. O servidor registra a data da declaração em `adultConfirmedAt` (o cliente não consegue enviá-la) e guarda só os dígitos do telefone. O telefone é privado: aparece apenas para o dono da conta, em `GET /me`.

**Sessão:** na Web é um cookie `HttpOnly`; no celular o cookie fica no SecureStore do aparelho. Duração e renovação seguem o padrão do Better Auth (7 dias, renovada a cada dia de uso). O limite de tentativas de login do Better Auth fica ativo em produção.

**Não faz parte da demonstração:** verificação de e-mail e recuperação de senha (dependem de um provedor de e-mail; veja as limitações abaixo).

## Testes e verificações

```bash
npm run check       # lint + typecheck + testes
npm run lint
npm run typecheck
npm test
```

## Versões fixadas

Expo SDK 57.0.25, React Native 0.86.3 (a versão do SDK 57), React 19.2.3, TypeScript ~6.0.3, Express 5.2.1, Zod 4.6.5, Vitest 5.0.1.
Nas próximas etapas: Prisma 7.10.0 e Better Auth 1.7.6, ambos em versão exata (a tag `latest` do Prisma no npm aponta para uma versão candidata, a 8.0).

Para o app, instale ou atualize pacotes **com `npx expo install`**, que escolhe as versões compatíveis com o SDK.

## Limitações conhecidas

- Recuperação de senha não faz parte da demonstração: depende de um provedor de e-mail ainda não configurado.
- Imagens de oportunidades e foto de perfil ficam para depois do MVP.

Os detalhes e o que foi simplificado estão em [docs/roadmap.md](docs/roadmap.md).
