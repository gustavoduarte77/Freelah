import { createJobSchema, jobFieldErrors, serviceInstant, validateJobSchedule, JOB_DEADLINE_MAX_DAYS } from "./jobs-write";
import { parseReaisToCents } from "./jobs";
import type { CreateJobRequest } from "./my-jobs-api";

// Lógica do formulário de publicação (sem React): máscaras, leitura de data e hora digitadas,
// cálculo do prazo e conversão do que a pessoa digitou no corpo da API (e dos erros da API de
// volta para os campos). As regras de validação são as mesmas da API (`jobs-write`).

// ---------------------------------------------------------------------------
// Valores do formulário (tudo como texto digitado, exceto "negociável")
// ---------------------------------------------------------------------------

export interface JobFormValues {
  title: string;
  description: string;
  additionalInfo: string;
  categoryId: string;
  city: string;
  state: string;
  /** "DD/MM/AAAA" */
  scheduledDate: string;
  /** "HH:MM" */
  startTime: string;
  /** Em reais, como a pessoa digita: "200", "200,00", "R$ 200". */
  price: string;
  negotiable: boolean;
  /** Último dia da publicação, "DD/MM/AAAA". */
  deadlineDate: string;
}

export type JobFormField = Exclude<keyof JobFormValues, "negotiable">;
/** Mensagens por campo; "_" é o que não pertence a nenhum campo. */
export type JobFormErrors = Partial<Record<JobFormField | "_", string>>;

export function emptyJobForm(defaults: { city?: string } = {}): JobFormValues {
  return {
    title: "",
    description: "",
    additionalInfo: "",
    categoryId: "",
    city: defaults.city ?? "",
    state: "",
    scheduledDate: "",
    startTime: "",
    price: "",
    negotiable: false,
    deadlineDate: "",
  };
}

// ---------------------------------------------------------------------------
// Máscaras (aplicadas enquanto a pessoa digita)
// ---------------------------------------------------------------------------

/** "20102026" => "20/10/2026". Só dígitos, no máximo 8. */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "0800" => "08:00". Só dígitos, no máximo 4. */
export function maskTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** Duas letras maiúsculas. */
export function maskStateInput(raw: string): string {
  return raw.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Datas (horário de Brasília)
// ---------------------------------------------------------------------------

const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "20/10/2026" => "2026-10-20"; `null` se não for uma data que existe. */
export function parseBrDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return serviceInstant(iso, "00:00") ? iso : null;
}

/** "2026-10-20" => "20/10/2026". */
export function formatBrDate(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDay;
}

