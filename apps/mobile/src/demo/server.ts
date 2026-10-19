import {
  JOB_VALIDATION_MESSAGE,
  createJobSchema,
  createProposalSchema,
  updateProfileSchema,
  describeJobAvailability,
  jobFieldErrors,
  makeExcerpt,
  negotiationClosedReason,
  proposalActions,
  proposalEligibility,
  PROPOSAL_NOT_PENDING_MESSAGE,
  validateJobImages,
  validateJobPriceForPublish,
  validateJobSchedule,
  type InviteState,
  type NegotiationContext,
  type Proposal,
  type InterestStatus,
  type PublicJobStatus,
} from "@freelah/shared";
import {
  CATEGORIES,
  DEMO_EMAIL,
  DEMO_OWN_PROFILE_ID,
  DEMO_PASSWORD,
  DEMO_USER,
  HIRE_CONVERSATION_ID,
  HIRE_INTEREST_CREATED_AT,
  HIRE_JOB_ID,
  HIRE_MESSAGES,
  HIRE_OTHER_CITY,
  HIRE_OTHER_NAME,
  HIRE_OTHER_PROFILE_ID,
  INTERESTED_IN_MINE,
  INVITE_STEP,
  JOBS,
  JOB_BY_ID,
  OTHER_INTERESTS,
  PROFILES,
  SCRIPT_CONVERSATION_ID,
  SCRIPT_INTEREST_CREATED_AT,
  STATIC_CONVERSATIONS,
  SCRIPT_JOB_ID,
  SCRIPT_MESSAGES,
  SCRIPT_OTHER_NAME,
  SCRIPT_OTHER_PROFILE_ID,
  type DemoJob,
} from "./data";
import { getJobImages } from "./images";
import {
  addExtraInterest,
  createJob,
  createProposal,
  decideProposal,
  getState,
  inviteHire,
  isHireAccepted,
  publishCreatedJob,
  proposalsOf,
  respondToInvite,
  saveProfile,
  setLoggedIn,
  withdrawInterest,
  type CreatedJob,
  type DemoProposal,
} from "./store";
import { publishPhotos } from "../features/publish/photos";

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

// --- Oportunidades: as do roteiro (constantes) mais as criadas durante a apresentação ---------

function createdAsDemoJob(created: CreatedJob): DemoJob {
  return {
    id: created.id,
    key: created.id,
    title: created.title,
    description: created.description,
    additionalInfo: created.additionalInfo,
    category: CATEGORIES.find((category) => category.id === created.categoryId)!,
    city: created.city,
    state: created.state,
    scheduledDate: created.scheduledDate,
    startTime: created.startTime,
    proposedPriceCents: created.proposedPriceCents,
    negotiable: created.negotiable,
    ownerName: DEMO_USER.name,
    ownerCity: DEMO_USER.city,
    mine: true,
    draft: created.publishedAt === null,
    photoCount: getJobImages(created.id).length,
    publishedAt: created.publishedAt ?? created.createdAt,
    expiresAt: created.expiresAt,
    createdAt: created.createdAt,
    excerpt: makeExcerpt(created.description),
  };
}

/** Todas as oportunidades; as criadas agora vêm primeiro (são as mais recentes). */
function allJobs(): DemoJob[] {
  return [...getState().createdJobs.map(createdAsDemoJob).reverse(), ...JOBS];
}

const jobById = (id: string): DemoJob | undefined => allJobs().find((job) => job.id === id);

/** O que qualquer pessoa pode ver: rascunhos são só da dona. */
const publicJobById = (id: string): DemoJob | undefined => {
  const job = jobById(id);
  return job && !job.draft ? job : undefined;
};

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
  if (job.id === HIRE_JOB_ID) return isHireAccepted(getState()) ? "HIRED" : "PUBLISHED";
  return job.id === SCRIPT_JOB_ID && getState().response === "accepted" ? "HIRED" : "PUBLISHED";
}

// --- Segundo roteiro: Lucas (dono da oportunidade) contrata Roberto ----------

const hireInterestId = () => `demo-interest-eletrica-${getState().hireEpoch}`;

function hireInterest(): { id: string; status: InterestStatus; invite: InviteState } {
  const state = getState();
  if (isHireAccepted(state)) return { id: hireInterestId(), status: "ACCEPTED", invite: "ACCEPTED" };
  return { id: hireInterestId(), status: "PENDING", invite: state.hireInvited ? "PENDING" : "NONE" };
}

function visibleHireMessages() {
  const { hireStep } = getState();
  return HIRE_MESSAGES.slice(0, Math.max(0, Math.min(hireStep - 1, HIRE_MESSAGES.length)));
}

