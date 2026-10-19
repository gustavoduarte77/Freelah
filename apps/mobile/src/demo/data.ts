import { makeExcerpt, type CompletedService, type ProfileRole } from "@freelah/shared";

// Dados fictícios do Modo Demonstração Offline. Nada aqui existe no banco real; as datas são
// relativas ao dia em que o aplicativo é aberto, para que nenhuma oportunidade apareça expirada.

export const DEMO_EMAIL = "usuario@gmail.com";
export const DEMO_PASSWORD = "12345678";

export const DEMO_USER = {
  id: "demo-user-lucas",
  name: "Lucas Oliveira",
  email: DEMO_EMAIL,
  phone: "32987654321",
  city: "Cataguases",
};

// Os ids têm formato de UUID porque o formulário de publicar valida `categoryId` com o mesmo esquema
// da API real (que exige UUID). São fixos e só existem neste modo.
export const CATEGORIES = [
  { id: "d3a10001-0000-4000-8000-000000000001", slug: "servicos-domesticos", name: "Serviços Domésticos" },
  { id: "d3a10001-0000-4000-8000-000000000002", slug: "servicos-comerciais", name: "Serviços Comerciais" },
  { id: "d3a10001-0000-4000-8000-000000000003", slug: "construcao-civil", name: "Construção Civil" },
  { id: "d3a10001-0000-4000-8000-000000000004", slug: "servicos-de-manutencao", name: "Serviços de Manutenção" },
  { id: "d3a10001-0000-4000-8000-000000000005", slug: "aulas-particulares", name: "Aulas Particulares" },
  { id: "d3a10001-0000-4000-8000-000000000006", slug: "tecnologia-e-suporte", name: "Tecnologia e Suporte" },
  { id: "d3a10001-0000-4000-8000-000000000007", slug: "sites-e-aplicativos", name: "Sites e Aplicativos" },
  { id: "d3a10001-0000-4000-8000-000000000008", slug: "design-e-criacao-digital", name: "Design e Criação Digital" },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]["slug"];

const now = new Date();

function dayOffset(days: number): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0);
  return date;
}

function isoDay(days: number): string {
  const d = dayOffset(days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Horário de hoje (hora local) como ISO, para as mensagens do roteiro. */
function todayAt(hour: number, minute: number): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0).toISOString();
}

function daysAgo(days: number): string {
  return dayOffset(-days).toISOString();
}

export interface DemoJob {
  id: string;
  key: string;
  title: string;
  description: string;
  additionalInfo: string | null;
  category: (typeof CATEGORIES)[number];
  city: string;
  state: string;
  scheduledDate: string;
  startTime: string;
  /** Centavos; `null` = "A negociar" (os anúncios fictícios sempre têm valor). */
  proposedPriceCents: number | null;
  negotiable: boolean;
  ownerName: string;
  ownerCity: string;
  /** Pertence à conta de demonstração (aparece em "Minhas oportunidades"). */
  mine: boolean;
  /** Criada durante a apresentação e ainda não publicada: só a dona a vê. */
  draft?: boolean;
  /** Quantas fotos tem: nos anúncios fictícios é só um número (não há imagens); nos criados, as fotos reais. */
  photoCount?: number;
  publishedAt: string;
  expiresAt: string;
  createdAt: string;
  excerpt: string;
}

interface JobSeed {
  key: string;
  title: string;
  cat: CategorySlug;
  owner: string;
  ownerCity: string;
  city: string;
  inDays: number;
  time: string;
  cents: number;
  negotiable?: boolean;
  publishedDaysAgo: number;
  description: string;
  extra?: string;
  mine?: boolean;
  /** Quantas fotos o anúncio fictício "tem" (só o ícone aparece; não há imagens). */
  photos?: number;
}

