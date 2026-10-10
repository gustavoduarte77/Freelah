# Roteiro da demonstração (Tech Summit Energisa)

> **Rascunho.** Será completado conforme as etapas avançam; hoje só a base técnica existe. Os itens abaixo seguem a seção 42 do PRD.

## Antes de começar

- API no ar e app aberto na Web e no celular.
- **Sem internet:** PostgreSQL local no ar (`npm run db:local -w @freelah/api`), API e Web no mesmo computador, Expo com `--offline`. Preparar e ensaiar com o Wi-Fi desligado (veja o README, "Demonstração sem internet"). O celular só funciona numa rede local compartilhada com o computador.
- Banco com os dados de demonstração (seed da etapa 10), todos com `isDemo` e o selo "Demonstração". Para recomeçar do zero: `npm run db:reset:local -w @freelah/api` (só aceita banco local).
- Duas contas prontas: a do contratante (Carlos) e uma conta nova que será criada ao vivo (João).

## História principal: João procura renda extra

1. João abre o Freelah e escolhe **"Quero encontrar trabalho"**.
2. Navega pelas categorias e encontra **"Auxiliar de pintura — R$ 180"**, sem cadastro.
3. Abre os detalhes e toca em **"Tenho interesse"**.
4. O app pede login; João cria a conta e volta direto à oportunidade.
5. Demonstra interesse; o interesse é salvo.
6. Carlos vê João na lista de interessados e os dois conversam pelo chat.
7. Carlos seleciona João; a oportunidade passa para **Contratada** e deixa de aceitar interessados.
8. Após o serviço, Carlos conclui; a oportunidade passa para **Concluída**.

Frase de fechamento: **o que antes dependia de indicação agora pode ser encontrado em um único lugar.**

## Complemento: quem contrata

1. Escolher **"Quero contratar alguém"**; a interface prioriza publicar e gerenciar.
2. Publicar uma oportunidade, receber interesse, conversar, selecionar e registrar a contratação.

## Complemento: preferências

Em Configurações, alterar as preferências de uso: a conta continua a mesma e nenhum dado ou histórico é perdido.

## Plano B

- Se a rede falhar: a Web local e a API local no mesmo computador.
- Se o celular não conectar: demonstrar pela Web.
