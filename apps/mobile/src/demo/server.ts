import { describeJobAvailability, type InviteState, type InterestStatus, type PublicJobStatus } from "@freelah/shared";
import {
  CATEGORIES,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_USER,
  INTERESTED_IN_MINE,
  INVITE_STEP,
  JOBS,
  JOB_BY_ID,
  OTHER_INTERESTS,
  SCRIPT_CONVERSATION_ID,
  SCRIPT_INTEREST_CREATED_AT,
  SCRIPT_JOB_ID,
  SCRIPT_MESSAGES,
  SCRIPT_OTHER_NAME,
  type DemoJob,
} from "./data";
import { addExtraInterest, getState, respondToInvite, setLoggedIn, withdrawInterest } from "./store";

// "Servidor" do Modo Demonstração: responde, em memória, às mesmas rotas e com os mesmos formatos
// da API real (os clientes do app validam tudo com os contratos compartilhados). Nenhuma chamada
// sai do navegador.

export interface DemoResponse {
  status: number;
  body: unknown;
}

const ok = (body: unknown): DemoResponse => ({ status: 200, body });
const fail = (status: number, error: string, message?: string): DemoResponse => ({
  status,
  body: message ? { error, message } : { error },
});
const unauthorized = () => fail(401, "unauthorized", "É preciso entrar para continuar.");
const notFound = () => fail(404, "not_found", "Não encontrado.");
const NOT_AVAILABLE = "Esta ação não está disponível na demonstração offline. Use os controles da demonstração para seguir o roteiro.";
const notAvailable = () => fail(409, "demo_readonly", NOT_AVAILABLE);

const BOOT = new Date().toISOString();

// --- Situação derivada do estado --------------------------------------------

const scriptInterestId = () => `demo-interest-pintura-${getState().epoch}`;

function inviteOfScript(): InviteState {
  const { step, response } = getState();
  if (step < INVITE_STEP) return "NONE";
  if (response === "accepted") return "ACCEPTED";
  if (response === "declined") return "DECLINED";
  return "PENDING";
}

const scriptInterestStatus = (): InterestStatus => (getState().response === "accepted" ? "ACCEPTED" : "PENDING");

function jobStatus(job: DemoJob): PublicJobStatus {
  return job.id === SCRIPT_JOB_ID && getState().response === "accepted" ? "HIRED" : "PUBLISHED";
}

interface InterestRow {
  id: string;
  jobId: string;
  status: InterestStatus;
  invite: InviteState;
  createdAt: string;
}

/** Interesses da conta em oportunidades de outras pessoas. */
function myInterestRows(): InterestRow[] {
  const state = getState();
  const rows: InterestRow[] = [
    { id: scriptInterestId(), jobId: SCRIPT_JOB_ID, status: scriptInterestStatus(), invite: inviteOfScript(), createdAt: SCRIPT_INTEREST_CREATED_AT },
    ...OTHER_INTERESTS.map((row) => ({ ...row, status: "PENDING" as InterestStatus, invite: "NONE" as InviteState })),
    ...state.extraInterestJobIds.map((jobId) => ({
      id: `demo-interest-extra-${jobId}`,
      jobId,
      status: "PENDING" as InterestStatus,
      invite: "NONE" as InviteState,
      createdAt: new Date().toISOString(),
    })),
  ];
  return rows.map((row) => (state.withdrawnInterestIds.includes(row.id) ? { ...row, status: "WITHDRAWN", invite: "NONE" } : row));
}

// --- Formatos de resposta ---------------------------------------------------

function summary(job: DemoJob) {
  return {
    id: job.id,
    title: job.title,
    excerpt: job.excerpt,
    category: { slug: job.category.slug, name: job.category.name },
    city: job.city,
    state: job.state,
    scheduledDate: job.scheduledDate,
    startTime: job.startTime,
    proposedPriceCents: job.proposedPriceCents,
    negotiable: job.negotiable,
    status: jobStatus(job),
    isDemo: false,
    publishedAt: job.publishedAt,
  };
}

