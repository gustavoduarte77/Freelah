import { z } from "zod";

// Contrato público de categorias e oportunidades (PRD 12, 13 e 29.3/29.4), usado pela API
// (validação e resposta) e pelo app (montagem da consulta e leitura da resposta).

export const JOBS_DEFAULT_LIMIT = 20;
export const JOBS_MAX_LIMIT = 50;
export const JOBS_SEARCH_MAX_LENGTH = 100;

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoriesResponseSchema = z.object({ categories: z.array(categorySchema) });
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;

// ---------------------------------------------------------------------------
// Estados (PRD 14). O rascunho nunca é público, por isso não faz parte deste contrato.
// ---------------------------------------------------------------------------

export const publicJobStatusSchema = z.enum([
  "PUBLISHED",
  "NEGOTIATING",
  "HIRED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
]);
export type PublicJobStatus = z.infer<typeof publicJobStatusSchema>;

/** Estados em que a oportunidade ainda aceita interessados e aparece na exploração. */
export const OPEN_JOB_STATUSES = ["PUBLISHED", "NEGOTIATING"] as const;

/**
 * Estado que a pessoa deve ver: uma oportunidade aberta cujo prazo terminou é "expirada", mesmo
 * que nenhuma rotina tenha gravado isso no banco ainda. Decidido sempre pelo servidor.
 */
export function effectiveJobStatus(
  status: PublicJobStatus,
  expiresAt: Date,
  now: Date,
): PublicJobStatus {
  const open = (OPEN_JOB_STATUSES as readonly string[]).includes(status);
  return open && expiresAt.getTime() <= now.getTime() ? "EXPIRED" : status;
}

export interface JobAvailability {
  acceptingInterests: boolean;
  /** Explicação para a pessoa quando o estado merece aviso (PRD 13.4); `null` se está tudo normal. */
  message: string | null;
}

export function describeJobAvailability(status: PublicJobStatus): JobAvailability {
  switch (status) {
    case "PUBLISHED":
      return { acceptingInterests: true, message: null };
    case "NEGOTIATING":
      return {
        acceptingInterests: true,
        message: "Em negociação: o contratante já tem interessados, mas você ainda pode participar.",
      };
    case "HIRED":
      return {
        acceptingInterests: false,
        message: "Esta oportunidade já foi contratada e não aceita novos interessados.",
      };
    case "COMPLETED":
      return {
        acceptingInterests: false,
        message: "O serviço desta oportunidade já foi concluído.",
      };
    case "CANCELLED":
      return {
        acceptingInterests: false,
        message: "O contratante cancelou esta oportunidade.",
      };
    case "EXPIRED":
      return {
        acceptingInterests: false,
        message: "O prazo desta oportunidade terminou e ela não aceita novos interessados.",
      };
  }
}

// ---------------------------------------------------------------------------
// Consulta da listagem (query string => valores tipados)
// ---------------------------------------------------------------------------

/** Texto opcional: vazio ou só espaços equivale a "não informado". */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().max(max).optional(),
  );

/** Inteiro opcional vindo da query string: só dígitos, vazio equivale a "não informado". */
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z
      .string()
      .regex(/^\d{1,9}$/)
      .transform(Number)
      .pipe(z.number().int().min(min).max(max))
      .optional(),
  );

export const jobsQuerySchema = z
  .object({
    q: optionalText(JOBS_SEARCH_MAX_LENGTH),
    category: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || undefined : value),
      z
        .string()
        .max(60)
        .regex(/^[a-z0-9-]+$/)
        .optional(),
    ),
    city: optionalText(80),
    minPriceCents: optionalInt(0, 100_000_000),
    maxPriceCents: optionalInt(0, 100_000_000),
    limit: optionalInt(1, JOBS_MAX_LIMIT),
    cursor: optionalText(300),
  })
  .refine(
    (query) =>
      query.minPriceCents === undefined ||
      query.maxPriceCents === undefined ||
      query.minPriceCents <= query.maxPriceCents,
    { message: "O valor mínimo não pode ser maior que o máximo.", path: ["minPriceCents"] },
  );

export type JobsQuery = z.output<typeof jobsQuerySchema>;

/** Parâmetros que o app informa (todos opcionais; vazios são omitidos da URL). */
export interface JobsQueryParams {
  q?: string;
  category?: string;
  city?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  limit?: number;
  cursor?: string;
}

export function buildJobsQueryString(params: JobsQueryParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hourMinute = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const jobSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Começo da descrição, para a lista. */
  excerpt: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  city: z.string(),
  state: z.string(),
  scheduledDate: isoDate,
  startTime: hourMinute,
  proposedPriceCents: z.number().int().nonnegative(),
  negotiable: z.boolean(),
  status: publicJobStatusSchema,
  /** Dado de demonstração (PRD 38.2): a interface mostra o selo "Demonstração". */
  isDemo: z.boolean(),
  publishedAt: z.string(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const jobsResponseSchema = z.object({
  jobs: z.array(jobSummarySchema),
  /** Cursor opaco da próxima página; `null` quando acabou. */
  nextCursor: z.string().nullable(),
});
export type JobsResponse = z.infer<typeof jobsResponseSchema>;

/** Detalhe público. Do contratante só saem nome e cidade: nunca telefone, e-mail ou id. */
export const jobDetailSchema = jobSummarySchema.extend({
  description: z.string(),
  additionalInfo: z.string().nullable(),
  expiresAt: z.string(),
  owner: z.object({ name: z.string(), city: z.string(), isDemo: z.boolean() }),
  acceptingInterests: z.boolean(),
  statusMessage: z.string().nullable(),
});
export type JobDetail = z.infer<typeof jobDetailSchema>;

// ---------------------------------------------------------------------------
// Apresentação (sem Date nem Intl, para dar o mesmo resultado em todas as plataformas)
// ---------------------------------------------------------------------------

/** 20000 => "R$ 200,00"; 123456 => "R$ 1.234,56". */
export function formatPriceCents(cents: number): string {
  const total = Math.max(0, Math.round(cents));
  const reais = Math.floor(total / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = (total % 100).toString().padStart(2, "0");
  return `R$ ${reais},${centavos}`;
}

/** "2026-09-12" => "12/09/2026". Valor fora do formato volta como veio. */
export function formatJobDate(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDay;
}

/** Texto curto para a lista: corta no limite sem partir palavra e junta quebras de linha. */
export function makeExcerpt(description: string, max = 140): string {
  const text = description.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** "R$ 10,50" ou "12,5" (digitado em reais) => centavos; `null` se não for um valor válido. */
export function parseReaisToCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
