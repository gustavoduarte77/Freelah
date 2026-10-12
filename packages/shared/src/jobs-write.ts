import { z } from "zod";
import { OPEN_JOB_STATUSES, publicJobStatusSchema } from "./jobs";

// Contrato de criação, edição e gerenciamento das próprias oportunidades (PRD 14, 15 e 16).
// A API é a fonte da verdade: valida tudo outra vez. O app usa as mesmas regras para avisar a
// pessoa antes de enviar.

// ---------------------------------------------------------------------------
// Limites e mensagens
// ---------------------------------------------------------------------------

export const JOB_TITLE_MIN = 3;
export const JOB_TITLE_MAX = 100;
export const JOB_DESCRIPTION_MIN = 10;
export const JOB_DESCRIPTION_MAX = 2000;
export const JOB_ADDITIONAL_INFO_MAX = 1000;
export const JOB_CITY_MIN = 2;
export const JOB_CITY_MAX = 80;
/** R$ 999.999,99 em centavos: cabe com folga no inteiro do banco e cobre qualquer bico. */
export const JOB_PRICE_MAX_CENTS = 99_999_999;
/** Quanto tempo a publicação pode durar, no máximo, a partir do momento em que é salva. */
export const JOB_DEADLINE_MAX_DAYS = 60;

export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const JOB_VALIDATION_MESSAGE =
  "Confira os campos destacados e tente de novo.";

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

/** Caracteres de controle (exceto quebra de linha e tabulação) não têm lugar em texto digitado. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NO_CONTROL = "Há caracteres que não são aceitos neste campo.";

const singleLine = (min: number, max: number, required: string, tooShort: string, tooLong: string) =>
  z
    .string({ error: required })
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, required)
        .min(min, tooShort)
        .max(max, tooLong)
        .refine((value) => !CONTROL_CHARS.test(value), NO_CONTROL),
    );

const multiLine = (min: number, max: number, required: string, tooShort: string, tooLong: string) =>
  z
    .string({ error: required })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, required)
        .min(min, tooShort)
        .max(max, tooLong)
        .refine((value) => !CONTROL_CHARS.test(value), NO_CONTROL),
    );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jobFieldShape = {
  title: singleLine(
    JOB_TITLE_MIN,
    JOB_TITLE_MAX,
    "Informe o título.",
    `O título precisa ter pelo menos ${JOB_TITLE_MIN} letras.`,
    `O título pode ter no máximo ${JOB_TITLE_MAX} caracteres.`,
  ),
  description: multiLine(
    JOB_DESCRIPTION_MIN,
    JOB_DESCRIPTION_MAX,
    "Informe a descrição.",
    `Descreva o serviço com pelo menos ${JOB_DESCRIPTION_MIN} caracteres.`,
    `A descrição pode ter no máximo ${JOB_DESCRIPTION_MAX} caracteres.`,
  ),
  /** Opcional. Texto vazio equivale a "sem informações adicionais". */
  additionalInfo: z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .pipe(
      z
        .string()
        .max(JOB_ADDITIONAL_INFO_MAX, `As informações adicionais podem ter no máximo ${JOB_ADDITIONAL_INFO_MAX} caracteres.`)
        .refine((value) => !CONTROL_CHARS.test(value), NO_CONTROL),
    )
    .transform((value) => (value === "" ? null : value)),
  categoryId: z
    .string({ error: "Escolha uma categoria." })
    .regex(UUID, "Escolha uma categoria."),
  city: singleLine(
    JOB_CITY_MIN,
    JOB_CITY_MAX,
    "Informe a cidade.",
    "Informe o nome da cidade.",
    `O nome da cidade pode ter no máximo ${JOB_CITY_MAX} caracteres.`,
  ),
  state: z
    .string({ error: "Informe o estado (UF)." })
    .transform((value) => value.trim().toUpperCase())
    .pipe(
      z.enum(BRAZILIAN_STATES, { error: "Informe a sigla de um estado brasileiro, como MG." }),
    ),
  /** Dia do serviço, "AAAA-MM-DD", no horário de Brasília. */
  scheduledDate: z
    .string({ error: "Informe a data do serviço." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
  /** Horário do serviço, "HH:MM", no horário de Brasília. */
  startTime: z
    .string({ error: "Informe o horário do serviço." })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido, como 08:00."),
  /** Valor em centavos (R$ 200,00 = 20000). */
  proposedPriceCents: z
    .number({ error: "Informe o valor." })
    .int("O valor precisa ser em centavos inteiros.")
    .min(0, "O valor não pode ser negativo.")
    .max(JOB_PRICE_MAX_CENTS, "O valor é maior que o permitido."),
  negotiable: z.boolean({ error: "Informe se o valor é negociável." }),
  /** Fim do prazo da publicação, como instante ISO 8601 com fuso (ex.: "2026-10-20T23:59:00-03:00"). */
  expiresAt: z
    .string({ error: "Informe o prazo da publicação." })
    .refine((value) => Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value), "Informe um prazo válido."),
};