/** Dia, mês e ano de um instante, no horário de Brasília ("AAAA-MM-DD"). */
function brasiliaDay(instant: Date): string {
  return new Date(instant.getTime() - BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "20/10/2026 às 23:59", no horário de Brasília. */
export function formatBrasiliaDateTime(instant: Date): string {
  const shifted = new Date(instant.getTime() - BRASILIA_OFFSET_MS);
  const day = formatBrDate(shifted.toISOString().slice(0, 10));
  return `${day} às ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

// ---------------------------------------------------------------------------
// Prazo da publicação: a pessoa escolhe só o último dia
// ---------------------------------------------------------------------------

export type DeadlineCap = "service" | "limit";

export interface Deadline {
  /** Instante final da publicação. */
  instant: Date;
  /** Por que o horário não é 23:59 do dia escolhido, quando for o caso. */
  cappedBy: DeadlineCap | null;
}

/** Último dia permitido para o prazo, a partir de agora (60 dias), "AAAA-MM-DD". */
function latestDeadlineDay(now: Date): string {
  return brasiliaDay(new Date(now.getTime() + JOB_DEADLINE_MAX_DAYS * DAY_MS));
}

/**
 * Horário final da publicação para o dia escolhido: 23:59 de Brasília, mas nunca depois do início
 * do serviço nem além de 60 dias a partir de agora. Devolve uma mensagem se o dia não é válido.
 */
export function computeDeadline(input: {
  deadlineDate: string;
  scheduledDate: string;
  startTime: string;
  now: Date;
}): Deadline | { error: string } {
  const text = input.deadlineDate.trim();
  if (!text) return { error: "Informe até que dia a oportunidade fica publicada." };
  const day = parseBrDate(text);
  if (!day) return { error: "Informe o prazo no formato DD/MM/AAAA, com um dia que exista." };
  const latest = latestDeadlineDay(input.now);
  if (day > latest) {
    return {
      error: `O prazo pode ser de no máximo ${JOB_DEADLINE_MAX_DAYS} dias a partir de hoje (até ${formatBrDate(latest)}).`,
    };
  }

  let instant = serviceInstant(day, "23:59");
  if (!instant) return { error: "Informe o prazo no formato DD/MM/AAAA, com um dia que exista." };
  let cappedBy: DeadlineCap | null = null;

  const serviceDay = parseBrDate(input.scheduledDate);
  const service = serviceDay ? serviceInstant(serviceDay, input.startTime) : null;
  if (service && service.getTime() < instant.getTime()) {
    instant = service;
    cappedBy = "service";
  }
  const limit = new Date(input.now.getTime() + JOB_DEADLINE_MAX_DAYS * DAY_MS);
  if (limit.getTime() < instant.getTime()) {
    instant = limit;
    cappedBy = "limit";
  }
  return { instant, cappedBy };
}

/** Texto curto para a revisão: "20/10/2026 às 23:59", com o motivo quando o horário foi limitado. */
export function describeDeadline(deadline: Deadline): string {
  const base = formatBrasiliaDateTime(deadline.instant);
  if (deadline.cappedBy === "service") return `${base} (limitado ao início do serviço)`;
  if (deadline.cappedBy === "limit") return `${base} (limite de ${JOB_DEADLINE_MAX_DAYS} dias)`;
  return base;
}

/**
 * Sugestão de prazo: o dia anterior ao serviço, sem passar de hoje (mínimo) nem do limite de 60
 * dias (máximo). Vazio se a data do serviço ainda não é válida.
 */
export function suggestDeadlineDate(scheduledDate: string, now: Date): string {
  const serviceDay = parseBrDate(scheduledDate);
  if (!serviceDay) return "";
  const [year, month, day] = serviceDay.split("-").map(Number) as [number, number, number];
  const before = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  const today = brasiliaDay(now);
  const latest = latestDeadlineDay(now);
  const chosen = before < today ? today : before > latest ? latest : before;
  return formatBrDate(chosen);
}

// ---------------------------------------------------------------------------
// Do formulário para a API, e da API de volta para os campos
// ---------------------------------------------------------------------------

/** Nome do campo na API => campo do formulário. */
const SERVER_FIELD_TO_FORM: Record<string, JobFormField | "_"> = {
  title: "title",
  description: "description",
  additionalInfo: "additionalInfo",
  categoryId: "categoryId",
  city: "city",
  state: "state",
  scheduledDate: "scheduledDate",
  startTime: "startTime",
  proposedPriceCents: "price",
  expiresAt: "deadlineDate",
};

/** Mensagens da API (por campo da API) => mensagens por campo do formulário. */
export function mapServerFields(fields: Record<string, string>): JobFormErrors {
  const errors: JobFormErrors = {};
  for (const [key, message] of Object.entries(fields)) {
    const target = SERVER_FIELD_TO_FORM[key] ?? "_";
    errors[target] ??= message;
  }
  return errors;
}

export const PRICE_REQUIRED_MESSAGE = "Informe o valor.";
export const PRICE_FORMAT_MESSAGE = "Digite um valor em reais, como 200 ou 200,00.";
export const DATE_FORMAT_MESSAGE = "Informe a data no formato DD/MM/AAAA, com um dia que exista.";
export const TIME_FORMAT_MESSAGE = "Informe o horário no formato HH:MM, como 08:00.";

export type BuildResult =
  | {
      ok: true;
      request: CreateJobRequest;
      deadline: Deadline;
      /** Início do serviço (para a revisão). */
      service: Date;
    }
  | { ok: false; errors: JobFormErrors };

/**
 * Valida o que foi digitado com as mesmas regras da API e monta o corpo de `POST /me/jobs`.
 * Devolve TODAS as mensagens de uma vez (uma por campo), para a pessoa corrigir de uma só vez.
 */
export function buildCreateJobRequest(values: JobFormValues, now: Date): BuildResult {
  const errors: JobFormErrors = {};

  // Valor
  let cents: number | null = null;
  if (!values.price.trim()) errors.price = PRICE_REQUIRED_MESSAGE;
  else {
    cents = parseReaisToCents(values.price);
    if (cents === null) errors.price = PRICE_FORMAT_MESSAGE;
  }

  // Data e horário do serviço
  const scheduledIso = parseBrDate(values.scheduledDate);
  if (!values.scheduledDate.trim()) errors.scheduledDate = "Informe a data do serviço.";
  else if (!scheduledIso) errors.scheduledDate = DATE_FORMAT_MESSAGE;
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(values.startTime.trim());
  if (!values.startTime.trim()) errors.startTime = "Informe o horário do serviço.";
  else if (!timeOk) errors.startTime = TIME_FORMAT_MESSAGE;

  // Prazo
  const deadline = computeDeadline({
    deadlineDate: values.deadlineDate,
    scheduledDate: values.scheduledDate,
    startTime: values.startTime.trim(),
    now,
  });
  if ("error" in deadline) errors.deadlineDate = deadline.error;

  // Demais campos e coerência: as mesmas regras da API, só com o que já está legível.
  const candidate: Record<string, unknown> = {
    title: values.title,
    description: values.description,
    additionalInfo: values.additionalInfo,
    categoryId: values.categoryId,
    city: values.city,
    state: values.state,
    negotiable: values.negotiable,
  };
  if (cents !== null) candidate.proposedPriceCents = cents;
  if (scheduledIso) candidate.scheduledDate = scheduledIso;
  if (timeOk) candidate.startTime = values.startTime.trim();
  if (!("error" in deadline)) candidate.expiresAt = deadline.instant.toISOString();

  const parsed = createJobSchema.safeParse(candidate);
  if (!parsed.success) {
    // As mensagens específicas acima têm prioridade sobre as de "campo obrigatório" do esquema.
    for (const [key, message] of Object.entries(mapServerFields(jobFieldErrors(parsed.error)))) {
      errors[key as JobFormField | "_"] ??= message;
    }
  }
  // O calendário só depende de data, horário e prazo: confere mesmo que outro campo esteja errado,
  // para a pessoa ver todos os problemas de uma vez.
  if (scheduledIso && timeOk && !("error" in deadline)) {
    const schedule = validateJobSchedule(
      { scheduledDate: scheduledIso, startTime: values.startTime.trim(), expiresAt: deadline.instant.toISOString() },
      now,
      true,
    );
    for (const [key, message] of Object.entries(mapServerFields(schedule))) {
      errors[key as JobFormField | "_"] ??= message;
    }
  }

  if (Object.keys(errors).length > 0 || !parsed.success || "error" in deadline) {
    return { ok: false, errors };
  }
  const service = serviceInstant(parsed.data.scheduledDate, parsed.data.startTime);
  if (!service) return { ok: false, errors: { scheduledDate: DATE_FORMAT_MESSAGE } };
  return { ok: true, request: parsed.data, deadline, service };
}

/** Primeiro campo com erro, na ordem em que aparecem no formulário (para rolar até ele). */
export const JOB_FORM_FIELD_ORDER: readonly JobFormField[] = [
  "title",
  "description",
  "categoryId",
  "city",
  "state",
  "scheduledDate",
  "startTime",
  "price",
  "deadlineDate",
  "additionalInfo",
];

export function firstErrorField(errors: JobFormErrors): JobFormField | null {
  return JOB_FORM_FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}