function hireConversation() {
  const job = JOB_BY_ID.get(HIRE_JOB_ID)!;
  return {
    id: HIRE_CONVERSATION_ID,
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
    viewerIsOwner: true,
    interest: hireInterest(),
    other: { name: HIRE_OTHER_NAME, profileId: HIRE_OTHER_PROFILE_ID },
    canSend: false,
    blockedReason: "Na demonstração, as mensagens seguem o roteiro. Use os controles da demonstração para avançar a conversa.",
  };
}

/**
 * Perfil público com o resumo das avaliações calculado a partir delas. O da própria conta de
 * demonstração recebe a edição salva (papéis, ocupação, apresentação e cidade); os demais nunca mudam.
 */
function publicProfile(profile: (typeof PROFILES)[number]) {
  const edited = profile.id === DEMO_OWN_PROFILE_ID ? getState().profile : null;
  const merged = edited ? { ...profile, roles: edited.roles, headline: edited.headline, bio: edited.bio, city: edited.city } : profile;
  const count = merged.reviews.length;
  const average = count > 0 ? merged.reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;
  return { ...merged, rating: count > 0 ? { average, count } : null };
}

const ownProfile = () => publicProfile(PROFILES.find((profile) => profile.id === DEMO_OWN_PROFILE_ID)!);

function updateOwnProfile(bodyText: string | undefined): DemoResponse {
  const parsed = updateProfileSchema.safeParse(parseBody(bodyText));
  if (!parsed.success) {
    return { status: 400, body: { error: "validation_error", message: "Confira os campos destacados e tente de novo.", fields: jobFieldErrors(parsed.error) } };
  }
  saveProfile(parsed.data);
  return ok({ profile: ownProfile() });
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
    photoCount: job.photoCount ?? 0,
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
    images: getJobImages(job.id),
  };
}

function ownJob(job: DemoJob) {
  if (job.id === HIRE_JOB_ID) {
    const hired = isHireAccepted(getState());
    return {
      ...ownJobBase(job),
      status: jobStatus(job),
      interestCount: hired ? 0 : 1,
      canEdit: !hired,
      canCancel: !hired,
      hiredWorkerName: hired ? HIRE_OTHER_NAME : null,
    };
  }
  return ownJobBase(job);
}

function ownJobBase(job: DemoJob) {
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
    status: job.draft ? "DRAFT" : "PUBLISHED",
    isDemo: false,
    expiresAt: job.expiresAt,
    publishedAt: job.draft ? null : job.publishedAt,
    cancelledAt: null,
    createdAt: job.createdAt,
    updatedAt: job.draft ? job.createdAt : job.publishedAt,
    interestCount: INTERESTED_IN_MINE[job.id]?.length ?? 0,
    canEdit: true,
    canPublish: job.draft === true,
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
    other: { name: SCRIPT_OTHER_NAME, profileId: SCRIPT_OTHER_PROFILE_ID },
    canSend: false,
    blockedReason: "Na demonstração, as mensagens seguem o roteiro. Use os controles da demonstração para avançar a conversa.",
  };
}