/** Criação. `publish: true` cria já publicada; o padrão é salvar como rascunho. */
export const createJobSchema = z.strictObject({
  ...jobFieldShape,
  additionalInfo: jobFieldShape.additionalInfo.optional(),
  negotiable: jobFieldShape.negotiable.optional(),
  publish: z.boolean({ error: "O campo publish deve ser verdadeiro ou falso." }).optional(),
});
export type CreateJobInput = z.output<typeof createJobSchema>;

/** Edição parcial: só os campos enviados mudam. Pelo menos um campo é obrigatório. */
export const updateJobSchema = z
  .strictObject(jobFieldShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Envie ao menos um campo para alterar.");
export type UpdateJobInput = z.output<typeof updateJobSchema>;

/**
 * Mensagens por campo a partir de um erro do Zod. Campos desconhecidos (inclusive `ownerId`,
 * `status` e `isDemo`) aparecem sob a chave "_".
 */
export function jobFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      fields._ = `Campo não permitido: ${issue.keys.join(", ")}.`;
      continue;
    }
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Data, horário e prazo (horário de Brasília)
// ---------------------------------------------------------------------------

/**
 * O Brasil não tem horário de verão desde 2019: Brasília é sempre UTC-3. Se isso mudar, é aqui
 * (e só aqui) que o deslocamento precisa de ajuste.
 */
const BRASILIA_OFFSET_HOURS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante em que o serviço começa ("2026-10-20" + "08:00" em Brasília); `null` se a data não existe. */
export function serviceInstant(scheduledDate: string, startTime: string): Date | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate);
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!date || !time) return null;
  const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(
    Date.UTC(year, month - 1, day, Number(time[1]) + BRASILIA_OFFSET_HOURS, Number(time[2])),
  );
}

export interface JobSchedule {
  scheduledDate: string;
  startTime: string;
  /** Instante ISO 8601 com fuso. */
  expiresAt: string;
}

/**
 * Coerência de data, horário e prazo. Devolve mensagens por campo (vazio = tudo certo).
 *
 * - Sempre: a data existe e o prazo não passa do início do serviço.
 * - `relativeToNow`: o serviço ainda não começou, o prazo está no futuro e a publicação dura no
 *   máximo 60 dias. Fica desligado só ao editar campos sem relação com o calendário, para que
 *   um rascunho antigo continue podendo ser salvo.
 */