const SEEDS: JobSeed[] = [
  {
    key: "pintura",
    photos: 3,
    title: "Pintura de sala residencial",
    cat: "construcao-civil",
    owner: "Mariana Costa",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 6,
    time: "09:00",
    cents: 25000,
    publishedDaysAgo: 2,
    description:
      "Preciso pintar a sala do meu apartamento, com cerca de 20 m². As paredes estão em bom estado, só precisam de lixa leve e duas demãos de tinta. A tinta e os materiais de proteção já foram comprados; falta apenas a mão de obra.",
    extra: "Edifício com elevador. Posso deixar a chave com o porteiro. O serviço deve terminar em um dia.",
  },
  {
    key: "ventilador",
    photos: 2,
    title: "Instalação de ventilador de teto",
    cat: "servicos-de-manutencao",
    owner: "Carlos Almeida",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 8,
    time: "14:00",
    cents: 12000,
    publishedDaysAgo: 3,
    description:
      "Instalação de dois ventiladores de teto no quarto e na sala de casa térrea. Os equipamentos já estão na embalagem e há ponto de energia no teto dos dois cômodos. Preciso de alguém com experiência em instalações elétricas simples.",
    extra: "Levar escada própria. O serviço leva em torno de duas horas.",
  },
  {
    key: "torneira",
    photos: 1,
    title: "Reparo de torneira e vazamento na cozinha",
    cat: "servicos-de-manutencao",
    owner: "Fernanda Lima",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 5,
    time: "10:30",
    cents: 15000,
    publishedDaysAgo: 1,
    description:
      "A torneira da pia da cozinha está pingando e há um pequeno vazamento no sifão embaixo da pia. Preciso trocar o reparo ou a torneira e vedar o sifão. As peças podem ser compradas por mim, se o profissional indicar quais.",
  },
  {
    key: "limpeza-obra",
    title: "Limpeza pós-obra em apartamento",
    cat: "servicos-domesticos",
    owner: "Rafael Mendes",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 7,
    time: "08:00",
    cents: 38000,
    negotiable: true,
    publishedDaysAgo: 4,
    description:
      "Apartamento de 70 m² recém-reformado, com poeira de obra em pisos, janelas, portas e banheiros. Preciso de limpeza pesada em um dia, com produtos e equipamentos por conta de quem for realizar o serviço.",
    extra: "Há elevador de serviço. Previsão de 8 horas de trabalho.",
  },
  {
    key: "matematica",
    title: "Aulas de matemática para o ensino médio",
    cat: "aulas-particulares",
    owner: "Beatriz Ramos",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 9,
    time: "18:30",
    cents: 9000,
    publishedDaysAgo: 5,
    description:
      "Procuro professor ou estudante de exatas para reforço de matemática de um aluno do 2º ano do ensino médio, com foco em funções e trigonometria. Duas aulas por semana, de uma hora, na casa do aluno.",
    extra: "Valor por aula. Material didático fornecido pela família.",
  },
  {
    key: "estante",
    photos: 4,
    title: "Montagem de móveis de escritório",
    cat: "servicos-comerciais",
    owner: "Alfa Contabilidade",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 10,
    time: "13:00",
    cents: 30000,
    publishedDaysAgo: 3,
    description:
      "Montagem de quatro mesas, duas estantes e um armário de arquivo para o escritório de contabilidade. Os móveis já estão no local, com todas as ferragens e manuais. A montagem deve ocorrer fora do horário de atendimento.",
  },
  {
    key: "banheiro",
    photos: 3,
    title: "Troca de revestimento de banheiro",
    cat: "construcao-civil",
    owner: "Paulo Henrique",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 14,
    time: "08:00",
    cents: 180000,
    negotiable: true,
    publishedDaysAgo: 6,
    description:
      "Retirada do revestimento antigo e assentamento de porcelanato nas paredes de um banheiro de 4 m². O material já foi comprado. Preciso de profissional com experiência em impermeabilização e rejuntamento.",
    extra: "Serviço previsto para três dias de trabalho. Entulho será retirado por caçamba contratada à parte.",
  },
  {
    key: "jardim",
    photos: 2,
    title: "Jardinagem e poda em quintal",
    cat: "servicos-domesticos",
    owner: "Helena Martins",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 6,
    time: "07:30",
    cents: 20000,
    publishedDaysAgo: 2,
    description:
      "Poda de duas árvores pequenas, corte de grama e limpeza de canteiros em quintal de 120 m². Os resíduos podem ser deixados em sacos na calçada para a coleta municipal.",
  },
  {
    key: "ingles",
    title: "Aulas de inglês para conversação",
    cat: "aulas-particulares",
    owner: "Thiago Barbosa",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 11,
    time: "19:00",
    cents: 8000,
    publishedDaysAgo: 4,
    description:
      "Busco aulas de conversação em inglês, nível intermediário, para me preparar para entrevistas de emprego. Prefiro aulas online de uma hora, duas vezes por semana, em horário noturno.",
  },
  {
    key: "estoque",
    photos: 1,
    title: "Organização de estoque de padaria",
    cat: "servicos-comerciais",
    owner: "Padaria Pão Quente",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 7,
    time: "15:00",
    cents: 22000,
    publishedDaysAgo: 2,
    description:
      "Organização da despensa e do estoque de insumos da padaria, com etiquetagem por validade e planilha simples de controle. Serviço de uma tarde, sem interrupção do atendimento ao público.",
  },
  {
    key: "piso",
    photos: 3,
    title: "Assentamento de piso cerâmico na varanda",
    cat: "construcao-civil",
    owner: "José Roberto Silva",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 12,
    time: "08:00",
    cents: 95000,
    publishedDaysAgo: 5,
    description:
      "Varanda de 18 m² para receber piso cerâmico novo. O contrapiso já está nivelado e o material comprado. Preciso de pedreiro ou assentador para a aplicação e o rejunte.",
    extra: "Possível terminar em dois dias.",
  },
  {
    key: "diarista",
    title: "Diarista para limpeza semanal",
    cat: "servicos-domesticos",
    owner: "Cláudia Souza",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 5,
    time: "08:00",
    cents: 16000,
    publishedDaysAgo: 1,
    description:
      "Limpeza completa de casa de dois quartos, uma vez por semana, com início na semana que vem. Os produtos de limpeza ficam por conta da casa. Preferência por quem tenha referências.",
  },
  // Oportunidades publicadas pela conta de demonstração (ela também contrata).
  {
    key: "guarda-roupa",
    photos: 4,
    title: "Montagem de guarda-roupa de 6 portas",
    cat: "servicos-domesticos",
    owner: "Lucas Oliveira",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 9,
    time: "10:00",
    cents: 20000,
    publishedDaysAgo: 2,
    description:
      "Guarda-roupa de 6 portas, com manual e ferragens completas, ainda na caixa. Preciso de alguém com experiência em montagem de móveis, que traga as próprias ferramentas e consiga finalizar no mesmo dia.",
    extra: "Apartamento no 3º andar, com elevador.",
    mine: true,
  },
  {
    key: "violao",
    photos: 2,
    title: "Aulas de violão para criança de 10 anos",
    cat: "aulas-particulares",
    owner: "Lucas Oliveira",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 13,
    time: "16:00",
    cents: 7000,
    publishedDaysAgo: 3,
    description:
      "Procuro professor de violão paciente para aulas semanais com minha filha de 10 anos, iniciante. As aulas seriam em casa, aos sábados à tarde, com duração de uma hora.",
    mine: true,
  },
  {
    // Segundo roteiro: aqui a conta de demonstração é quem contrata (veja HIRE_* abaixo).
    key: "eletrica",
    photos: 2,
    negotiable: true,
    title: "Troca de chuveiro e tomadas da cozinha",
    cat: "servicos-de-manutencao",
    owner: "Lucas Oliveira",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 5,
    time: "08:00",
    cents: 18000,
    publishedDaysAgo: 1,
    description:
      "Preciso trocar o chuveiro elétrico do banheiro (220 V) e substituir duas tomadas antigas da cozinha. O chuveiro novo e as tomadas já foram comprados; falta um eletricista para a instalação.",
    extra: "Casa térrea. O quadro de energia fica na área de serviço.",
    mine: true,
  },
  {
    key: "notebook",
    photos: 2,
    title: "Formatação e limpeza de notebook lento",
    cat: "tecnologia-e-suporte",
    owner: "Renato Faria",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 4,
    time: "15:00",
    cents: 12000,
    negotiable: true,
    publishedDaysAgo: 1,
    description:
      "Meu notebook está muito lento e demora para ligar. Preciso de alguém para formatar, reinstalar o Windows e os programas básicos (navegador, leitor de PDF e pacote de escritório) e fazer uma limpeza interna. Os arquivos já estão salvos em um HD externo.",
    extra: "Posso levar o notebook até o local combinado ou receber o profissional em casa.",
  },
  {
    key: "wifi",
    photos: 1,
    title: "Configuração de Wi-Fi e roteador em casa",
    cat: "tecnologia-e-suporte",
    owner: "Beatriz Moreira",
    ownerCity: "Leopoldina",
    city: "Leopoldina",
    inDays: 3,
    time: "10:00",
    cents: 9000,
    publishedDaysAgo: 1,
    description:
      "O sinal de internet não chega aos quartos do fundo da casa. Preciso de ajuda para configurar o roteador novo, reposicionar o equipamento e instalar um repetidor de sinal. Todos os equipamentos já foram comprados.",
    extra: "Casa com dois andares. O roteador fica na sala.",
  },
  {
    key: "site-loja",
    photos: 3,
    title: "Criação de site simples para loja de roupas",
    cat: "sites-e-aplicativos",
    owner: "Loja Estilo Mineiro",
    ownerCity: "Muriaé",
    city: "Muriaé",
    inDays: 12,
    time: "09:00",
    cents: 80000,
    negotiable: true,
    publishedDaysAgo: 0,
    description:
      "Quero um site de apresentação para a loja, com página inicial, catálogo de produtos com fotos, endereço, horário de funcionamento e botão para contato por WhatsApp. Não precisa de pagamento online. Tenho logotipo e fotos dos produtos.",
    extra: "Combino as etapas por mensagem. Prefiro entregas parciais a cada semana.",
  },
  {
    key: "planilha",
    photos: 2,
    title: "Automação de planilha de controle de estoque",
    cat: "sites-e-aplicativos",
    owner: "Padaria Pão Quente",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 7,
    time: "13:30",
    cents: 35000,
    publishedDaysAgo: 0,
    description:
      "Controlo o estoque da padaria em uma planilha e quero que ela calcule sozinha as quantidades mínimas, avise quando um item estiver acabando e gere um resumo semanal de compras. Preciso de alguém que conheça fórmulas e automações de planilha.",
    extra: "A planilha atual tem cerca de 120 itens.",
  },
  {
    key: "logotipo",
    photos: 3,
    title: "Criação de logotipo para confeitaria caseira",
    cat: "design-e-criacao-digital",
    owner: "Juliana Prado",
    ownerCity: "Cataguases",
    city: "Cataguases",
    inDays: 9,
    time: "16:00",
    cents: 25000,
    negotiable: true,
    publishedDaysAgo: 0,
    description:
      "Estou abrindo uma confeitaria caseira e preciso de um logotipo simples e delicado, em versão colorida e em preto e branco, para usar em embalagens e redes sociais. Aceito até duas rodadas de ajustes.",
    extra: "Entrega dos arquivos em PNG e PDF.",
  },
  {
    key: "posts-video",
    photos: 4,
    title: "Posts para redes sociais e edição de vídeo curto",
    cat: "design-e-criacao-digital",
    owner: "Studio Corpo em Movimento",
    ownerCity: "Leopoldina",
    city: "Leopoldina",
    inDays: 6,
    time: "11:00",
    cents: 40000,
    publishedDaysAgo: 0,
    description:
      "Preciso de 8 posts para o Instagram do estúdio de pilates e da edição de um vídeo de 40 segundos com legenda e trilha livre de direitos autorais. Envio os textos e o material bruto pelo chat.",
    extra: "Prazo de entrega de uma semana depois de receber o material.",
  },
];

