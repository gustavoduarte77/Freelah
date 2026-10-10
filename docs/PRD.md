# PRD — Freelah

**Product Requirements Document**

- **Versão:** 2.0
- **Produto:** Freelah
- **Tipo:** Plataforma de conexão entre oportunidades de trabalho e contratação de serviços
- **Plataformas iniciais:** Android, iOS e Web
- **Objetivo imediato:** MVP funcional para apresentação no Tech Summit Energisa
- **Documento de referência:** Esta versão substitui as versões anteriores do PRD e consolida os requisitos funcionais, as regras de negócio, a personalização do usuário e as decisões técnicas do projeto.

---

# 1. Visão do produto

O Freelah é uma plataforma que conecta pessoas que procuram oportunidades de trabalho com pessoas ou empresas que precisam contratar serviços.

A proposta é facilitar o acesso a bicos, trabalhos temporários e serviços pontuais, especialmente para profissionais que possuem pouca visibilidade e normalmente dependem de indicações, conhecidos ou grupos informais para encontrar clientes.

Ao mesmo tempo, o Freelah oferece aos contratantes uma maneira simples de encontrar pessoas disponíveis para realizar diferentes tipos de serviço.

## Proposta de valor

**Conectamos quem precisa trabalhar com quem precisa de um serviço.**

O Freelah busca transformar algo que atualmente depende de:

"Você conhece alguém que faça isso?"

em:

"Procure no Freelah."

O produto deverá priorizar inicialmente a experiência de quem procura trabalho, sem prejudicar a experiência de quem precisa contratar alguém.

---

# 2. Problema

Existem diversas oportunidades de trabalho temporário e prestação de serviços que não chegam ao público adequado.

Pessoas que precisam de renda adicional ou estão desempregadas podem ter dificuldade para encontrar oportunidades, especialmente quando não possuem uma rede ampla de contatos.

Da mesma forma, pessoas que precisam contratar alguém para um serviço podem depender de indicações, grupos de mensagens ou contatos pessoais.

Esse problema não é exclusivo de cidades pequenas e pode existir em diferentes regiões e países.

## Problemas identificados

- Dependência de indicação para encontrar determinados serviços.
- Baixa visibilidade de trabalhadores independentes.
- Dificuldade para encontrar bicos e trabalhos temporários.
- Oportunidades espalhadas em diferentes canais.
- Dificuldade para descobrir profissionais fora da própria rede de contatos.
- Pouca centralização de serviços locais.
- Falta de um ambiente dedicado à conexão entre oferta e demanda de pequenos serviços.

---

# 3. Objetivo do produto

O objetivo principal do Freelah é:

**Facilitar que adultos encontrem oportunidades de trabalho temporário ou prestação de serviços sem depender exclusivamente de sua rede de contatos.**

O produto deverá priorizar inicialmente o lado de quem procura trabalho.

O contratante continua sendo essencial para o funcionamento da plataforma. A proposta é tornar a descoberta de oportunidades mais acessível e, ao mesmo tempo, simplificar a publicação de serviços e a seleção de trabalhadores.

O MVP deverá provar que é possível realizar a conexão entre as duas partes por meio de uma plataforma única.

---

# 4. Público-alvo

## 4.1 Público primário

Adultos com 18 anos ou mais que:

- estejam desempregados;
- procurem renda complementar;
- procurem trabalhos temporários;
- realizem serviços independentes;
- estejam buscando novos clientes;
- possuam pouca visibilidade ou uma rede limitada de contatos.

## 4.2 Público secundário

Pessoas e empresas que precisam contratar:

- trabalhadores temporários;
- prestadores de serviços;
- profissionais para trabalhos pontuais;
- auxiliares;
- profissionais locais.

## 4.3 Princípio de utilização

Um mesmo usuário poderá procurar trabalho e contratar pessoas.

O sistema não deverá exigir a criação de contas diferentes para cada finalidade.

---

# 5. Personas

## 5.1 Persona 1 — Trabalhador

**Nome:** João, 24 anos.

João procura uma fonte de renda adicional. Possui habilidades práticas, mas não tem uma carteira de clientes ou muitos contatos.

Atualmente, procura oportunidades por meio de conhecidos, grupos de WhatsApp, redes sociais e indicações.

### Problema

João sabe realizar diversos serviços, mas não sabe onde encontrar pessoas que precisam deles.

### Necessidade

Encontrar oportunidades compatíveis com suas habilidades e demonstrar interesse de maneira simples.

### Como o Freelah ajuda

João abre o aplicativo, escolhe a opção de encontrar trabalho, visualiza oportunidades disponíveis, consulta os detalhes de um serviço e demonstra interesse.

## 5.2 Persona 2 — Contratante

**Nome:** Carlos, 39 anos.

Carlos precisa contratar alguém para realizar um serviço pontual, mas não possui um profissional de confiança para aquela tarefa.

### Problema

Carlos depende de indicações para encontrar alguém.

### Necessidade

Publicar uma oportunidade, receber interessados e conversar com candidatos antes de escolher uma pessoa.

### Como o Freelah ajuda

Carlos publica a oportunidade, recebe manifestações de interesse e conversa com os candidatos pelo aplicativo até selecionar um trabalhador.

## 5.3 Persona 3 — Usuário com necessidades mistas

Uma pessoa pode procurar trabalho em determinados momentos e precisar contratar alguém em outros.

O Freelah deverá permitir que essa pessoa utilize as duas funcionalidades sem trocar de conta ou passar por um novo cadastro.

---

# 6. Diferenciais do Freelah

## 6.1 Visibilidade

Dar oportunidade para trabalhadores que possuem pouca visibilidade ou dependem de indicações.

## 6.2 Foco em serviços

O Freelah não será inicialmente orientado apenas para profissões técnicas ou trabalhos tradicionais de freelancer.

A plataforma deverá contemplar serviços práticos e locais.

## 6.3 Diversidade

Permitir diferentes tipos de trabalho em uma única plataforma.

## 6.4 Simplicidade

O usuário deverá conseguir encontrar uma oportunidade ou publicar um serviço com poucos passos.

## 6.5 Conexão direta

O contato entre trabalhador e contratante ocorrerá dentro da plataforma.

## 6.6 Personalização sem restrições artificiais

O usuário poderá indicar suas principais necessidades para que a interface destaque as ações mais relevantes, sem impedir que ele utilize as demais funcionalidades.

---

# 7. Escopo do MVP

O MVP deverá demonstrar o ciclo principal do Freelah, e não todas as funcionalidades possíveis do produto.

## Fluxo de quem procura trabalho

Entrar no aplicativo → encontrar oportunidade → consultar detalhes → demonstrar interesse → conversar → ser selecionado → concluir o serviço.

## Fluxo de quem contrata

Entrar no aplicativo → publicar oportunidade → receber interessados → conversar → selecionar trabalhador → concluir o serviço.

## Objetivo da primeira versão

Entregar uma aplicação funcional para demonstração, com interface consistente, persistência real de dados e os principais fluxos operacionais funcionando.

O projeto deverá ser estruturado de forma que possa evoluir posteriormente para um produto comercial sem exigir uma reescrita completa.

---

# 8. Onboarding e preferências de uso

Esta seção é obrigatória no MVP.

Na primeira utilização, o Freelah deverá perguntar ao usuário como ele pretende utilizar a plataforma. Essa escolha ajudará a personalizar a experiência inicial.

## 8.1 Tela inicial de preferências

Título:

**Como você quer usar o Freelah?**

Texto explicativo:

"Escolha uma ou as duas opções. Você poderá mudar isso depois nas configurações."

A tela deverá apresentar duas opções selecionáveis independentemente.