function detail(job: DemoJob) {
  const status = jobStatus(job);
  const availability = describeJobAvailability(status);
  return {
    ...summary(job),
    description: job.description,
    additionalInfo: job.additionalInfo,
    expiresAt: job.expiresAt,
    owner: { name: job.ownerName, city: job.ownerCity, isDemo: false },
    acceptingInterests: availability.acceptingInterests,
    statusMessage: availability.message,
  };
}

function ownJob(job: DemoJob) {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    additionalInfo: job.additionalInfo,
    category: { id: job.category.id, slug: job.category.slug, name: job.category.name },
    city: job.city,
    state: job.state,
    scheduledDate: job.scheduledDate,
    startTime: job.startTime,
    proposedPriceCents: job.proposedPriceCents,
    negotiable: job.negotiable,
    status: "PUBLISHED",
    isDemo: false,
    expiresAt: job.expiresAt,
    publishedAt: job.publishedAt,
    cancelledAt: null,
    createdAt: job.createdAt,
    updatedAt: job.publishedAt,
    interestCount: INTERESTED_IN_MINE[job.id]?.length ?? 0,
    canEdit: true,
    canPublish: false,
    canCancel: true,
    canComplete: false,
    hiredWorkerName: null,
  };
}

function myInterest(row: InterestRow) {
  const job = JOB_BY_ID.get(row.jobId)!;
  return {
    id: row.id,
    status: row.status,
    invite: row.invite,
    createdAt: row.createdAt,
    job: {
      id: job.id,
      title: job.title,
      category: job.category.name,
      city: job.city,
      state: job.state,
      scheduledDate: job.scheduledDate,
      startTime: job.startTime,
      proposedPriceCents: job.proposedPriceCents,
      negotiable: job.negotiable,
      status: jobStatus(job),
      ownerName: job.ownerName,
    },
  };
}

function visibleMessages() {
  const { step } = getState();
  return SCRIPT_MESSAGES.slice(0, Math.max(0, Math.min(step - 1, SCRIPT_MESSAGES.length)));
}

const scriptJob = () => JOB_BY_ID.get(SCRIPT_JOB_ID)!;

function conversation() {
  const job = scriptJob();
  return {
    id: SCRIPT_CONVERSATION_ID,
    job: {
      id: job.id,
      title: job.title,
      status: jobStatus(job),
      proposedPriceCents: job.proposedPriceCents,
      scheduledDate: job.scheduledDate,
      startTime: job.startTime,
      city: job.city,
      state: job.state,
    },
    viewerIsOwner: false,
    interest: { id: scriptInterestId(), status: scriptInterestStatus(), invite: inviteOfScript() },
    other: { name: SCRIPT_OTHER_NAME },
    canSend: false,
    blockedReason: "Na demonstração, as mensagens seguem o roteiro. Use os controles da demonstração para avançar a conversa.",
  };
}

// --- Roteamento ---------------------------------------------------------------

function matchesQuery(job: DemoJob, params: URLSearchParams): boolean {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = params.get("q")?.trim();
  if (q && !fold(`${job.title} ${job.description} ${job.category.name}`).includes(fold(q))) return false;
  const category = params.get("category");
  if (category && job.category.slug !== category) return false;
  const city = params.get("city")?.trim();
  if (city && !fold(job.city).includes(fold(city))) return false;
  const min = params.get("minPriceCents");
  if (min && job.proposedPriceCents < Number(min)) return false;
  const max = params.get("maxPriceCents");
  if (max && job.proposedPriceCents > Number(max)) return false;
  return true;
}

function listJobs(params: URLSearchParams): DemoResponse {
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("cursor")) || 0);
  const open = JOBS.filter((job) => jobStatus(job) === "PUBLISHED" && matchesQuery(job, params)).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  const page = open.slice(offset, offset + limit);
  return ok({ jobs: page.map(summary), nextCursor: offset + limit < open.length ? String(offset + limit) : null });
}