export const JOBS: DemoJob[] = SEEDS.map((seed) => ({
  id: `demo-job-${seed.key}`,
  key: seed.key,
  title: seed.title,
  description: seed.description,
  additionalInfo: seed.extra ?? null,
  category: CATEGORIES.find((c) => c.slug === seed.cat)!,
  city: seed.city,
  state: "MG",
  scheduledDate: isoDay(seed.inDays),
  startTime: seed.time,
  proposedPriceCents: seed.cents,
  negotiable: seed.negotiable ?? false,
  ownerName: seed.owner,
  ownerCity: seed.ownerCity,
  mine: seed.mine ?? false,
  photoCount: seed.photos ?? 0,
  publishedAt: daysAgo(seed.publishedDaysAgo),
  expiresAt: dayOffset(seed.inDays - 1).toISOString(),
  createdAt: daysAgo(seed.publishedDaysAgo + 1),
  excerpt: makeExcerpt(seed.description),
}));

export const JOB_BY_ID = new Map(JOBS.map((job) => [job.id, job]));

// ---------------------------------------------------------------------------
// Roteiro principal (Lucas, prestador, e Mariana, contratante da pintura)
// ---------------------------------------------------------------------------

export const SCRIPT_JOB_ID = "demo-job-pintura";
export const SCRIPT_CONVERSATION_ID = "demo-conversation-pintura";
export const SCRIPT_OTHER_NAME = "Mariana Costa";
export const SCRIPT_OTHER_PROFILE_ID = "demo-profile-mariana";