/** Conversa de exemplo (mensagens fixas): Lucas é o profissional interessado e não há convite. */
function exampleConversation(example: (typeof STATIC_CONVERSATIONS)[number]) {
  const job = JOB_BY_ID.get(example.jobId)!;
  return {
    id: example.id,
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
    interest: { id: example.interestId, status: "PENDING" as InterestStatus, invite: "NONE" as InviteState },
    other: { name: example.otherName, profileId: example.otherProfileId },
    canSend: false,
    blockedReason: "Esta é uma conversa de exemplo da demonstração: as mensagens são fixas e não podem ser enviadas.",
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
  // Sem valor positivo ("A negociar" ou zero antigo) não dá para comparar: com filtro de valor ativo, fica de fora (como na API).
  if ((min || params.get("maxPriceCents")) && !(typeof job.proposedPriceCents === "number" && job.proposedPriceCents > 0)) return false;
  if (min && (job.proposedPriceCents as number) < Number(min)) return false;
  const max = params.get("maxPriceCents");
  if (max && (job.proposedPriceCents as number) > Number(max)) return false;
  return true;
}

function listJobs(params: URLSearchParams): DemoResponse {
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("cursor")) || 0);
  const open = allJobs().filter((job) => !job.draft && jobStatus(job) === "PUBLISHED" && matchesQuery(job, params)).sort((a, b) =>
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

// --- Propostas de valor (PRD 18.5) -----------------------------------------------

/**
 * Situação da negociação de uma conversa do roteiro, com as mesmas regras da API. O bloqueio do
 * roteiro (`canSend: false`) só impede mensagens livres: não conta como conversa fechada.
 */
function negotiationOf(conversationId: string): { context: NegotiationContext; otherName: string } | null {
  if (conversationId === HIRE_CONVERSATION_ID) {
    const job = JOB_BY_ID.get(HIRE_JOB_ID)!;
    return {
      context: { jobStatus: jobStatus(job), interestStatus: hireInterest().status, negotiable: job.negotiable, conversationBlockedReason: null },
      otherName: HIRE_OTHER_NAME,
    };
  }
  const example = STATIC_CONVERSATIONS.find((item) => item.id === conversationId);
  if (example) {
    const job = JOB_BY_ID.get(example.jobId)!;
    return {
      context: { jobStatus: jobStatus(job), interestStatus: "PENDING", negotiable: job.negotiable, conversationBlockedReason: null },
      otherName: example.otherName,
    };
  }
  if (conversationId === SCRIPT_CONVERSATION_ID) {
    const job = scriptJob();
    return {
      context: { jobStatus: jobStatus(job), interestStatus: scriptInterestStatus(), negotiable: job.negotiable, conversationBlockedReason: null },
      otherName: SCRIPT_OTHER_NAME,
    };
  }
  return null;
}

function toProposal(proposal: DemoProposal, context: NegotiationContext, otherName: string): Proposal {
  const closedReason = proposal.status === "PENDING" ? negotiationClosedReason(context) : null;
  return {
    id: proposal.id,
    conversationId: proposal.conversationId,
    amountCents: proposal.amountCents,
    status: proposal.status,
    fromMe: proposal.fromMe,
    authorName: proposal.fromMe ? DEMO_USER.name : otherName,
    createdAt: proposal.createdAt,
    decidedAt: proposal.decidedAt,
    ...proposalActions(proposal.status, proposal.fromMe, closedReason),
    closedReason,
  };
}

function proposalsOfConversation(conversationId: string): DemoResponse {
  const negotiation = negotiationOf(conversationId);
  if (!negotiation) return notFound();
  const stored = proposalsOf(conversationId);
  const { canPropose, reason } = proposalEligibility(negotiation.context, stored);
  return ok({
    proposals: stored.map((proposal) => toProposal(proposal, negotiation.context, negotiation.otherName)),
    canPropose,
    proposeBlockedReason: reason,
  });
}

function sendProposal(conversationId: string, bodyText: string | undefined): DemoResponse {
  const negotiation = negotiationOf(conversationId);
  if (!negotiation) return notFound();
  const parsed = createProposalSchema.safeParse(parseBody(bodyText));
  if (!parsed.success) {
    return { status: 400, body: { error: "validation_error", message: "Confira o valor da proposta e tente de novo.", fields: jobFieldErrors(parsed.error) } };
  }
  const { canPropose, reason } = proposalEligibility(negotiation.context, proposalsOf(conversationId));
  if (!canPropose) return fail(409, "proposal_not_allowed", reason ?? "Não é possível enviar uma proposta agora.");
  const created = createProposal(conversationId, parsed.data.amountCents);
  return { status: 201, body: { proposal: toProposal(created, negotiation.context, negotiation.otherName) } };
}

function decideOwnProposal(id: string, action: string): DemoResponse {
  const stored = getState().proposals.find((proposal) => proposal.id === id);
  const negotiation = stored ? negotiationOf(stored.conversationId) : null;
  if (!stored || !negotiation) return notFound();
  const responding = action === "accept" || action === "decline";
  if (!responding && action !== "withdraw") return notFound();
  if (responding && stored.fromMe) return fail(403, "forbidden", "Só a outra pessoa da conversa pode responder à proposta.");
  if (!responding && !stored.fromMe) return fail(403, "forbidden", "Só quem enviou a proposta pode retirá-la.");
  if (stored.status !== "PENDING") return fail(409, "proposal_not_pending", PROPOSAL_NOT_PENDING_MESSAGE);
  const closed = negotiationClosedReason(negotiation.context);
  if (closed) return fail(409, "negotiation_closed", closed);
  const status = action === "accept" ? "ACCEPTED" : action === "decline" ? "DECLINED" : "WITHDRAWN";
  const decided = decideProposal(id, status);
  if (!decided) return fail(409, "proposal_not_pending", PROPOSAL_NOT_PENDING_MESSAGE);
  return ok({ proposal: toProposal(decided, negotiation.context, negotiation.otherName) });
}

const validation = (fields: Record<string, string>): DemoResponse => ({
  status: 400,
  body: { error: "validation_error", message: JOB_VALIDATION_MESSAGE, fields },
});

/** POST /me/jobs: as mesmas regras da API real; cria rascunho, ou já publicada com `publish: true`. */
function createOwnJob(bodyText: string | undefined): DemoResponse {
  const parsed = createJobSchema.safeParse(parseBody(bodyText));
  if (!parsed.success) return validation(jobFieldErrors(parsed.error));
  const { publish, ...input } = parsed.data;
  const scheduleErrors = validateJobSchedule(input, new Date(), true);
  if (Object.keys(scheduleErrors).length > 0) return validation(scheduleErrors);
  if (!CATEGORIES.some((category) => category.id === input.categoryId)) {
    return validation({ categoryId: "Escolha uma categoria válida." });
  }
  // As fotos vêm do formulário de publicação (em memória); a requisição não as carrega.
  const photos = validateJobImages(publishPhotos.getState().images);
  if (!photos.ok) return validation({ images: photos.message });
  const result = createJob(
    {
      title: input.title,
      description: input.description,
      additionalInfo: input.additionalInfo ?? null,
      categoryId: input.categoryId,
      city: input.city,
      state: input.state,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      proposedPriceCents: input.proposedPriceCents,
      negotiable: input.negotiable ?? false,
      expiresAt: input.expiresAt,
    },
    publish === true,
    photos.images,
  );
  // Sem espaço para as fotos nada é criado: a pessoa vê o motivo e nenhuma oportunidade fica pela metade.
  if (!result.ok) return fail(409, "images_not_saved", result.message);
  return { status: 201, body: { job: ownJob(createdAsDemoJob(result.job)) } };
}

/** POST /me/jobs/:id/publish: só rascunhos criados na apresentação podem ser publicados. */
function publishOwnJob(job: DemoJob): DemoResponse {
  // Como na API: um rascunho antigo com zero (ou valor inválido) só publica depois de regularizado.
  if (job.draft) {
    const priceErrors = validateJobPriceForPublish(job.proposedPriceCents, job.negotiable);
    if (Object.keys(priceErrors).length > 0) return validation(priceErrors);
  }
  const published = job.draft ? publishCreatedJob(job.id) : null;
  if (!published) return fail(409, "invalid_state", "Só é possível publicar um rascunho.");
  return ok({ job: ownJob(createdAsDemoJob(published)) });
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
    const job = publicJobById(decodeURIComponent(segments[1]!));
    return job ? ok(detail(job)) : notFound();
  }
  if (segments[0] === "profiles" && segments.length === 2 && method === "GET") {
    const profile = PROFILES.find((candidate) => candidate.id === decodeURIComponent(segments[1]!));
    return profile ? ok({ profile: publicProfile(profile) }) : notFound();
  }

  // --- Daqui em diante é preciso estar "logado" ---
  const isPrivate = segments[0] === "me" || (segments[0] === "jobs" && segments.length === 3);
  if (isPrivate && !loggedIn) return unauthorized();

  if (segments[0] === "jobs" && segments.length === 3) {
    const job = jobById(decodeURIComponent(segments[1]!));
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
  if (path === "/me/profile") {
    if (method === "GET") return ok({ profile: ownProfile() });
    if (method === "PATCH") return updateOwnProfile(bodyText);
    return notAvailable();
  }
  if (path === "/me/preferences") {
    if (method === "PUT") return ok({ preferences: { wantsWork: true, wantsToHire: true, ...parseBody(bodyText) } });
    // Os papéis do perfil são as mesmas preferências de uso.
    const roles = getState().profile?.roles;
    return ok({ preferences: { wantsWork: roles ? roles.includes("PROFESSIONAL") : true, wantsToHire: roles ? roles.includes("CLIENT") : true } });
  }

  // --- Minhas oportunidades ---
  if (segments[0] === "me" && segments[1] === "jobs") {
    const mine = allJobs().filter((job) => job.mine);
    if (segments.length === 2 && method === "GET") return ok({ jobs: mine.map(ownJob) });
    if (segments.length === 2 && method === "POST") return createOwnJob(bodyText);
    if (segments.length === 2) return notAvailable();
    const job = mine.find((candidate) => candidate.id === decodeURIComponent(segments[2]!));
    if (!job) return notFound();
    if (segments.length === 3 && method === "GET") return ok({ job: ownJob(job) });
    if (segments[3] === "publish" && method === "POST") return publishOwnJob(job);
    if (segments[3] === "interests" && method === "GET") {
      if (job.id === HIRE_JOB_ID) {
        const { id, status, invite } = hireInterest();
        return ok({
          interests: [{ id, status, invite, createdAt: HIRE_INTEREST_CREATED_AT, worker: { name: HIRE_OTHER_NAME, city: HIRE_OTHER_CITY } }],
        });
      }
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
    // Interesse de Roberto na oportunidade de Lucas: aqui Lucas é o contratante.
    if (id === hireInterestId()) {
      if (action === "conversation" && method === "POST") return ok({ conversation: { id: HIRE_CONVERSATION_ID } });
      if (action === "invite" && method === "POST") {
        if (getState().hireInvited || isHireAccepted(getState())) return fail(409, "already_invited", "O convite já foi enviado.");
        if (!inviteHire()) {
          return fail(409, "demo_readonly", "Na demonstração, avance a conversa (tecla A) até combinarem o serviço e então envie o convite.");
        }
        return ok({ interest: hireInterest() });
      }
      return notAvailable();
    }
    const row = myInterestRows().find((candidate) => candidate.id === id);
    if (!row) return notFound();
    const isScript = row.jobId === SCRIPT_JOB_ID;
    if (action === "conversation" && method === "POST") {
      const example = STATIC_CONVERSATIONS.find((item) => item.interestId === row.id);
      if (example) return ok({ conversation: { id: example.id } });
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

  // --- Propostas de valor ---
  if (segments[0] === "me" && segments[1] === "proposals" && segments.length === 4 && method === "POST") {
    return decideOwnProposal(decodeURIComponent(segments[2]!), segments[3]!);
  }
  if (segments[0] === "me" && segments[1] === "conversations" && segments[3] === "proposals" && segments.length === 4) {
    const conversationId = decodeURIComponent(segments[2] ?? "");
    if (method === "GET") return proposalsOfConversation(conversationId);
    if (method === "POST") return sendProposal(conversationId, bodyText);
  }

  // --- Mensagens ---
  if (segments[0] === "me" && segments[1] === "conversations") {
    if (segments.length === 2 && method === "GET") {
      const job = scriptJob();
      const last = visibleMessages().at(-1);
      const hireLast = visibleHireMessages().at(-1);
      return ok({
        conversations: [
          {
            id: SCRIPT_CONVERSATION_ID,
            job: { id: job.id, title: job.title, status: jobStatus(job) },
            other: { name: SCRIPT_OTHER_NAME, profileId: SCRIPT_OTHER_PROFILE_ID },
            interestStatus: scriptInterestStatus(),
            lastMessage: last ? { content: last.content, createdAt: last.createdAt, fromMe: last.fromMe } : null,
          },
          {
            id: HIRE_CONVERSATION_ID,
            job: { id: HIRE_JOB_ID, title: hireConversation().job.title, status: hireConversation().job.status },
            other: { name: HIRE_OTHER_NAME, profileId: HIRE_OTHER_PROFILE_ID },
            interestStatus: hireInterest().status,
            lastMessage: hireLast ? { content: hireLast.content, createdAt: hireLast.createdAt, fromMe: hireLast.fromMe } : null,
          },
          ...STATIC_CONVERSATIONS.map((example) => {
            const exampleJob = JOB_BY_ID.get(example.jobId)!;
            const lastExample = example.messages.at(-1)!;
            return {
              id: example.id,
              job: { id: exampleJob.id, title: exampleJob.title, status: jobStatus(exampleJob) },
              other: { name: example.otherName, profileId: example.otherProfileId },
              interestStatus: "PENDING" as InterestStatus,
              lastMessage: { content: lastExample.content, createdAt: lastExample.createdAt, fromMe: lastExample.fromMe },
            };
          }),
        ],
      });
    }
    if (decodeURIComponent(segments[2] ?? "") === HIRE_CONVERSATION_ID) {
      if (segments.length === 3 && method === "GET") return ok({ conversation: hireConversation() });
      if (segments[3] === "messages" && method === "GET") {
        const all = visibleHireMessages();
        const after = url.searchParams.get("after");
        const index = after ? all.findIndex((message) => message.id === after) : -1;
        return ok({ messages: all.slice(index + 1), cursor: all.at(-1)?.id ?? null });
      }
      return notAvailable();
    }
    const example = STATIC_CONVERSATIONS.find((item) => item.id === decodeURIComponent(segments[2] ?? ""));
    if (example) {
      if (segments.length === 3 && method === "GET") return ok({ conversation: exampleConversation(example) });
      if (segments[3] === "messages" && method === "GET") {
        const after = url.searchParams.get("after");
        const index = after ? example.messages.findIndex((message) => message.id === after) : -1;
        return ok({ messages: example.messages.slice(index + 1), cursor: example.messages.at(-1)?.id ?? null });
      }
      return notAvailable();
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