function parseBody(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function session() {
  const user = {
    id: DEMO_USER.id,
    name: DEMO_USER.name,
    email: DEMO_USER.email,
    emailVerified: true,
    image: null,
    phone: DEMO_USER.phone,
    city: DEMO_USER.city,
    createdAt: BOOT,
    updatedAt: BOOT,
  };
  return {
    session: {
      id: "demo-session",
      token: "demo-token",
      userId: DEMO_USER.id,
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      createdAt: BOOT,
      updatedAt: BOOT,
    },
    user,
  };
}

export function handleDemoRequest(method: string, rawPath: string, bodyText?: string): DemoResponse {
  const url = new URL(rawPath, "http://demo.local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  const loggedIn = getState().loggedIn;

  // --- Autenticação local (a conta existe só neste modo; nada é gravado em servidor algum) ---
  if (segments[0] === "api" && segments[1] === "auth") {
    const action = segments.slice(2).join("/");
    if (action === "get-session" && method === "GET") return ok(loggedIn ? session() : null);
    if (action === "sign-in/email" && method === "POST") {
      const body = parseBody(bodyText);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email === DEMO_EMAIL && body.password === DEMO_PASSWORD) {
        setLoggedIn(true);
        const current = session();
        return ok({ redirect: false, token: current.session.token, user: current.user });
      }
      return { status: 401, body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } };
    }
    if (action === "sign-out" && method === "POST") {
      setLoggedIn(false);
      return ok({ success: true });
    }
    if (action === "sign-up/email") {
      return { status: 403, body: { code: "DEMO_SIGNUP_DISABLED", message: "O cadastro não está disponível na demonstração offline." } };
    }
    return notFound();
  }

  if (path === "/health" && method === "GET") return ok({ status: "ok", service: "freelah-api", time: new Date().toISOString() });

  // --- Público ---
  if (path === "/categories" && method === "GET") {
    return ok({ categories: CATEGORIES.map(({ id, slug, name }) => ({ id, slug, name })) });
  }
  if (path === "/jobs" && method === "GET") return listJobs(url.searchParams);
  if (segments[0] === "jobs" && segments.length === 2 && method === "GET") {
    const job = JOB_BY_ID.get(decodeURIComponent(segments[1]!));
    return job ? ok(detail(job)) : notFound();
  }

  // --- Daqui em diante é preciso estar "logado" ---
  const isPrivate = segments[0] === "me" || (segments[0] === "jobs" && segments.length === 3);
  if (isPrivate && !loggedIn) return unauthorized();

  if (segments[0] === "jobs" && segments.length === 3) {
    const job = JOB_BY_ID.get(decodeURIComponent(segments[1]!));
    if (!job) return notFound();
    if (segments[2] === "viewer" && method === "GET") {
      if (job.mine) return ok({ isOwner: true, interest: null });
      const mine = myInterestRows().find((row) => row.jobId === job.id);
      return ok({ isOwner: false, interest: mine ? { id: mine.id, status: mine.status, invite: mine.invite } : null });
    }
    if (segments[2] === "interest" && method === "POST") {
      if (job.mine) return fail(409, "own_job", "Você não pode demonstrar interesse na sua própria oportunidade.");
      const existing = myInterestRows().find((row) => row.jobId === job.id && row.status !== "WITHDRAWN");
      if (existing) return fail(409, "already_interested", "Você já demonstrou interesse nesta oportunidade.");
      if (jobStatus(job) !== "PUBLISHED") return fail(409, "not_accepting", "Esta oportunidade não aceita novos interessados.");
      addExtraInterest(job.id);
      const created = myInterestRows().find((row) => row.jobId === job.id)!;
      return ok({ interest: { id: created.id, status: "PENDING", invite: "NONE" } });
    }
    return notFound();
  }

  if (path === "/me" && method === "GET") {
    return ok({ ...DEMO_USER, avatarUrl: null, createdAt: BOOT });
  }
  if (path === "/me/preferences") {
    if (method === "PUT") return ok({ preferences: { wantsWork: true, wantsToHire: true, ...parseBody(bodyText) } });
    return ok({ preferences: { wantsWork: true, wantsToHire: true } });
  }

  // --- Minhas oportunidades ---
  if (segments[0] === "me" && segments[1] === "jobs") {
    const mine = JOBS.filter((job) => job.mine);
    if (segments.length === 2 && method === "GET") return ok({ jobs: mine.map(ownJob) });
    if (segments.length === 2) return notAvailable();
    const job = mine.find((candidate) => candidate.id === decodeURIComponent(segments[2]!));
    if (!job) return notFound();
    if (segments.length === 3 && method === "GET") return ok({ job: ownJob(job) });
    if (segments[3] === "interests" && method === "GET") {
      return ok({
        interests: (INTERESTED_IN_MINE[job.id] ?? []).map((row) => ({
          id: row.id,
          status: "PENDING",
          invite: "NONE",
          createdAt: row.createdAt,
          worker: { name: row.name, city: row.city },
        })),
      });
    }
    return notAvailable();
  }

  // --- Meus interesses (a jornada principal) ---
  if (segments[0] === "me" && segments[1] === "interests") {
    if (segments.length === 2 && method === "GET") return ok({ interests: myInterestRows().map(myInterest) });
    const id = decodeURIComponent(segments[2] ?? "");
    const action = segments[3];
    const row = myInterestRows().find((candidate) => candidate.id === id);
    if (!row) return notFound();
    const isScript = row.jobId === SCRIPT_JOB_ID;
    if (action === "conversation" && method === "POST") {
      return isScript ? ok({ conversation: { id: SCRIPT_CONVERSATION_ID } }) : fail(409, "demo_readonly", "Nesta demonstração só a conversa da pintura está disponível.");
    }
    if (action === "withdraw" && method === "POST") {
      if (isScript || row.status !== "PENDING") return fail(409, "not_withdrawable", "Este interesse não pode ser retirado agora.");
      withdrawInterest(row.id);
      return ok({ interest: { id: row.id, status: "WITHDRAWN", invite: "NONE" } });
    }
    if (isScript && action === "accept" && method === "POST") {
      if (!respondToInvite("accepted")) return fail(409, "no_pending_invite", "Não há convite pendente para aceitar.");
      return ok({ interest: { id: scriptInterestId(), status: "ACCEPTED", invite: "ACCEPTED" } });
    }
    if (isScript && action === "decline" && method === "POST") {
      if (!respondToInvite("declined")) return fail(409, "no_pending_invite", "Não há convite pendente para recusar.");
      return ok({ interest: { id: scriptInterestId(), status: "PENDING", invite: "DECLINED" } });
    }
    return notAvailable();
  }

  // --- Mensagens ---
  if (segments[0] === "me" && segments[1] === "conversations") {
    if (segments.length === 2 && method === "GET") {
      const job = scriptJob();
      const last = visibleMessages().at(-1);
      return ok({
        conversations: [
          {
            id: SCRIPT_CONVERSATION_ID,
            job: { id: job.id, title: job.title, status: jobStatus(job) },
            other: { name: SCRIPT_OTHER_NAME },
            interestStatus: scriptInterestStatus(),
            lastMessage: last ? { content: last.content, createdAt: last.createdAt, fromMe: last.fromMe } : null,
          },
        ],
      });
    }
    if (decodeURIComponent(segments[2] ?? "") !== SCRIPT_CONVERSATION_ID) return notFound();
    if (segments.length === 3 && method === "GET") return ok({ conversation: conversation() });
    if (segments[3] === "messages" && method === "GET") {
      const all = visibleMessages();
      const after = url.searchParams.get("after");
      const index = after ? all.findIndex((message) => message.id === after) : -1;
      const messages = all.slice(index + 1);
      return ok({ messages, cursor: all.at(-1)?.id ?? null });
    }
    return notAvailable();
  }

  return notFound();
}