// ---------------------------------------------------------------------------
// Segundo roteiro (Lucas contrata Roberto, eletricista, para a troca do chuveiro)
// ---------------------------------------------------------------------------

export const HIRE_JOB_ID = "demo-job-eletrica";
export const HIRE_CONVERSATION_ID = "demo-conversation-eletrica";
export const HIRE_OTHER_NAME = "Roberto Andrade";
export const HIRE_OTHER_CITY = "Cataguases";
export const HIRE_OTHER_PROFILE_ID = "demo-profile-roberto";

/**
 * Roberto NÃO envia proposta no roteiro (a conversa segue direto para o convite). Esta etapa fica fora do
 * alcance do roteiro de propósito: nenhuma proposta do roteiro é criada, e as salvas de versões antigas são
 * removidas ao carregar. Lucas ainda pode propor um valor nessa conversa (o anúncio é negociável).
 */
export const HIRE_PROPOSAL_STEP = 99;
export const HIRE_PROPOSAL_AMOUNT_CENTS = 16500;

/** Etapas: 1 = interesse de Roberto, conversa vazia; 2 a 5 = uma mensagem por etapa; 6 = Roberto aceita o convite. */
export const HIRE_TOTAL_STEPS = 6;
export const HIRE_ACCEPT_STEP = 6;