### Opção 1 — Encontrar trabalho

Texto:

"Quero encontrar trabalho"

Descrição opcional:

"Descubra oportunidades, demonstre interesse e converse com contratantes."

### Opção 2 — Contratar alguém

Texto:

"Quero contratar alguém"

Descrição opcional:

"Publique oportunidades, encontre interessados e escolha quem realizará o serviço."

### Comportamento

- As duas opções poderão ser selecionadas simultaneamente.
- A seleção de uma opção não deverá desmarcar automaticamente a outra.
- Pelo menos uma opção deverá estar selecionada para continuar.
- O botão de continuar deverá permanecer desabilitado enquanto nenhuma opção estiver selecionada.
- A interface deverá apresentar visualmente quais opções estão selecionadas.
- A escolha não deverá exigir login ou cadastro.
- O usuário não deverá precisar criar uma conta diferente para cada finalidade.

## 8.2 Persistência das preferências

O sistema deverá preservar as escolhas do usuário.

### Antes do login

Se o usuário ainda não possuir uma conta, as preferências deverão ser armazenadas localmente no dispositivo ou navegador.

Se o usuário criar uma conta posteriormente, o aplicativo deverá tentar associar as preferências locais ao perfil autenticado.

### Depois do login

As preferências deverão ser persistidas no banco de dados e associadas à conta do usuário.

Quando o usuário acessar o Freelah em outro dispositivo, suas preferências salvas na conta deverão ser recuperadas.

### Regra de prioridade

Quando houver preferências salvas na conta, elas deverão prevalecer sobre escolhas temporárias locais, exceto quando o usuário estiver explicitamente concluindo um fluxo de configuração que atualize essas preferências.

## 8.3 Personalização da interface

As preferências deverão influenciar a navegação, os atalhos e a hierarquia das ações apresentadas.

### Usuário que escolheu encontrar trabalho

A interface deverá priorizar:

- encontrar oportunidades;
- explorar categorias;
- visualizar oportunidades recentes;
- consultar interesses enviados;
- acessar mensagens.

A publicação de oportunidades continuará disponível.

### Usuário que escolheu contratar alguém

A interface deverá priorizar:

- publicar oportunidade;
- gerenciar oportunidades publicadas;
- visualizar interessados;
- acessar mensagens;
- acompanhar contratações.

A exploração de oportunidades continuará disponível.

### Usuário que escolheu as duas opções

A interface deverá oferecer acesso equilibrado às duas finalidades, sem esconder nenhuma delas.

## 8.4 Preferências não são permissões

As preferências representam a intenção atual do usuário, e não um tipo de conta.

Portanto:

- escolher apenas encontrar trabalho não impede a publicação de oportunidades;
- escolher apenas contratar alguém não impede a candidatura a oportunidades;
- alterar as preferências não deverá alterar as permissões da conta;
- alterar as preferências não deverá apagar publicações, candidaturas, conversas ou histórico;
- as permissões deverão depender da autenticação, da propriedade dos registros e das regras de negócio.

## 8.5 Alterar preferências nas configurações

O perfil deverá conter uma seção chamada:

**Preferências de uso**

Essa seção deverá permitir que o usuário altere as opções:

- Quero encontrar trabalho.
- Quero contratar alguém.

As duas opções deverão funcionar como seleções independentes.

O usuário poderá ativar ou desativar qualquer uma delas, mas não poderá desativar ambas simultaneamente.

Se tentar desativar a última opção ativa, o aplicativo deverá explicar que pelo menos uma preferência precisa permanecer selecionada.

Ao salvar as alterações:

1. As novas preferências deverão ser persistidas.
2. A interface deverá ser atualizada.
3. Os atalhos e a navegação deverão refletir as novas escolhas.
4. A conta deverá continuar a mesma.
5. O histórico e os dados existentes deverão permanecer intactos.

A atualização deverá ocorrer sem exigir novo cadastro, logout ou reinstalação do aplicativo.

## 8.6 Critérios de aceitação do onboarding

O recurso será considerado implementado quando:

1. A tela de preferências for exibida na primeira utilização, antes da navegação principal.
2. O usuário puder selecionar apenas a primeira opção.
3. O usuário puder selecionar apenas a segunda opção.
4. O usuário puder selecionar ambas.
5. O sistema impedir a continuação sem nenhuma opção selecionada.
6. As preferências forem mantidas durante a navegação.
7. As preferências forem associadas à conta após o login ou cadastro, quando aplicável.
8. A tela de configurações permitir alterar as preferências.
9. A alteração atualizar a interface sem apagar dados existentes.
10. A navegação permitir acessar ambas as funcionalidades independentemente da preferência escolhida.

---

# 9. Navegação sem cadastro

O usuário deverá conseguir explorar o aplicativo sem criar uma conta.

## Funcionalidades públicas

- abrir a página inicial;
- visualizar oportunidades disponíveis;
- navegar pelas categorias;
- consultar detalhes das oportunidades;
- utilizar a busca e os filtros públicos disponíveis.

A tela de preferências inicial não deverá funcionar como uma exigência de cadastro. Ela serve apenas para personalizar a experiência.

## Ações que exigem autenticação

- publicar oportunidades;
- editar ou cancelar oportunidades próprias;
- demonstrar interesse;
- consultar áreas privadas de candidaturas;
- iniciar ou acessar conversas privadas;
- selecionar um trabalhador;
- concluir uma contratação;
- alterar informações privadas do perfil;
- alterar preferências vinculadas à conta;
- denunciar ou bloquear usuários quando a ação exigir identificação.

Quando uma pessoa não autenticada tentar executar uma ação protegida, o aplicativo deverá direcioná-la para login ou cadastro.

Após a autenticação, deverá tentar retornar o usuário à ação ou à tela que ele pretendia acessar.

---

# 10. Cadastro e autenticação

## 10.1 Cadastro

O cadastro deverá conter inicialmente:

- nome;
- e-mail;
- senha;
- telefone;
- cidade ou localização básica;
- foto de perfil opcional.

A aplicação deverá validar os campos obrigatórios e apresentar mensagens de erro compreensíveis.

O sistema deverá verificar a unicidade do e-mail.

## 10.2 Login

O usuário deverá conseguir entrar com e-mail e senha.

O sistema deverá apresentar mensagens apropriadas para credenciais inválidas, problemas de conexão e outros erros esperados.

## 10.3 Sessão

A sessão deverá ser mantida de maneira segura e compatível com cada plataforma.

O armazenamento de credenciais e tokens deverá considerar as diferenças entre Android, iOS e Web.

Não armazenar senhas em texto puro nem expor credenciais privadas em código acessível ao cliente.

## 10.4 Recuperação de senha

A recuperação de senha deverá ser implementada se for compatível com a solução de autenticação escolhida e com o escopo da apresentação.

Caso dependa de um serviço externo ainda não configurado, o requisito deverá ser documentado e não poderá ser apresentado como funcional sem testes reais.

## 10.5 Conta única

O usuário poderá encontrar trabalho e contratar pessoas usando a mesma conta.

Não haverá tipos de conta exclusivos de trabalhador ou contratante.

---

# 11. Home

A página inicial deverá comunicar imediatamente as duas principais ações do Freelah.

## Ações principais

- Encontrar oportunidades.
- Publicar uma oportunidade.

A hierarquia visual dessas ações poderá ser adaptada de acordo com as preferências do usuário, sem remover o acesso à outra ação.

## Conteúdo da Home

A página inicial deverá apresentar:

- identidade visual do Freelah;
- campo de busca;
- atalhos para as principais ações;
- categorias;
- oportunidades recentes ou relevantes;
- informações essenciais sobre as oportunidades exibidas.

