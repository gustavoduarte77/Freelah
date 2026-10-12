import { MVP_CATEGORIES } from "./categories";

// Dados de demonstração (PRD 38.2): tudo aqui é fictício e vai para o banco com isDemo = true,
// para a interface mostrar o selo "Demonstração". Os ids são fixos para o seed poder rodar
// várias vezes sem duplicar nada, e as datas são calculadas a partir do momento da execução
// para a demonstração nunca "envelhecer".

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type CategorySlug = (typeof MVP_CATEGORIES)[number]["slug"];

export interface DemoOwner {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
}

export interface DemoJob {
  id: string;
  title: string;
  description: string;
  additionalInfo: string | null;
  category: CategorySlug;
  ownerId: string;
  city: string;
  state: string;
  scheduledDate: Date;
  startTime: string;
  proposedPriceCents: number;
  negotiable: boolean;
  status: "PUBLISHED" | "NEGOTIATING" | "HIRED" | "CANCELLED" | "DRAFT";
  publishedAt: Date | null;
  expiresAt: Date;
  /** Só para a contratada: quem foi escolhido (o banco exige um trabalhador selecionado). */
  hiredWorkerId?: string;
}

/** Contratantes e trabalhador fictícios: sem conta de login (não existe senha para eles). */
export const DEMO_OWNERS: DemoOwner[] = [
  {
    id: "demo-contratante-1",
    name: "Marta Souza (demonstração)",
    email: "marta.souza@demo.freelah.invalid",
    phone: "32900000001",
    city: "Cataguases",
  },
  {
    id: "demo-contratante-2",
    name: "Carlos Almeida (demonstração)",
    email: "carlos.almeida@demo.freelah.invalid",
    phone: "32900000002",
    city: "Leopoldina",
  },
  {
    id: "demo-contratante-3",
    name: "Padaria Pão Quente (demonstração)",
    email: "padaria.paoquente@demo.freelah.invalid",
    phone: "32900000003",
    city: "Muriaé",
  },
];

export const DEMO_WORKER: DemoOwner = {
  id: "demo-trabalhador-1",
  name: "João Pereira (demonstração)",
  email: "joao.pereira@demo.freelah.invalid",
  phone: "32900000004",
  city: "Cataguases",
};

