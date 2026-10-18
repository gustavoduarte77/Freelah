import { makeExcerpt } from "@freelah/shared";

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

export const CATEGORIES = [
  { id: "demo-cat-domesticos", slug: "servicos-domesticos", name: "Serviços Domésticos" },
  { id: "demo-cat-comerciais", slug: "servicos-comerciais", name: "Serviços Comerciais" },
  { id: "demo-cat-construcao", slug: "construcao-civil", name: "Construção Civil" },
  { id: "demo-cat-manutencao", slug: "servicos-de-manutencao", name: "Serviços de Manutenção" },
  { id: "demo-cat-aulas", slug: "aulas-particulares", name: "Aulas Particulares" },
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
  proposedPriceCents: number;
  negotiable: boolean;
  ownerName: string;
  ownerCity: string;
  /** Pertence à conta de demonstração (aparece em "Minhas oportunidades"). */
  mine: boolean;
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
}

const SEEDS: JobSeed[] = [
  {
    key: "pintura",
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
    reviews: [],
    isDemo: true,
  },
  {
    // A própria conta de demonstração (sem telefone nem e-mail). Ainda não há link para ela no app.
    id: "demo-profile-lucas",
    name: DEMO_USER.name,
    city: DEMO_USER.city,
    state: "MG",
    avatarUrl: null,
    headline: null,
    bio: "Faço pintura residencial e pequenos serviços de manutenção em Cataguases e região.",
    services: ["Pintura residencial", "Instalação de ventiladores e luminárias", "Pequenos reparos hidráulicos"],
    reviews: [],
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
    reviews: [
      { author: "Helena M.", rating: 5, comment: "Trocou o chuveiro rapidinho e ainda explicou como evitar o disjuntor desarmando.", serviceTitle: "Instalação de chuveiro", createdAt: daysAgo(12) },
      { author: "Sérgio P.", rating: 5, comment: "Pontual e caprichoso. Deixou a cozinha limpa depois de trocar as tomadas.", serviceTitle: "Troca de tomadas", createdAt: daysAgo(26) },
      { author: "Ana Clara R.", rating: 4, comment: "Ótimo serviço. Só precisou remarcar o horário uma vez, mas avisou com antecedência.", serviceTitle: "Instalação de luminárias", createdAt: daysAgo(41) },
    ],
    isDemo: true,
  },
];

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