## Exemplo conceitual

FREELAH

"Encontre uma oportunidade ou alguém para seu serviço."

[Encontrar trabalho]

[Publicar oportunidade]

Categorias

Oportunidades recentes

## Requisitos de UX

- Interface clara e objetiva.
- Ações principais visualmente evidentes.
- Adaptação a telas pequenas e grandes.
- Estados de carregamento.
- Estado vazio quando não houver oportunidades.
- Mensagens compreensíveis quando ocorrer um erro.
- Possibilidade de atualizar ou tentar carregar os dados novamente.

---

# 12. Categorias

## 12.1 Categorias do MVP

1. Serviços Domésticos.
2. Serviços Comerciais.
3. Construção Civil.
4. Serviços de Manutenção.
5. Aulas Particulares.

## 12.2 Categorias futuras

- Beleza e Estética.
- Fitness.
- Pets.
- Transporte.
- Eventos.
- Tecnologia.
- Jardinagem.
- Fotografia.
- Design.
- Outras.

## 12.3 Requisitos

As categorias deverão ser armazenadas e organizadas de maneira que novas opções possam ser adicionadas sem alterações significativas na arquitetura.

Cada oportunidade deverá estar associada a uma categoria válida.

A listagem de categorias deverá ser utilizada tanto na exploração quanto no formulário de publicação.

O sistema deverá evitar categorias duplicadas e oportunidades vinculadas a categorias inexistentes ou inativas.

---

# 13. Oportunidades

Uma oportunidade representa um serviço que precisa ser realizado.

## 13.1 Dados mínimos

Cada oportunidade deverá possuir:

- identificador único;
- título;
- descrição;
- categoria;
- contratante responsável;
- localização;
- data prevista do serviço;
- horário previsto;
- valor proposto;
- indicação de valor negociável;
- prazo da publicação;
- status;
- data de criação;
- data de atualização.

## 13.2 Exemplo

**Pintura de sala**

"Preciso de uma pessoa para pintar uma sala de aproximadamente 20 m²."

- Categoria: Construção Civil.
- Local: Cataguases/MG.
- Data: 12/09.
- Horário: 08:00.
- Valor: R$ 200.
- Negociável: Sim.

Os dados acima são ilustrativos e não devem ser tratados como uma oportunidade real sem terem sido cadastrados no banco.

## 13.3 Listagem

O usuário deverá conseguir visualizar oportunidades em uma lista ou conjunto de cartões.

Cada item deverá apresentar as informações mais relevantes, como:

- título;
- categoria;
- localização;
- valor;
- data;
- status ou disponibilidade, quando pertinente.

## 13.4 Detalhes

A página de detalhes deverá apresentar a descrição completa, as condições do serviço e as ações disponíveis para o usuário.

Se a oportunidade não estiver mais aceitando interessados, o aplicativo deverá informar claramente o motivo ou o estado atual.

## 13.5 Busca e filtros

A busca deverá permitir encontrar oportunidades por termos relevantes.

Quando incluídos no MVP, os filtros deverão permitir restringir os resultados por categoria, localização, valor ou outros atributos suportados.

A busca e os filtros não deverão apresentar oportunidades canceladas, expiradas ou já contratadas como se ainda estivessem aceitando interessados.

---

# 14. Estados de uma oportunidade

Uma oportunidade deverá possuir estados bem definidos.

## Estados principais

- Rascunho.
- Publicada.
- Em negociação.
- Contratada.
- Concluída.
- Cancelada.
- Expirada.

## Fluxo principal

Rascunho → Publicada → Em negociação → Contratada → Concluída.

## Caminhos alternativos

Publicada → Cancelada.

Publicada → Expirada.

Uma oportunidade em negociação também poderá ser cancelada pelo contratante, desde que as regras de negócio e o estado atual permitam a ação.

## Regras

- Uma oportunidade poderá ser editada pelo proprietário enquanto não houver contratação confirmada.
- O contratante poderá cancelar sua própria oportunidade, respeitando o estado atual.
- Uma oportunidade contratada não deverá aceitar novos interessados.
- A conclusão deverá ser registrada explicitamente.
- Oportunidades expiradas deverão deixar de aparecer como oportunidades ativas.
- O estado deverá ser validado no servidor, e não apenas na interface.
- Alterações de estado deverão preservar o histórico necessário para o funcionamento do produto.

A transição entre estados deverá ser controlada para impedir mudanças inválidas.

---

# 15. Criar oportunidade

O usuário autenticado deverá conseguir publicar uma oportunidade por meio de um formulário.

## 15.1 Campos obrigatórios

- título;
- descrição;
- categoria;
- localização;
- data;
- horário;
- valor;
- prazo da publicação.

## 15.2 Campos opcionais

- valor negociável;
- imagens;
- informações adicionais.

A inclusão de imagens poderá ser simplificada ou adiada se a infraestrutura de armazenamento não estiver configurada para o MVP.

## 15.3 Fluxo

Publicar oportunidade → preencher informações → revisar → publicar → oportunidade disponível.

## 15.4 Validação

O sistema deverá verificar:

- preenchimento dos campos obrigatórios;
- formato válido dos dados;
- valor não negativo;
- data e horário válidos;
- prazo de publicação coerente;
- categoria existente e ativa;
- usuário autenticado e autorizado a publicar.

## 15.5 Resultado

Após a publicação, a oportunidade deverá ser persistida no banco e aparecer na exploração pública, desde que esteja ativa.

O usuário deverá receber confirmação de sucesso ou uma mensagem de erro compreensível.

O formulário não deverá indicar que a publicação foi concluída se o salvamento falhar.

---

# 16. Gerenciamento das próprias oportunidades

O usuário deverá possuir uma área para consultar as oportunidades que publicou.

Nessa área, deverá conseguir:

- visualizar suas oportunidades;
- consultar o status;
- editar oportunidades elegíveis;
- cancelar oportunidades elegíveis;
- visualizar os interessados;
- acessar conversas relacionadas;
- selecionar um trabalhador;
- acompanhar o andamento da contratação;
- concluir o serviço quando aplicável.

O sistema deverá validar no servidor se o usuário é o proprietário da oportunidade antes de permitir operações administrativas sobre ela.

Um usuário não poderá editar ou cancelar oportunidades de outras pessoas.

---

# 17. Interesse em uma oportunidade

Na página da oportunidade deverá existir uma ação clara:

**Tenho interesse**

## Comportamento

Ao clicar:

1. O sistema deverá verificar se o usuário está autenticado.
2. Deverá verificar se a oportunidade está aceitando interessados.
3. Deverá registrar o interesse no banco de dados.
4. Deverá disponibilizar o interesse ao contratante responsável.
5. Deverá permitir que os envolvidos acessem a conversa relacionada à oportunidade.

## Regras

- O mesmo usuário não poderá registrar interesses duplicados para a mesma oportunidade.
- O contratante não poderá demonstrar interesse em sua própria oportunidade.
- O usuário não poderá se candidatar a uma oportunidade cancelada, expirada, concluída ou contratada.
- O sistema deverá impedir duplicidade mesmo quando duas solicitações forem enviadas rapidamente.
- A interface deverá refletir o estado do interesse já registrado.

## Estados do interesse

- Pendente.
- Aceito.
- Rejeitado.
- Cancelado pelo interessado.

A aceitação de um interesse não deverá, por si só, confirmar uma contratação, a menos que o fluxo explícito de seleção seja executado.

---

# 18. Chat

O contato entre trabalhador e contratante ocorrerá dentro do aplicativo.

Isso tem dois objetivos principais:

1. Centralizar a negociação.
2. Oferecer um ambiente de comunicação com regras de acesso e mecanismos de denúncia.

## 18.1 Funcionalidades do MVP

O chat deverá permitir:

- enviar mensagens de texto;
- identificar os participantes;
- identificar a oportunidade relacionada;
- visualizar o histórico de mensagens;
- distinguir visualmente as mensagens enviadas e recebidas;
- consultar conversas anteriores autorizadas;
- receber atualizações de novas mensagens enquanto a conversa estiver aberta, quando a conexão permitir.

## 18.2 Regras de acesso

Somente participantes autorizados poderão visualizar as mensagens.

A aplicação não deverá confiar apenas em identificadores enviados pelo cliente para autorizar acesso a uma conversa.

O servidor deverá verificar a participação do usuário antes de devolver mensagens ou aceitar novas mensagens.

## 18.3 Relação com a oportunidade

Cada conversa relacionada à contratação deverá estar vinculada à oportunidade correspondente.

O sistema deverá evitar a criação desnecessária de várias conversas duplicadas entre os mesmos participantes para a mesma oportunidade.

## 18.4 Implementação técnica

A comunicação poderá utilizar atualização em tempo real ou consulta periódica, de acordo com a solução técnica escolhida.

O mecanismo escolhido deverá funcionar de maneira consistente nas plataformas previstas.

## 18.5 Futuro

Ficam fora do MVP inicial:

- envio de imagens;
- arquivos;
- mensagens de voz;
- localização;
- envio estruturado de propostas;
- confirmação de pagamento;
- moderação automatizada avançada.

---

# 19. Contratação

Depois de conversar com os interessados, o contratante poderá selecionar um trabalhador.

## Fluxo

Interessado → conversa → negociação → seleção do trabalhador → contratação confirmada → conclusão do serviço.

## Regras

- Apenas o contratante responsável poderá selecionar o trabalhador.
- A seleção deverá ocorrer somente quando a oportunidade estiver em um estado elegível.
- A confirmação deverá ser persistida no banco.
- Após a contratação, a oportunidade deverá deixar de aceitar novos interessados.
- Os interesses existentes deverão manter um estado coerente.
- O sistema deverá identificar qual trabalhador foi selecionado.
- A contratação deverá estar vinculada à oportunidade.
- A interface deverá mostrar claramente a contratação confirmada.
- Uma operação concorrente não poderá resultar em mais de um trabalhador selecionado para a mesma oportunidade.

O sistema deverá tratar adequadamente solicitações simultâneas para evitar contratações inconsistentes.

---

# 20. Conclusão do serviço

Depois que o serviço for realizado, o contratante deverá conseguir registrar sua conclusão.

A interface deverá apresentar uma ação clara para concluir o serviço quando a oportunidade estiver contratada.

## Regras

- Apenas um usuário autorizado poderá executar a ação.
- A conclusão deverá ser persistida no banco.
- A oportunidade deverá passar para o estado Concluída.
- A oportunidade não deverá voltar a aceitar interessados.
- A interface deverá apresentar a situação final.

A confirmação de conclusão no MVP não representa confirmação de pagamento.

---

# 21. Modelo de preço e pagamentos

As oportunidades poderão apresentar um valor inicial.

Exemplo:

**R$ 200 — negociável.**

O valor final poderá ser acordado entre as partes.

## MVP

A negociação será conduzida pelo chat.

O Freelah não processará pagamentos no MVP.

Não haverá:

- carteira digital;
- pagamentos dentro do aplicativo;
- comissão automática;
- retenção de valores;
- integração financeira obrigatória.

Essa decisão reduz a complexidade técnica e permite concentrar o desenvolvimento na conexão entre trabalhadores e contratantes.

---

# 22. Perfil e configurações

Cada usuário autenticado deverá possuir um perfil básico.

## Informações do perfil

- nome;
- e-mail;
- telefone;
- cidade ou localização básica;
- foto de perfil opcional;
- data de criação da conta.

## Configurações

A área de configurações deverá incluir, no mínimo:

- preferências de uso;
- edição dos dados básicos permitidos;
- opção de encerrar a sessão;
- acesso aos termos de uso;
- acesso à política de privacidade.

As preferências de uso deverão permitir ativar ou desativar as opções de encontrar trabalho e contratar alguém, mantendo pelo menos uma ativa.

Alterar as preferências não poderá apagar ou modificar automaticamente as oportunidades, interesses, contratações ou conversas do usuário.

O usuário deverá conseguir acessar tanto suas oportunidades publicadas quanto seus interesses, independentemente das preferências selecionadas.

---

# 23. Segurança e moderação

A segurança deverá fazer parte da arquitetura desde o início.

## 23.1 Requisitos do MVP

- autenticação;
- autorização de operações;
- validação de dados no servidor;
- identificação dos usuários;
- sistema de denúncia;
- bloqueio de usuários;
- mecanismos básicos de moderação administrativa;
- comunicação privada entre participantes autorizados;
- termos de uso;
- política de privacidade.

## 23.2 Denúncia

O usuário deverá conseguir denunciar conteúdo ou comportamento inadequado.

O registro da denúncia deverá incluir os dados necessários para análise, como autor, motivo, referência ao conteúdo denunciado e data.

A interface deverá informar que a denúncia foi registrada quando o salvamento for confirmado.

## 23.3 Bloqueio

O usuário deverá conseguir bloquear outro usuário.

As regras de bloqueio deverão ser aplicadas de maneira consistente nas áreas pertinentes do aplicativo.

O bloqueio não deverá conceder acesso a informações privadas nem permitir que o usuário altere dados de terceiros.

## 23.4 Moderação administrativa

A implementação inicial poderá ser simples, mas deverá permitir que denúncias sejam registradas e consultadas por usuários com permissão administrativa.

O acesso administrativo deverá ser protegido por autorização real, não apenas por um botão oculto na interface.

## 23.5 Segurança técnica

- Validar todas as operações protegidas no servidor.
- Verificar propriedade dos registros.
- Proteger conversas e mensagens.
- Impedir alterações indevidas de estado.
- Armazenar senhas com mecanismos criptográficos apropriados ou delegar sua gestão a um serviço de autenticação confiável.
- Não expor segredos no aplicativo cliente.
- Não confiar em dados enviados pelo cliente sem validação.
- Usar transações ou mecanismos equivalentes para operações críticas.
- Evitar vulnerabilidades de controle de acesso.
- Tratar erros sem expor informações sensíveis.

## 23.6 Funcionalidades futuras

- verificação de identidade;
- verificação facial;
- selo de usuário verificado;
- sistema de reputação;
- histórico avançado de contratações;
- detecção de comportamento suspeito;
- mecanismos antifraude;
- moderação automatizada.

A verificação facial não será requisito do protótipo.

---

# 24. Avaliações e reputação

Avaliações e reputação não fazem parte do MVP inicial, mas são funcionalidades importantes para evolução.

Após um serviço concluído, futuramente poderá existir um fluxo de avaliação.

Serviço concluído → avaliação → nota registrada.

O usuário poderá futuramente possuir:

- nota média;
- quantidade de serviços concluídos;
- avaliações recebidas;
- histórico de contratações;
- selo de verificação.

Esses recursos deverão ser tratados como evolução futura, não como requisitos que impeçam a entrega do protótipo.

---

# 25. Modelo de negócio

O Freelah será gratuito para utilização básica no MVP.

Possibilidades futuras de monetização:

## 25.1 Comissão por contratação

O Freelah poderia receber uma porcentagem de transações realizadas pela plataforma.

Dependência: isso exigiria um fluxo de pagamentos dentro do Freelah.