export const HIRE_INTEREST_CREATED_AT = daysAgo(1);

/** `fromMe` é do ponto de vista de Lucas (o contratante, nesta conversa). */
export const HIRE_MESSAGES: Array<{ id: string; fromMe: boolean; content: string; createdAt: string }> = [
  { id: "demo-hire-msg-1", fromMe: false, content: "Olá, Lucas! Sou eletricista aqui em Cataguases e vi sua oportunidade da troca do chuveiro. Posso ajudar.", createdAt: todayAt(10, 12) },
  { id: "demo-hire-msg-2", fromMe: true, content: "Oi, Roberto! O chuveiro é de 220 V e são duas tomadas na cozinha. O material já está comprado.", createdAt: todayAt(10, 15) },
  { id: "demo-hire-msg-3", fromMe: false, content: "Perfeito. Levo minhas ferramentas e confiro o disjuntor antes da troca. Consigo no dia e horário do anúncio.", createdAt: todayAt(10, 17) },
  { id: "demo-hire-msg-4", fromMe: true, content: "Combinado! Vou te enviar o convite pelo Freelah.", createdAt: todayAt(10, 18) },
];

// ---------------------------------------------------------------------------
// Perfis públicos. As avaliações existem só no perfil do profissional e são fictícias (isDemo).
// ---------------------------------------------------------------------------

/** Id do perfil público da própria conta de demonstração (Lucas): o único que a edição de perfil altera. */
export const DEMO_OWN_PROFILE_ID = "demo-profile-lucas";

const completed = (id: string, title: string, description: string, days: number, photoCount: number): CompletedService => ({
  id,
  title,
  description,
  completedAt: daysAgo(days),
  photoCount,
});