const jobId = (n: number) => `01990000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const EXPIRED_DEMO_JOB_ID = jobId(12);
export const DEMO_HIRED_INTEREST_ID = "01990000-0000-7000-8000-00000000a001";

export function buildDemoJobs(now: Date): DemoJob[] {
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  /** Data do serviço: só o dia, no futuro. */
  const day = (days: number) => new Date(`${at(days * DAY).toISOString().slice(0, 10)}T00:00:00Z`);
  // Placeholder: o prazo real de cada oportunidade é calculado no fim, a partir da data do serviço.
  const open = { expiresAt: at(0) };

  const jobs: DemoJob[] = [
    {
      id: jobId(1),
      title: "Pintura de sala",
      description:
        "Preciso de uma pessoa para pintar uma sala de aproximadamente 20 m². A tinta e os materiais serão fornecidos por mim. O serviço deve ser feito em um dia.",
      additionalInfo: "Levar escada e rolos próprios, se possível.",
      category: "construcao-civil",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(5),
      startTime: "08:00",
      proposedPriceCents: 20000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-2 * HOUR),
      expiresAt: open.expiresAt,
    },
    {
      id: jobId(2),
      title: "Limpeza pós-obra em apartamento",
      description:
        "Apartamento de 70 m² recém-reformado precisa de limpeza pesada: remover poeira de obra, limpar vidros, pisos e banheiros. Produtos de limpeza por conta do contratante.",
      additionalInfo: null,
      category: "servicos-domesticos",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(3),
      startTime: "09:00",
      proposedPriceCents: 25000,
      negotiable: false,
      status: "PUBLISHED",
      publishedAt: at(-5 * HOUR),
      ...open,
    },
    {
      id: jobId(3),
      title: "Aulas de reforço em matemática",
      description:
        "Procuro professor ou estudante de licenciatura para reforço de matemática do 9º ano, duas tardes por semana, durante um mês. Aulas na casa do aluno.",
      additionalInfo: "Combinar horários nas conversas.",
      category: "aulas-particulares",
      ownerId: "demo-contratante-2",
      city: "Leopoldina",
      state: "MG",
      scheduledDate: day(7),
      startTime: "14:00",
      proposedPriceCents: 6000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-1 * DAY),
      expiresAt: open.expiresAt,
    },
    {
      id: jobId(4),
      title: "Reparo em telhado após a chuva",
      description:
        "Algumas telhas quebraram e há goteira na cozinha. Preciso de profissional para trocar as telhas e vedar a calha. Material já comprado.",
      additionalInfo: null,
      category: "servicos-de-manutencao",
      ownerId: "demo-contratante-2",
      city: "Leopoldina",
      state: "MG",
      scheduledDate: day(2),
      startTime: "07:30",
      proposedPriceCents: 45000,
      negotiable: true,
      status: "NEGOTIATING",
      publishedAt: at(-2 * DAY),
      ...open,
    },
    {
      id: jobId(5),
      title: "Atendente para balcão de padaria (fim de semana)",
      description:
        "A padaria precisa de uma pessoa para atender no balcão no sábado e no domingo, das 6h às 12h. Experiência é bem-vinda, mas não obrigatória.",
      additionalInfo: "Uniforme fornecido.",
      category: "servicos-comerciais",
      ownerId: "demo-contratante-3",
      city: "Muriaé",
      state: "MG",
      scheduledDate: day(6),
      startTime: "06:00",
      proposedPriceCents: 18000,
      negotiable: false,
      status: "PUBLISHED",
      publishedAt: at(-3 * DAY),
      ...open,
    },
    {
      id: jobId(6),
      title: "Montagem de guarda-roupa e cama",
      description:
        "Comprei um guarda-roupa de seis portas e uma cama box e preciso de quem monte tudo. Os móveis já estão em casa, com as ferragens.",
      additionalInfo: null,
      category: "servicos-domesticos",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(4),
      startTime: "10:00",
      proposedPriceCents: 15000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-4 * DAY),
      ...open,
    },
    {
      id: jobId(7),
      title: "Assentamento de piso cerâmico no quintal",
      description:
        "Quintal de aproximadamente 12 m² precisa de piso cerâmico. O contrapiso já está pronto e nivelado. Cerâmica e argamassa já foram compradas.",
      additionalInfo: "Posso ajudar com ajudante, se for preciso.",
      category: "construcao-civil",
      ownerId: "demo-contratante-3",
      city: "Muriaé",
      state: "MG",
      scheduledDate: day(10),
      startTime: "08:00",
      proposedPriceCents: 90000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-5 * DAY),
      ...open,
    },
    {
      id: jobId(8),
      title: "Aulas de violão para iniciante",
      description:
        "Quero aprender violão do zero. Procuro quem dê aulas semanais de uma hora, em Leopoldina. Tenho o violão.",
      additionalInfo: null,
      category: "aulas-particulares",
      ownerId: "demo-contratante-2",
      city: "Leopoldina",
      state: "MG",
      scheduledDate: day(8),
      startTime: "19:00",
      proposedPriceCents: 8000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-6 * DAY),
      ...open,
    },
    {
      id: jobId(9),
      title: "Manutenção de ar-condicionado split",
      description:
        "Dois aparelhos split de 12.000 BTUs precisam de limpeza e revisão antes do verão. Sem vazamentos conhecidos.",
      additionalInfo: null,
      category: "servicos-de-manutencao",
      ownerId: "demo-contratante-3",
      city: "Muriaé",
      state: "MG",
      scheduledDate: day(9),
      startTime: "13:30",
      proposedPriceCents: 28000,
      negotiable: false,
      status: "PUBLISHED",
      publishedAt: at(-7 * DAY),
      ...open,
    },
    {
      id: jobId(10),
      title: "Ajudante para mudança residencial",
      description:
        "Preciso de duas pessoas para carregar e descarregar uma mudança de casa para apartamento, no mesmo bairro. Caminhão já contratado.",
      additionalInfo: "Pagamento ao final do dia.",
      category: "servicos-comerciais",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(12),
      startTime: "07:00",
      proposedPriceCents: 12000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-8 * DAY),
      ...open,
    },
    // --- Oportunidades que NÃO podem aparecer na exploração (provam os filtros do servidor) ---
    {
      id: jobId(11),
      title: "Jardinagem no condomínio (cancelada)",
      description: "O contratante cancelou esta oportunidade antes de receber interessados.",
      additionalInfo: null,
      category: "servicos-de-manutencao",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(6),
      startTime: "08:00",
      proposedPriceCents: 10000,
      negotiable: false,
      status: "CANCELLED",
      publishedAt: at(-9 * DAY),
      expiresAt: at(20 * DAY),
    },
    {
      id: jobId(12),
      title: "Pintura de muro (prazo encerrado)",
      description: "O prazo de publicação desta oportunidade terminou sem contratação.",
      additionalInfo: null,
      category: "construcao-civil",
      ownerId: "demo-contratante-2",
      city: "Leopoldina",
      state: "MG",
      scheduledDate: day(-10),
      startTime: "08:00",
      proposedPriceCents: 30000,
      negotiable: true,
      status: "PUBLISHED",
      publishedAt: at(-40 * DAY),
      expiresAt: at(-5 * DAY),
    },
    {
      id: jobId(13),
      title: "Instalação de prateleiras (já contratada)",
      description: "Esta oportunidade já tem um trabalhador selecionado e não aceita novos interessados.",
      additionalInfo: null,
      category: "servicos-de-manutencao",
      ownerId: "demo-contratante-3",
      city: "Muriaé",
      state: "MG",
      scheduledDate: day(2),
      startTime: "15:00",
      proposedPriceCents: 9000,
      negotiable: false,
      status: "HIRED",
      publishedAt: at(-12 * DAY),
      expiresAt: at(15 * DAY),
      hiredWorkerId: DEMO_WORKER.id,
    },
    {
      id: jobId(14),
      title: "Rascunho: festa infantil (não publicado)",
      description: "Rascunho ainda não publicado: não deve aparecer para ninguém.",
      additionalInfo: null,
      category: "servicos-comerciais",
      ownerId: "demo-contratante-1",
      city: "Cataguases",
      state: "MG",
      scheduledDate: day(20),
      startTime: "16:00",
      proposedPriceCents: 50000,
      negotiable: true,
      status: "DRAFT",
      publishedAt: null,
      expiresAt: at(30 * DAY),
    },
  ];
  // O prazo de publicação vem antes do serviço (regra do produto): 12 h antes do horário marcado
  // (horário de Brasília, UTC-3). A oportunidade de prazo encerrado fica como está de propósito.
  return jobs.map((job) => {
    if (job.id === EXPIRED_DEMO_JOB_ID) return job;
    const [hours, minutes] = job.startTime.split(":").map(Number);
    const service = job.scheduledDate.getTime() + ((hours! + 3) * 60 + minutes!) * 60 * 1000;
    return { ...job, expiresAt: new Date(service - 12 * HOUR) };
  });
}

/** Quantas oportunidades aparecem na exploração depois do seed (as 10 primeiras). */
export const DEMO_VISIBLE_JOB_COUNT = 10;