## 25.2 Destaque de oportunidades

Contratantes poderiam pagar para aumentar a visibilidade de uma oportunidade.

## 25.3 Planos empresariais

Empresas poderiam ter acesso a:

- maior número de publicações;
- maior visibilidade;
- ferramentas de gestão;
- filtros avançados;
- histórico.

## 25.4 Parcerias

Possíveis parcerias com empresas, instituições, cursos profissionalizantes, organizações de empregabilidade e comércio local.

Nenhum modelo de monetização será necessário para o MVP.

---

# 26. Plataforma e arquitetura tecnológica

## 26.1 Diretriz principal

O Freelah será desenvolvido com uma base de código compartilhada para Android, iOS e Web, priorizando a reutilização de componentes e regras de negócio.

A escolha tecnológica deverá favorecer a entrega do protótipo sem impedir a evolução futura do produto.

## 26.2 Frontend

**React Native + Expo + TypeScript**

Responsabilidades:

- interface do aplicativo;
- navegação;
- formulários;
- listagem de oportunidades;
- detalhes;
- perfil e configurações;
- chat;
- comunicação com a API;
- apresentação de estados de carregamento e erro.

## 26.3 Navegação

**Expo Router**

A navegação deverá ser organizada por rotas e grupos de telas.

Deverá suportar os fluxos públicos e autenticados, mantendo as permissões verificadas também no backend.

## 26.4 Web

A versão web deverá utilizar Expo Web / React Native Web para compartilhar o máximo possível da interface e da lógica com as versões móveis.

A interface deverá ser responsiva para diferentes tamanhos de tela.

A versão web deverá poder ser acessada por uma URL para facilitar a apresentação.

## 26.5 Backend

**Node.js + TypeScript**

O backend será responsável por implementar regras de negócio e operações protegidas.

A aplicação cliente não deverá ser a autoridade final para decisões críticas, como:

- quem pode editar uma oportunidade;
- quem pode acessar uma conversa;
- quem pode selecionar um trabalhador;
- quando uma contratação é confirmada;
- quais oportunidades aceitam interessados.

## 26.6 API

**API REST**

A API deverá oferecer operações para os recursos do sistema, incluindo:

- autenticação e perfil;
- categorias;
- oportunidades;
- interesses;
- conversas;
- mensagens;
- contratação;
- conclusão;
- denúncias;
- bloqueios;
- preferências de uso.

Os endpoints deverão validar os dados recebidos e aplicar as regras de autorização pertinentes.

## 26.7 Banco de dados

**PostgreSQL**

O banco será responsável pela persistência dos dados do aplicativo.

Deverá manter relações consistentes entre usuários, oportunidades, categorias, interesses, conversas e mensagens.

## 26.8 ORM

**Prisma**

O Prisma será utilizado para modelagem de dados, acesso ao banco e gerenciamento de migrações, desde que a versão selecionada seja compatível com a arquitetura definida.

As migrações deverão ser versionadas no repositório.

## 26.9 Autenticação

A autenticação deverá suportar cadastro e login por e-mail e senha, com gerenciamento seguro de sessão.

A implementação poderá utilizar uma solução consolidada de autenticação ou uma solução própria bem estruturada. A decisão deverá considerar o compartilhamento seguro da autenticação entre Android, iOS e Web.

Se for utilizada uma solução externa, suas credenciais deverão ser configuradas por variáveis de ambiente.

## 26.10 Deploy

A arquitetura deverá permitir:

- publicação da versão web em um serviço de hospedagem compatível;
- disponibilização do backend em um serviço adequado para aplicações Node.js;
- uso de PostgreSQL gerenciado ou hospedado em ambiente apropriado;
- configuração separada para desenvolvimento e produção.

## 26.11 Notificações

Notificações push não serão requisito do MVP.

O aplicativo deverá priorizar a apresentação dos interesses e das mensagens dentro da própria plataforma.

A arquitetura poderá permitir notificações futuras sem exigir sua implementação agora.

## 26.12 Princípio de implementação

O Claude Code deverá confirmar a compatibilidade entre as versões escolhidas das tecnologias antes de instalá-las.

Não deverá introduzir dependências desnecessárias nem substituir a stack definida sem uma justificativa técnica concreta e aprovação.

---

# 27. Arquitetura conceitual

```text
                    FREELAH
                       |
             +---------+---------+
             |                   |
          ANDROID                iOS
             |                   |
             +---------+---------+
                       |
                 EXPO / REACT
                    NATIVE
                       |
                  EXPO ROUTER
                       |
                 CLIENTE WEB
              EXPO WEB / RN WEB
                       |
                    API REST
                       |
              NODE.JS + TYPESCRIPT
                       |
          +------------+------------+
          |            |            |
       Usuários    Oportunidades   Chat
          |            |            |
          +------------+------------+
                       |
                   PRISMA ORM
                       |
                   POSTGRESQL
```

A arquitetura conceitual representa as responsabilidades principais. A estrutura concreta de pastas e módulos deverá ser definida na implementação.

---

# 28. Modelo de dados inicial

O modelo abaixo representa as entidades essenciais. O desenvolvedor poderá acrescentar tabelas auxiliares quando necessário, desde que preserve os requisitos funcionais.

## 28.1 User

Representa uma conta de usuário.

Campos conceituais:

- id;
- name;
- email;
- phone;
- city;
- avatarUrl;
- createdAt;
- updatedAt.

As credenciais de autenticação deverão ser gerenciadas de maneira segura. Caso a solução escolhida utilize um provedor externo, a senha não deverá ser armazenada na tabela de perfil do Freelah.

## 28.2 UserPreference

Representa as preferências de utilização.

Campos conceituais:

- id;
- userId;
- wantsWork;
- wantsToHire;
- createdAt;
- updatedAt.

Regras:

- as preferências deverão pertencer a um usuário;
- pelo menos uma preferência deverá permanecer ativa;
- as preferências não deverão funcionar como permissões;
- a aplicação deverá validar a regra tanto no cliente quanto no servidor.

As preferências de usuários não autenticados poderão ser armazenadas localmente, sem criar registros anônimos desnecessários no banco.

## 28.3 Category

Representa uma categoria de serviços.

Campos conceituais:

- id;
- name;
- description;
- active;
- createdAt;
- updatedAt.

## 28.4 Job

Representa uma oportunidade.

Campos conceituais:

- id;
- title;
- description;
- categoryId;
- ownerId;
- location;
- scheduledDate;
- startTime;
- proposedPrice;
- negotiable;
- expiresAt;
- status;
- createdAt;
- updatedAt.

## 28.5 Interest

Representa o interesse de um trabalhador em uma oportunidade.

Campos conceituais:

- id;
- jobId;
- workerId;
- status;
- createdAt;
- updatedAt.

Deverá existir uma restrição de unicidade adequada para impedir que o mesmo usuário demonstre interesse duplicado na mesma oportunidade.

## 28.6 Conversation

Representa uma conversa vinculada a uma oportunidade.

Campos conceituais:

- id;
- jobId;
- createdAt;
- updatedAt.

A estrutura deverá permitir verificar os participantes autorizados.

## 28.7 ConversationParticipant

Representa os participantes de uma conversa.

Campos conceituais:

- id;
- conversationId;
- userId;
- joinedAt.

Essa entidade poderá ser usada para controlar o acesso às mensagens e identificar os usuários autorizados.

## 28.8 Message

Representa uma mensagem.

Campos conceituais:

- id;
- conversationId;
- senderId;
- content;
- createdAt;
- readAt.

O sistema deverá verificar se o remetente pertence à conversa antes de aceitar uma mensagem.

## 28.9 Report

Representa uma denúncia.