export const PROFILES = [
  {
    id: SCRIPT_OTHER_PROFILE_ID,
    name: SCRIPT_OTHER_NAME,
    city: "Cataguases",
    state: "MG",
    avatarUrl: null,
    headline: null,
    bio: "Moro em Cataguases e uso o Freelah para encontrar profissionais da região para pequenos serviços em casa.",
    // Contratante: não oferece serviços nem tem avaliações profissionais, então essas seções não aparecem.
    services: [],
    reviews: [] as DemoReview[],
    completedServices: [] as CompletedService[],
    roles: ["CLIENT"] as ProfileRole[],
    isDemo: true,
  },
  {
    id: "demo-profile-carlos",
    name: "Carlos Almeida",
    city: "Cataguases",
    state: "MG",
    avatarUrl: null,
    headline: null,
    bio: "Reformando a casa aos poucos e contratando profissionais da região para os serviços que não consigo fazer.",
    services: [],
    reviews: [] as DemoReview[],
    completedServices: [] as CompletedService[],
    roles: ["CLIENT"] as ProfileRole[],
    isDemo: true,
  },
  {
    id: "demo-profile-fernanda",
    name: "Fernanda Lima",
    city: "Cataguases",
    state: "MG",
    avatarUrl: null,
    headline: null,
    bio: "Moro em apartamento alugado e procuro quem resolva pequenos reparos hidráulicos e elétricos com cuidado.",
    services: [],
    reviews: [] as DemoReview[],
    completedServices: [] as CompletedService[],
    roles: ["CLIENT"] as ProfileRole[],
    isDemo: true,
  },
  {
    id: "demo-profile-paulo",
    name: "Paulo Henrique",
    city: "Cataguases",
    state: "MG",
    avatarUrl: null,
    headline: null,
    bio: "Estou reformando o banheiro da casa e prefiro combinar valores e prazos direto com quem vai executar o serviço.",
    services: [],
    reviews: [] as DemoReview[],
    completedServices: [] as CompletedService[],
    roles: ["CLIENT"] as ProfileRole[],
    isDemo: true,
  },
  {
    // A própria conta de demonstração (sem telefone nem e-mail). Editável em "Meu perfil".
    id: DEMO_OWN_PROFILE_ID,
    name: DEMO_USER.name,
    city: DEMO_USER.city,
    state: "MG",
    avatarUrl: null,
    headline: "Pintura e pequenos reparos",
    bio: "Faço pintura residencial e pequenos serviços de manutenção em Cataguases e região.",
    services: ["Pintura residencial", "Instalação de ventiladores e luminárias", "Pequenos reparos hidráulicos"],
    // Serviço com avaliação (mesmo serviceId), serviço sem avaliação e avaliação sem publicação.
    completedServices: [
      completed("demo-service-lucas-quarto", "Pintura de quarto", "Pintura de um quarto de 12 m² com duas demãos e acabamento liso. Tudo protegido e limpo no fim do dia.", 18, 3),
      completed("demo-service-lucas-ventilador", "Instalação de ventilador de teto", "Ventilador de teto instalado na sala, com teste de funcionamento e velocidades.", 34, 2),
    ],
    reviews: [
      { author: "Carolina T.", rating: 5, comment: "Quarto pintado no prazo e sem sujeira. Recomendo.", serviceTitle: "Pintura de quarto", serviceId: "demo-service-lucas-quarto", createdAt: daysAgo(16) },
      { author: "Marcos V.", rating: 4, comment: "Bom trabalho e atencioso com os móveis.", serviceTitle: null, serviceId: null, createdAt: daysAgo(52) },
    ] as DemoReview[],
    roles: ["PROFESSIONAL", "CLIENT"] as ProfileRole[],
    isDemo: true,
  },
  {
    id: HIRE_OTHER_PROFILE_ID,
    name: HIRE_OTHER_NAME,
    city: HIRE_OTHER_CITY,
    state: "MG",
    avatarUrl: null,
    headline: "Eletricista residencial",
    bio: "Faço instalações e reparos elétricos em casas e pequenos comércios de Cataguases e região. Explico o serviço antes de começar e deixo tudo limpo ao terminar.",
    services: ["Instalação de chuveiros", "Troca de tomadas e interruptores", "Instalação de luminárias", "Revisão de quadro de energia"],
    completedServices: [
      completed("demo-service-roberto-chuveiro", "Instalação de chuveiro elétrico", "Chuveiro de 220 V instalado com fiação nova e disjuntor adequado, testado antes de ir embora.", 12, 3),
      completed("demo-service-roberto-tomadas", "Troca de tomadas da cozinha", "Troca de quatro tomadas e dois interruptores na cozinha, com a energia desligada e tudo conferido.", 26, 2),
      completed("demo-service-roberto-quadro", "Revisão de quadro de energia", "Revisão do quadro de uma casa térrea, com identificação dos circuitos e aperto das conexões.", 60, 1),
    ],
    reviews: [
      { author: "Helena M.", rating: 5, comment: "Trocou o chuveiro rapidinho e ainda explicou como evitar o disjuntor desarmando.", serviceTitle: "Instalação de chuveiro elétrico", serviceId: "demo-service-roberto-chuveiro", createdAt: daysAgo(12) },
      { author: "Sérgio P.", rating: 5, comment: "Pontual e caprichoso. Deixou a cozinha limpa depois de trocar as tomadas.", serviceTitle: "Troca de tomadas da cozinha", serviceId: "demo-service-roberto-tomadas", createdAt: daysAgo(26) },
      // Avaliação sem publicação: o serviço dela não foi publicado no perfil.
      { author: "Ana Clara R.", rating: 4, comment: "Ótimo serviço. Só precisou remarcar o horário uma vez, mas avisou com antecedência.", serviceTitle: "Instalação de luminárias", serviceId: null, createdAt: daysAgo(41) },
    ] as DemoReview[],
    roles: ["PROFESSIONAL"] as ProfileRole[],
    isDemo: true,
  },
];