export function validateJobSchedule(
  schedule: JobSchedule,
  now: Date,
  relativeToNow: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const service = serviceInstant(schedule.scheduledDate, schedule.startTime);
  const expires = new Date(schedule.expiresAt);

  if (!service) {
    errors.scheduledDate = "Informe uma data válida.";
  } else if (relativeToNow && service.getTime() <= now.getTime()) {
    errors.scheduledDate = "A data e o horário do serviço precisam estar no futuro.";
  }

  if (Number.isNaN(expires.getTime())) {
    errors.expiresAt = "Informe um prazo válido.";
  } else if (service && expires.getTime() > service.getTime()) {
    errors.expiresAt = "O prazo da publicação não pode ser depois da data e do horário do serviço.";
  } else if (relativeToNow && expires.getTime() <= now.getTime()) {
    errors.expiresAt = "O prazo da publicação precisa estar no futuro.";
  } else if (relativeToNow && expires.getTime() > now.getTime() + JOB_DEADLINE_MAX_DAYS * DAY_MS) {
    errors.expiresAt = `O prazo pode ser de no máximo ${JOB_DEADLINE_MAX_DAYS} dias a partir de agora.`;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Estados vistos pelo dono (PRD 14) e o que cada um permite
// ---------------------------------------------------------------------------

export const ownJobStatusSchema = z.enum(["DRAFT", ...publicJobStatusSchema.options]);
export type OwnJobStatus = z.infer<typeof ownJobStatusSchema>;

/** Rascunho nunca expira; uma oportunidade aberta com prazo vencido já conta como expirada. */
export function ownJobEffectiveStatus(status: OwnJobStatus, expiresAt: Date, now: Date): OwnJobStatus {
  const open = (OPEN_JOB_STATUSES as readonly string[]).includes(status);
  return open && expiresAt.getTime() <= now.getTime() ? "EXPIRED" : status;
}

/** Editar: até a contratação (PRD 14). */
export const EDITABLE_JOB_STATUSES: readonly OwnJobStatus[] = ["DRAFT", "PUBLISHED", "NEGOTIATING"];
/** Cancelar: rascunho, publicada ou em negociação. */
export const CANCELLABLE_JOB_STATUSES: readonly OwnJobStatus[] = ["DRAFT", "PUBLISHED", "NEGOTIATING"];

export const canEditJob = (status: OwnJobStatus) => EDITABLE_JOB_STATUSES.includes(status);
export const canCancelJob = (status: OwnJobStatus) => CANCELLABLE_JOB_STATUSES.includes(status);
export const canPublishJob = (status: OwnJobStatus) => status === "DRAFT";

export const OWN_JOB_STATE_MESSAGES: Record<OwnJobStatus, string> = {
  DRAFT: "Rascunho: ainda não aparece para ninguém.",
  PUBLISHED: "Publicada.",
  NEGOTIATING: "Em negociação.",
  HIRED: "Esta oportunidade já foi contratada e não pode mais ser alterada.",
  COMPLETED: "Esta oportunidade já foi concluída e não pode mais ser alterada.",
  CANCELLED: "Esta oportunidade foi cancelada e não pode mais ser alterada.",
  EXPIRED: "O prazo desta oportunidade terminou e ela não pode mais ser alterada.",
};

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

/** A oportunidade como o dono a vê: todos os estados, inclusive rascunho, e o que ele pode fazer. */
export const ownJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  additionalInfo: z.string().nullable(),
  category: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  city: z.string(),
  state: z.string(),
  scheduledDate: z.string(),
  startTime: z.string(),
  proposedPriceCents: z.number().int().nonnegative(),
  negotiable: z.boolean(),
  status: ownJobStatusSchema,
  isDemo: z.boolean(),
  expiresAt: z.string(),
  publishedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Pessoas com interesse ativo (pendente) nesta oportunidade. */
  interestCount: z.number().int().nonnegative().default(0),
  canEdit: z.boolean(),
  canPublish: z.boolean(),
  canCancel: z.boolean(),
});
export type OwnJob = z.infer<typeof ownJobSchema>;

export const ownJobResponseSchema = z.object({ job: ownJobSchema });
export type OwnJobResponse = z.infer<typeof ownJobResponseSchema>;

export const ownJobsResponseSchema = z.object({ jobs: z.array(ownJobSchema) });
export type OwnJobsResponse = z.infer<typeof ownJobsResponseSchema>;