Campos conceituais:

- id;
- reporterId;
- reportedUserId, quando aplicável;
- jobId, quando aplicável;
- reason;
- description;
- status;
- createdAt;
- updatedAt.

## 28.10 UserBlock

Representa um bloqueio entre usuários.

Campos conceituais:

- id;
- blockerId;
- blockedUserId;
- createdAt.

Deverá existir uma regra que impeça bloqueios duplicados do mesmo usuário contra a mesma pessoa.

## 28.11 Entidade de contratação

A contratação deverá ser registrada de forma consistente.

Ela poderá ser representada pelos campos e relacionamentos da oportunidade e do interesse selecionado ou por uma entidade própria, caso isso torne o modelo mais adequado.

Independentemente da estrutura escolhida, o banco deverá permitir identificar:

- qual oportunidade foi contratada;
- quem é o contratante;
- quem foi selecionado;
- quando ocorreu a contratação;
- quando o serviço foi concluído;
- qual é o estado atual.

A seleção de um trabalhador deverá ser atômica o suficiente para impedir que duas pessoas sejam contratadas simultaneamente para a mesma oportunidade quando essa não for uma funcionalidade permitida.

---

# 29. Principais telas do MVP

## 29.1 Onboarding de preferências

Tela exibida na primeira utilização.

Permite selecionar:

- encontrar trabalho;
- contratar alguém;
- ambas as opções.

Apresenta a mensagem de que as preferências poderão ser alteradas nas configurações.

## 29.2 Home

Apresenta as principais ações, categorias e oportunidades recentes.

## 29.3 Explorar

Lista oportunidades disponíveis e oferece busca e filtros compatíveis com o MVP.

## 29.4 Detalhes da oportunidade

Apresenta as informações completas e as ações permitidas para o usuário.

## 29.5 Login e cadastro

Exibidos quando o usuário precisar se autenticar para executar uma ação protegida.

## 29.6 Criar oportunidade

Formulário para publicar um novo serviço.

## 29.7 Minhas oportunidades

Área para gerenciar oportunidades publicadas.

## 29.8 Interessados

Lista de pessoas que demonstraram interesse em uma oportunidade.

## 29.9 Chat

Conversa privada relacionada a uma oportunidade.

## 29.10 Interesses

Área para acompanhar oportunidades nas quais o usuário demonstrou interesse.

## 29.11 Perfil

Apresenta as informações básicas do usuário.

## 29.12 Configurações

Permite alterar preferências de uso e gerenciar as opções básicas da conta.

## 29.13 Denúncia e bloqueio

Interfaces para registrar denúncias e bloquear usuários.

## 29.14 Moderação administrativa

Interface simples para consultar e administrar denúncias, acessível apenas a usuários autorizados.

---

# 30. Navegação principal

A navegação deverá se adaptar às plataformas.

## 30.1 Mobile

Uma barra de navegação inferior poderá apresentar:

- Início;
- Explorar;
- Publicar;
- Mensagens;
- Perfil.

A distribuição final deverá considerar a hierarquia das ações e o espaço disponível.

## 30.2 Web

A navegação poderá utilizar uma barra superior ou lateral, conforme o espaço e o layout.

## 30.3 Personalização

As preferências deverão influenciar a hierarquia visual dos atalhos.

### Preferência de encontrar trabalho

Priorizar Início, Explorar, Interesses e Mensagens.

A ação de publicar continuará acessível.

### Preferência de contratar alguém

Priorizar Início, Publicar, Minhas oportunidades e Mensagens.

A exploração continuará acessível.

### Ambas as preferências

Apresentar uma navegação equilibrada.

### Usuário não autenticado

Exibir as áreas públicas e permitir acesso às ações que iniciam autenticação quando necessário.

As áreas privadas deverão solicitar login quando acessadas.

A navegação não deverá ser usada como mecanismo de segurança. O backend deverá validar todas as operações protegidas.

---

# 31. Requisitos não funcionais

## 31.1 Usabilidade

A interface deverá ser simples, objetiva e acessível a pessoas com diferentes níveis de familiaridade com tecnologia.

## 31.2 Responsividade

O aplicativo deverá funcionar em diferentes tamanhos de tela, especialmente celulares Android, iPhones e navegadores de desktop.

## 31.3 Desempenho

O carregamento de listas e telas deverá ser eficiente para o escopo do MVP.

O sistema deverá evitar requisições desnecessárias e apresentar estados de carregamento enquanto aguarda operações.

## 31.4 Confiabilidade

Erros de rede, falhas de autenticação ou indisponibilidade do servidor não deverão deixar a interface em um estado enganoso.

Ações importantes deverão apresentar feedback de sucesso ou falha.

## 31.5 Persistência

O conteúdo criado pelos usuários deverá ser persistido no banco de dados.

O aplicativo não deverá depender exclusivamente de dados em memória para funcionalidades que precisam continuar disponíveis após recarregar a página ou reabrir o aplicativo.

## 31.6 Segurança

As operações deverão respeitar autenticação, autorização e validação no servidor.

## 31.7 Manutenibilidade

O código deverá ser organizado por funcionalidades e responsabilidades, evitando concentrar toda a aplicação em componentes ou arquivos excessivamente grandes.

## 31.8 Compatibilidade

As dependências deverão ser compatíveis com a versão selecionada do Expo e com os ambientes Android, iOS e Web.

## 31.9 Tratamento de erros

A aplicação deverá fornecer mensagens claras para:

- falhas de conexão;
- erros de autenticação;
- falhas ao carregar oportunidades;
- erros de validação;
- falhas ao publicar;
- falhas ao registrar interesse;
- falhas ao enviar mensagens;
- falhas ao atualizar preferências.

---

# 32. Identidade visual

A identidade visual deverá transmitir:

- simplicidade;
- confiança;
- oportunidade;
- acessibilidade;
- modernidade;
- profissionalismo.

O nome Freelah permanece como nome oficial do produto.

A interface deverá evitar uma aparência excessivamente corporativa ou semelhante a plataformas tradicionais de recrutamento.

O objetivo é transmitir a ideia de:

"Existe uma oportunidade para você aqui."

A identidade visual deverá ser consistente entre Android, iOS e Web, respeitando as diferenças de interação de cada plataforma.

---

# 33. Princípios de UX

## 33.1 Simplicidade

O usuário deverá conseguir entender o que fazer sem tutorial extenso.

## 33.2 Baixa barreira de entrada

Não exigir cadastro para simplesmente explorar oportunidades.

## 33.3 Clareza

Informações importantes deverão aparecer rapidamente:

- o que é o serviço;
- onde será realizado;
- quando será realizado;
- quanto paga;
- se o valor é negociável.

## 33.4 Mobile-first

A experiência deverá ser projetada prioritariamente para telas pequenas e adaptada para a Web.

## 33.5 Ação evidente

As ações principais deverão ser visualmente claras:

"Tenho interesse"

"Publicar oportunidade"

"Encontrar trabalho"

"Contratar alguém"

## 33.6 Preferências reversíveis

O usuário deverá entender que as escolhas iniciais servem para personalizar a interface e poderão ser alteradas depois.

O onboarding não deverá transmitir a ideia de que ele está escolhendo permanentemente um tipo de conta.

## 33.7 Feedback

O sistema deverá indicar claramente quando uma ação estiver carregando, for concluída ou falhar.

---

# 34. MVP — Prioridades

## 34.1 Must Have

Estas funcionalidades são essenciais para demonstrar a proposta principal.