/** Avaliação de exemplo do perfil (ligada a um serviço concluído por `serviceId`, ou não). */
export interface DemoReview {
  author: string;
  rating: number;
  comment: string;
  serviceTitle: string | null;
  serviceId: string | null;
  createdAt: string;
}

/** Etapas: 1 = interesse registrado; 2 a 6 = uma mensagem por etapa; 7 = convite formal. */
export const TOTAL_STEPS = 7;
export const INVITE_STEP = 7;

export const SCRIPT_MESSAGES: Array<{ id: string; fromMe: boolean; content: string; createdAt: string }> = [
  { id: "demo-msg-1", fromMe: false, content: "Olá, Lucas! Vi seu interesse na pintura da sala. Você tem disponibilidade?", createdAt: todayAt(14, 2) },
  { id: "demo-msg-2", fromMe: true, content: "Olá, Mariana! Tenho sim. Você poderia me informar o tamanho aproximado da sala?", createdAt: todayAt(14, 4) },
  { id: "demo-msg-3", fromMe: false, content: "São cerca de 20 m². A tinta já está comprada.", createdAt: todayAt(14, 5) },
  { id: "demo-msg-4", fromMe: true, content: "Perfeito! Nesse caso consigo realizar o serviço pelo valor anunciado.", createdAt: todayAt(14, 7) },
  { id: "demo-msg-5", fromMe: false, content: "Ótimo! Vou enviar o convite para confirmar sua contratação.", createdAt: todayAt(14, 8) },
];

/** Interesses da conta em oportunidades de outras pessoas, além da pintura. */
export const OTHER_INTERESTS = [
  { id: "demo-interest-ventilador", jobId: "demo-job-ventilador", createdAt: daysAgo(2) },
  { id: "demo-interest-torneira", jobId: "demo-job-torneira", createdAt: daysAgo(1) },
  { id: "demo-interest-banheiro", jobId: "demo-job-banheiro", createdAt: daysAgo(1) },
];

/** Quem demonstrou interesse nas oportunidades da conta (só nome e cidade, como na API real). */
export const INTERESTED_IN_MINE: Record<string, Array<{ id: string; name: string; city: string; createdAt: string }>> = {
  "demo-job-guarda-roupa": [
    { id: "demo-int-guarda-1", name: "Gabriel Pereira", city: "Cataguases", createdAt: daysAgo(1) },
    { id: "demo-int-guarda-2", name: "Renata Duarte", city: "Cataguases", createdAt: daysAgo(1) },
  ],
  "demo-job-violao": [{ id: "demo-int-violao-1", name: "Camila Nunes", city: "Cataguases", createdAt: daysAgo(2) }],
};

export const SCRIPT_INTEREST_CREATED_AT = daysAgo(1);

// ---------------------------------------------------------------------------
// Conversas de exemplo (além dos dois roteiros). Lucas é o profissional que demonstrou interesse; as
// mensagens são fixas e não podem ser enviadas. Servem para mostrar o contexto de cada serviço: valor
// fixo (sem propostas) e valor negociável (dá para "Propor valor" e simular a resposta).
// ---------------------------------------------------------------------------

const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

export interface StaticConversation {
  id: string;
  jobId: string;
  interestId: string;
  otherName: string;
  otherProfileId: string;
  /** `fromMe` é do ponto de vista de Lucas. */
  messages: Array<{ id: string; fromMe: boolean; content: string; createdAt: string }>;
}

