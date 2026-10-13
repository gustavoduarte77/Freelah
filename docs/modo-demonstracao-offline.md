# Modo Demonstração Offline

Demonstração do fluxo de contratação (interesse → conversa → convite → aceite → confirmação) que roda **só no navegador**, com dados fictícios locais. Não usa Neon, PostgreSQL, a API Express, internet nem outra pessoa conectada.

O modo é isolado: só existe quando o app é iniciado pelo comando abaixo. No aplicativo normal (`npm run dev:web`) o código e os dados da demonstração **nem entram no pacote**, e o fluxo real não muda.

## 1. O que instalar antes (uma vez, com internet)

- Node.js (a versão do README) e as dependências do projeto: `npm install` na raiz.
- Nada mais. Não é preciso banco, `.env` nem a API.

## 2. Iniciar

Na raiz do projeto:

```
npm run demo:web
```

A primeira abertura compila o app (cerca de um minuto, sem internet). Depois, abra no navegador do mesmo computador:

**http://localhost:8082**

(Outra porta: `npm run demo:web -- --port 8090`.) A demonstração usa a porta 8082 para não atrapalhar o app normal na 8081.

## 3. Conta de demonstração

| | |
|---|---|
| E-mail | `usuario@gmail.com` |
| Senha | `12345678` |

Nome: **Lucas Oliveira** (prestador, que também publicou duas oportunidades). A conta existe só neste modo e é validada no navegador: não está no Better Auth nem em banco algum. O cadastro de novas contas fica desativado.

Uma barra fixa na parte de baixo mostra **Modo demonstração** o tempo todo.

## 4. Roteiro (7 etapas)

Entre, navegue por Home e Explorar e abra **Meus interesses**. A oportunidade **Pintura de sala residencial** (Mariana Costa, Cataguases/MG, R$ 250,00) já tem interesse registrado. Toque em **Conversar** e use os controles:

| Etapa | O que aparece |
|---|---|
| 1 | Interesse registrado, conversa vazia |
| 2 | Mariana: "Olá, Lucas! Vi seu interesse…" |
| 3 | Lucas: "Olá, Mariana! Tenho sim…" |
| 4 | Mariana: "São cerca de 20 m²…" |
| 5 | Lucas: "Perfeito! … pelo valor anunciado." |
| 6 | Mariana: "Ótimo! Vou enviar o convite…" |
| 7 | Cartão de convite formal (serviço, valor, data, horário, local) |

Na etapa 7, **Aceitar convite** mostra a janela **Contratação confirmada!** (fecha com o botão, Esc ou clicando fora) e a oportunidade passa a **contratada** em Meus interesses, nos detalhes e na conversa. **Recusar** não contrata (volta com **B**).

O roteiro é sempre o mesmo: não há mensagens aleatórias nem automáticas.

## 5. Controles

Barra "Controles da demonstração" (mostra "Etapa X de 7"):

- **Avançar** ou tecla **A**: próxima mensagem ou evento (não passa da etapa 7).
- **Voltar** ou tecla **B**: etapa anterior; se o convite já foi respondido, desfaz a resposta.
- **Reiniciar**: volta ao início e restaura convite, contratação e confirmação. Pode repetir quantas vezes quiser.

Os atalhos A e B não funcionam enquanto você digita em um campo de texto.

O estado fica no `localStorage` do navegador (sobrevive a recarregar a página). Para limpar tudo, use **Reiniciar**.

## 6. O que funciona offline

Login, Home, Explorar (busca, filtros e categorias), detalhes das oportunidades, Minhas oportunidades (2 publicadas, com interessados), Meus interesses (3 interesses; dá para demonstrar e retirar interesse em outras oportunidades), Mensagens e a conversa roteirizada, convite, aceite/recusa e confirmação. Depois que a página carregou, a rede pode ser desligada.

Ações que dependem de servidor (publicar, editar, cancelar, concluir, convidar como contratante, cadastrar, enviar mensagens livres) respondem com um aviso claro: "Esta ação não está disponível na demonstração offline".

## 7. Sair do modo demonstração

Pare o servidor (Ctrl+C) e rode o app normal: `npm run dev:api` e `npm run dev:web` (porta 8081, com o banco). Se o Metro já tiver rodado em modo demonstração, inicie o normal uma vez com `npx expo start --web --clear` (dentro de `apps/mobile`) para descartar o cache.

## 8. Limitações

- Só a Web, em computador. Celular físico não foi testado nem configurado para este modo.
- Primeira compilação exige o Metro rodando; depois de carregada, a página funciona sem rede, mas **recarregar com a rede desligada** exige o servidor local (`npm run demo:web`) ativo.
- É uma simulação: o aceite é uma transição local, não uma chamada à API. O comportamento real do convite está coberto pelos testes da API.
- Sem imagens de oportunidades, sem pagamento, sem avaliações.