- Aplicação funcional em Expo.
- Navegação Android, iOS e Web.
- Home.
- Onboarding de preferências.
- Alteração de preferências nas configurações.
- Navegação pública sem cadastro.
- Cadastro e login.
- Perfil básico.
- Categorias.
- Listagem de oportunidades.
- Detalhes da oportunidade.
- Criação de oportunidade.
- Edição de oportunidade.
- Cancelamento de oportunidade.
- Expiração de oportunidade.
- Registro de interesse.
- Lista de interessados.
- Chat.
- Seleção de trabalhador.
- Contratação confirmada.
- Encerramento do serviço.
- Persistência no banco de dados.
- Validação de permissões no servidor.
- Tratamento de erros e estados de carregamento.
- Dados de demonstração.
- Fluxo principal testado de ponta a ponta.

## 34.2 Should Have

Importantes, mas que poderão ser simplificadas para a apresentação se houver limitação de tempo.

- Busca;
- filtros;
- localização;
- imagens;
- foto de perfil;
- notificações dentro do aplicativo;
- ordenação;
- confirmação de serviço concluído com histórico;
- moderação administrativa básica.

## 34.3 Could Have / Futuro

- avaliações;
- reputação;
- verificação facial;
- identidade verificada;
- pagamentos;
- comissão automática;
- notificações push;
- mapa;
- geolocalização avançada;
- recomendação de oportunidades;
- algoritmo de matching;
- anúncios patrocinados;
- planos empresariais;
- sistema antifraude avançado;
- moderação automatizada.

---

# 35. Fora do escopo do protótipo

Para evitar aumento desnecessário de escopo, não serão implementados inicialmente:

- sistema financeiro;
- carteira digital;
- pagamentos;
- comissão automática;
- reconhecimento facial;
- sistema completo de reputação;
- algoritmo avançado de recomendação;
- geolocalização avançada;
- mapa;
- sistema completo de notificações push;
- suporte a múltiplos idiomas;
- painel administrativo completo;
- infraestrutura antifraude avançada.

Esses itens poderão ser adicionados em versões futuras.

---

# 36. Critérios de aceitação do MVP

O MVP será considerado funcional quando os seguintes cenários puderem ser demonstrados sem intervenção manual da equipe durante o fluxo principal.

## 36.1 Cenário principal — Trabalhador

1. O usuário abre o Freelah.
2. Seleciona a opção de encontrar trabalho.
3. Pode navegar pelas oportunidades sem cadastro.
4. Encontra uma oportunidade.
5. Abre os detalhes.
6. Tenta demonstrar interesse.
7. O aplicativo solicita autenticação.
8. O usuário cria uma conta ou entra em uma conta existente.
9. O usuário demonstra interesse.
10. O interesse é salvo no banco.
11. O contratante consegue visualizar o interessado.
12. Os usuários conversam pelo chat.
13. O contratante seleciona o trabalhador.
14. A oportunidade passa para Contratada.
15. A oportunidade deixa de aceitar novos interessados.
16. O serviço é concluído.
17. A oportunidade passa para Concluída.

## 36.2 Cenário de contratação

1. Um usuário abre o Freelah.
2. Seleciona a opção de contratar alguém.
3. A interface prioriza a publicação e o gerenciamento de oportunidades.
4. O usuário cria uma oportunidade.
5. A oportunidade é salva e publicada.
6. Outro usuário encontra a oportunidade.
7. Demonstra interesse.
8. O contratante visualiza o interesse.
9. Os usuários conversam.
10. O contratante seleciona o trabalhador.
11. A contratação é registrada.
12. O serviço pode ser concluído.

## 36.3 Cenário de preferências mistas

1. O usuário abre o aplicativo pela primeira vez.
2. Seleciona encontrar trabalho e contratar alguém.
3. A interface disponibiliza ambas as funcionalidades.
4. O usuário entra em uma conta.
5. As preferências são associadas à conta.
6. O usuário fecha e reabre o aplicativo.
7. As preferências são mantidas.
8. O usuário acessa as configurações.
9. Desativa uma preferência.
10. A interface se adapta à nova escolha.
11. Os dados e o histórico permanecem intactos.
12. O usuário pode reativar a preferência posteriormente.

## 36.4 Cenário de navegação pública

1. O usuário abre o aplicativo sem estar autenticado.
2. Escolhe suas preferências.
3. Visualiza oportunidades.
4. Navega pelas categorias.
5. Abre os detalhes de uma oportunidade.
6. Tenta executar uma ação protegida.
7. O aplicativo solicita autenticação.
8. Após o login, o usuário pode continuar o fluxo.

## 36.5 Cenário de segurança

O teste deverá verificar que:

- um usuário não consegue editar oportunidades de terceiros;
- um usuário não consegue consultar conversas das quais não participa;
- um usuário não consegue contratar alguém para uma oportunidade que não controla;
- um usuário não consegue registrar interesse duplicado;
- oportunidades encerradas não aceitam novos interessados;
- operações inválidas são rejeitadas no servidor.

---

# 37. Organização do desenvolvimento

O desenvolvimento deverá ser feito por funcionalidades completas, evitando implementar toda a interface sem conectar as operações reais.

Em vez de concluir todas as telas primeiro e deixar o backend para depois, cada funcionalidade deverá ser integrada ao fluxo correspondente.

Exemplo:

Criar oportunidade:
- tela;
- validação;
- API;
- persistência;
- exibição na lista;
- autorização;
- testes.

Chat:
- tela;
- identificação dos participantes;
- API;
- persistência;
- recuperação do histórico;
- envio de mensagens;
- autorização;
- testes.

Preferências:
- onboarding;
- seleção independente;
- persistência local;
- associação com a conta;
- configuração de preferências;
- atualização da navegação;
- testes de persistência.

Essa abordagem permitirá identificar problemas cedo e reduzir a chance de chegar à apresentação com telas que não funcionam.

---

# 38. Orientações para implementação com Claude Code

O Claude Code deverá utilizar este documento como especificação principal do produto.

## 38.1 Antes de programar

- Ler o PRD completo.
- Identificar os requisitos funcionais.
- Propor uma estrutura técnica compatível com a stack definida.
- Confirmar as versões compatíveis das dependências.
- Identificar as variáveis de ambiente necessárias.
- Definir as entidades e migrações iniciais do banco.
- Planejar a ordem de implementação e os testes.

Não deverá criar outro PRD nem substituir os requisitos deste documento por requisitos próprios.

## 38.2 Durante o desenvolvimento

- Trabalhar em etapas.
- Implementar funcionalidades completas.
- Executar os testes relevantes.
- Corrigir erros antes de avançar.
- Manter a aplicação executável ao final de cada etapa.
- Evitar alterações desnecessárias em funcionalidades já concluídas.
- Não criar interfaces que simulem operações reais sem persistência.
- Não marcar uma funcionalidade como concluída apenas porque sua tela está pronta.
- Manter a documentação atualizada.
- Preservar os requisitos do onboarding e das configurações.
- Utilizar dados de demonstração identificados como tais.

## 38.3 Decisões técnicas

O Claude poderá propor decisões técnicas internas que não alterem o produto.

Se uma decisão afetar requisitos, stack, escopo ou comportamento descrito no PRD, deverá explicar o motivo e aguardar aprovação antes de substituir a especificação.

## 38.4 Qualidade

O código deverá ser organizado, legível e compatível com a evolução futura.

A aplicação deverá possuir instruções de instalação, configuração, execução e testes.

As credenciais reais não deverão ser incluídas no repositório.

## 38.5 Critério de conclusão

O MVP só deverá ser considerado pronto quando os fluxos principais tiverem sido implementados e testados, incluindo autenticação, persistência, interesses, chat, contratação e preferências.

---

# 39. Roadmap

## Fase 1 — Fundação técnica