export const STATIC_CONVERSATIONS: StaticConversation[] = [
  {
    id: "demo-conversation-ventilador",
    jobId: "demo-job-ventilador",
    interestId: "demo-interest-ventilador",
    otherName: "Carlos Almeida",
    otherProfileId: "demo-profile-carlos",
    messages: [
      { id: "demo-vent-1", fromMe: false, content: "Oi, Lucas! Vi que você demonstrou interesse na instalação dos ventiladores. Você já instalou ventilador de teto antes?", createdAt: minutesAgo(190) },
      { id: "demo-vent-2", fromMe: true, content: "Oi, Carlos! Já instalei vários, em laje e em forro de madeira. Faço a fixação e a ligação elétrica com segurança.", createdAt: minutesAgo(185) },
      { id: "demo-vent-3", fromMe: false, content: "Ótimo. São dois ventiladores, no quarto e na sala. O valor anunciado de R$ 120,00 está de acordo para você?", createdAt: minutesAgo(170) },
      { id: "demo-vent-4", fromMe: true, content: "Está sim, R$ 120,00 pelos dois. Levo a escada e as ferramentas.", createdAt: minutesAgo(165) },
      { id: "demo-vent-5", fromMe: false, content: "Perfeito. Vou conferir minha agenda e te envio o convite pelo Freelah para confirmar a contratação.", createdAt: minutesAgo(150) },
    ],
  },
  {
    id: "demo-conversation-torneira",
    jobId: "demo-job-torneira",
    interestId: "demo-interest-torneira",
    otherName: "Fernanda Lima",
    otherProfileId: "demo-profile-fernanda",
    messages: [
      { id: "demo-torn-1", fromMe: true, content: "Olá, Fernanda! Tenho interesse no reparo da torneira. O vazamento é no registro ou na própria torneira?", createdAt: minutesAgo(1560) },
      { id: "demo-torn-2", fromMe: false, content: "Olá, Lucas! É na torneira da pia da cozinha, pinga o dia todo. Acho que precisa trocar o vedante.", createdAt: minutesAgo(1540) },
      { id: "demo-torn-3", fromMe: true, content: "Provavelmente é o vedante ou o reparo interno. Levo as peças de reposição; se precisar trocar a torneira inteira, aviso antes de qualquer custo.", createdAt: minutesAgo(1520) },
      { id: "demo-torn-4", fromMe: false, content: "Combinado. Pode ser na data do anúncio, às 10h30?", createdAt: minutesAgo(1500) },
      { id: "demo-torn-5", fromMe: true, content: "Pode sim. Fico no aguardo do seu convite para confirmar.", createdAt: minutesAgo(1490) },
    ],
  },
  {
    id: "demo-conversation-banheiro",
    jobId: "demo-job-banheiro",
    interestId: "demo-interest-banheiro",
    otherName: "Paulo Henrique",
    otherProfileId: "demo-profile-paulo",
    messages: [
      { id: "demo-banh-1", fromMe: false, content: "Boa tarde, Lucas. Recebi seu interesse na troca do revestimento do banheiro. São cerca de 6 m² de parede e 4 m² de piso.", createdAt: minutesAgo(300) },
      { id: "demo-banh-2", fromMe: true, content: "Boa tarde, Paulo! Pelo tamanho, faço em dois a três dias, com remoção do antigo e rejunte. Você já tem o material?", createdAt: minutesAgo(290) },
      { id: "demo-banh-3", fromMe: false, content: "O revestimento já está comprado. O valor anunciado é R$ 1.800,00, mas é negociável. Você consegue fazer por menos?", createdAt: minutesAgo(270) },
      { id: "demo-banh-4", fromMe: true, content: "Se eu usar a argamassa que você já comprou, consigo por R$ 1.650,00 com a mão de obra completa.", createdAt: minutesAgo(260) },
      { id: "demo-banh-5", fromMe: false, content: "Fechado nesse valor. Registre a proposta aqui no Freelah para ficar combinado, por favor.", createdAt: minutesAgo(240) },
    ],
  },
];

export const STATIC_CONVERSATION_IDS: readonly string[] = STATIC_CONVERSATIONS.map((item) => item.id);
