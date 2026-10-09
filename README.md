# Freelah

Plataforma que conecta quem procura bicos, trabalhos temporários e renda extra com quem precisa contratar um serviço. Protótipo (MVP) para o Tech Summit Energisa.

> **Estado atual: etapa 0 (fundação técnica).** O app mostra o status da API; as funcionalidades do produto entram nas próximas etapas. Veja [docs/roadmap.md](docs/roadmap.md).

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
cp .env.example apps/api/.env       # variáveis da API
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