Objetivo: criar a base funcional.

Inclui:

- configuração do Expo;
- TypeScript;
- Expo Router;
- estrutura de pastas;
- backend Node.js;
- PostgreSQL;
- Prisma;
- configuração de ambientes;
- migrações;
- autenticação inicial.

## Fase 2 — Interface e navegação

Objetivo: tornar o produto navegável.

Inclui:

- identidade visual;
- onboarding de preferências;
- Home;
- categorias;
- exploração pública;
- detalhes das oportunidades;
- navegação mobile e web;
- estados de carregamento e erro.

## Fase 3 — Oportunidades

Objetivo: implementar o ciclo de publicação.

Inclui:

- criação;
- validação;
- publicação;
- edição;
- cancelamento;
- expiração;
- listagem;
- gerenciamento das próprias oportunidades.

## Fase 4 — Interesse e contratação

Objetivo: conectar trabalhador e contratante.

Inclui:

- registro de interesse;
- lista de interessados;
- chat;
- seleção de trabalhador;
- contratação;
- conclusão.

## Fase 5 — Perfil e segurança

Objetivo: completar os recursos necessários para uso demonstrável.

Inclui:

- perfil;
- configurações;
- preferências editáveis;
- denúncia;
- bloqueio;
- moderação básica;
- validação de permissões;
- testes de segurança.

## Fase 6 — Preparação para demonstração

Objetivo: entregar um fluxo estável para o Tech Summit.

Inclui:

- dados de demonstração;
- testes completos;
- correção de erros;
- ajustes de responsividade;
- melhoria de mensagens de erro;
- verificação de instalação e execução;
- roteiro da apresentação.

---

# 40. Métricas futuras

Caso o Freelah seja transformado em produto real, as seguintes métricas poderão ser acompanhadas.

## Aquisição

- usuários cadastrados;
- usuários ativos;
- novos usuários por semana.

## Oferta

- oportunidades publicadas;
- oportunidades ativas;
- oportunidades por categoria.

## Engajamento

- visualizações de oportunidades;
- interesses enviados;
- conversas iniciadas.

## Conversão

- oportunidades com pelo menos um interessado;
- oportunidades contratadas;
- taxa de contratação;
- tempo médio até contratação.

## Retenção

- usuários que voltam à plataforma;
- trabalhadores que realizam múltiplos serviços;
- contratantes que publicam novamente.

## Qualidade

- taxa de cancelamento;
- denúncias;
- avaliações futuras;
- serviços concluídos.

---

# 41. Divisão da equipe

A divisão da equipe poderá ser adaptada conforme os integrantes e as responsabilidades disponíveis.

Recomenda-se que cada tarefa tenha um responsável definido.

Possíveis áreas:

- Produto: requisitos, priorização e organização.
- UX/UI: fluxos, telas e identidade visual.
- Aplicativo: React Native, Expo e navegação.
- Backend: API, autenticação e regras de negócio.
- Banco de dados: modelagem, migrações e persistência.
- QA: testes e identificação de erros.
- Apresentação: demonstração, pitch e documentação.

Uma pessoa poderá assumir mais de uma área.

O importante é que as tarefas tenham responsáveis e critérios claros de conclusão.

---

# 42. Demo recomendada para o Tech Summit

A apresentação não deverá tentar mostrar todas as funcionalidades possíveis. O ideal é contar uma história simples que demonstre o valor do produto.

## História

Imagine que João precisa de uma renda extra, mas não conhece ninguém que esteja contratando.

João abre o Freelah e escolhe encontrar trabalho.

Ele encontra a oportunidade:

**Auxiliar de pintura — R$ 180.**

João abre os detalhes, cria uma conta e demonstra interesse.

O contratante visualiza o interessado e os dois conversam pelo chat.

O contratante seleciona João.

Depois da realização do serviço, a oportunidade é concluída.

A apresentação então destaca:

**O que antes dependia de indicação agora pode ser encontrado em um único lugar.**

## Demonstração complementar

Também poderá ser mostrado o fluxo de quem deseja contratar:

1. O usuário escolhe contratar alguém.
2. Publica uma oportunidade.
3. Outro usuário encontra o serviço.
4. O trabalhador demonstra interesse.
5. O contratante conversa com o interessado.
6. O contratante seleciona o trabalhador.
7. A contratação é registrada.

## Demonstração das preferências

Se houver tempo, mostrar que o mesmo usuário pode alterar suas preferências nas configurações sem criar outra conta e sem perder dados.

---

# 43. Critérios gerais de qualidade para a apresentação

Antes da apresentação, o protótipo deverá:

- funcionar no navegador;
- funcionar em dispositivos móveis compatíveis;
- apresentar identidade visual consistente;
- possuir navegação coerente;
- permitir explorar oportunidades sem cadastro;
- permitir publicar oportunidades com uma conta;
- persistir dados reais;
- permitir demonstrar interesse;
- permitir a comunicação entre participantes;
- permitir selecionar um trabalhador;
- permitir concluir uma oportunidade;
- permitir alterar preferências;
- apresentar estados de carregamento;
- apresentar mensagens de erro compreensíveis;
- não depender de intervenção manual durante a demonstração principal.

A versão Android poderá ser demonstrada por instalação em dispositivo ou outro método compatível com o estágio de desenvolvimento. A versão iOS deverá ser preparada de acordo com as ferramentas e os requisitos de distribuição disponíveis.

---

# 44. Princípios de evolução futura

O MVP não deverá implementar antecipadamente todos os recursos de uma plataforma comercial completa.

Entretanto, sua arquitetura deverá evitar decisões que tornem a evolução desnecessariamente difícil.

A estrutura deverá permitir adicionar futuramente:

- avaliações;
- reputação;
- pagamentos;
- notificações;
- verificação de identidade;
- categorias adicionais;
- busca avançada;
- ferramentas empresariais;
- métricas de uso;
- mecanismos de segurança aprimorados.

A evolução deverá ocorrer por meio de novas funcionalidades e migrações controladas, preservando os dados existentes.

---

# 45. Resumo executivo

O Freelah é uma plataforma de conexão entre trabalhadores e contratantes, com foco inicial em pessoas que procuram oportunidades de trabalho temporário e prestação de serviços.

O produto busca reduzir a dependência de indicações e aumentar a visibilidade de profissionais que possuem dificuldade para encontrar clientes.

O MVP será desenvolvido utilizando:

- Expo;
- React Native;
- Expo Router;
- TypeScript;
- Node.js;
- API REST;
- PostgreSQL;
- Prisma.

A base de código deverá compartilhar o máximo possível entre Android, iOS e Web.

O produto deverá oferecer navegação pública sem cadastro, autenticação para ações protegidas, publicação de oportunidades, registro de interesse, chat, contratação e conclusão do serviço.

Na primeira utilização, o usuário escolherá se deseja encontrar trabalho, contratar alguém ou realizar ambas as atividades. Essas preferências personalizarão a interface, mas não definirão permissões permanentes. O usuário poderá modificá-las posteriormente nas configurações, sem criar outra conta ou perder dados.

O fluxo principal será:

**Encontrar → Demonstrar interesse → Conversar → Contratar → Concluir.**

E, no sentido inverso:

**Publicar → Receber interessados → Conversar → Selecionar → Concluir.**

O objetivo do protótipo não é provar que todos os problemas do mercado foram resolvidos. É provar que o conceito funciona: uma pessoa consegue encontrar uma oportunidade que talvez nunca encontrasse por conta própria, e outra consegue encontrar alguém para realizar um serviço.

**O Freelah deverá tornar mais simples a conexão entre quem precisa trabalhar e quem precisa de um serviço.**