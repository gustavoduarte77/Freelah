import {
  JOBS_DEFAULT_LIMIT,
  OPEN_JOB_STATUSES,
  describeJobAvailability,
  effectiveJobStatus,
  jobsQuerySchema,
  makeExcerpt,
  type CategoriesResponse,
  type JobDetail,
  type JobSummary,
  type JobsResponse,
  type PublicJobStatus,
} from "@freelah/shared";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "../db";
import type { Prisma } from "../generated/prisma/client";

const INVALID_QUERY_MESSAGE =
  "Parâmetros de busca inválidos. Confira o texto, a categoria, a cidade, os valores e o limite.";
const INVALID_CURSOR_MESSAGE = "A página solicitada não é válida. Recarregue a lista.";
const MAX_SEARCH_TERMS = 5;
/** O LIKE do Postgres trata % e _ como curingas: o texto digitado precisa ser literal. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summarySelect = {
  id: true,
  title: true,
  description: true,
  city: true,
  state: true,
  scheduledDate: true,
  startTime: true,
  proposedPriceCents: true,
  negotiable: true,
  status: true,
  isDemo: true,
  publishedAt: true,
  expiresAt: true,
  category: { select: { slug: true, name: true } },
} as const;

type SummaryRow = Prisma.JobGetPayload<{ select: typeof summarySelect }>;

// ---- cursor: opaco para o cliente; (publishedAt, id) dá uma ordem total e estável ----

const cursorSchema = z.object({ p: z.iso.datetime(), i: z.string().regex(UUID) });

function encodeCursor(row: { publishedAt: Date | null; id: string }): string {
  return Buffer.from(
    JSON.stringify({ p: row.publishedAt?.toISOString(), i: row.id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(raw: string): { publishedAt: Date; id: string } | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? { publishedAt: new Date(parsed.data.p), id: parsed.data.i } : null;
  } catch {
    return null;
  }
}

function toSummary(row: SummaryRow, now: Date): JobSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: makeExcerpt(row.description),
    category: row.category,
    city: row.city,
    state: row.state,
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    startTime: row.startTime,
    proposedPriceCents: row.proposedPriceCents,
    negotiable: row.negotiable,
    status: effectiveJobStatus(row.status as PublicJobStatus, row.expiresAt, now),
    isDemo: row.isDemo,
    publishedAt: (row.publishedAt ?? row.expiresAt).toISOString(),
  };
}

/**
 * Categorias e oportunidades públicas (PRD 9, 12 e 13): sem login e sem dados privados.
 * Rascunhos nunca saem daqui; a lista só traz oportunidades abertas e dentro do prazo.
 */
export function createJobsRouter(
  prisma: PrismaClient,
  options: { now?: () => Date } = {},
): Router {
  const now = options.now ?? (() => new Date());
  const router = Router();

  router.use(["/categories", "/jobs"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/categories", async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({
        where: { active: true },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      });
      const body: CategoriesResponse = { categories };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs", async (req, res, next) => {
    try {
      const parsed = jobsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "validation_error", message: INVALID_QUERY_MESSAGE });
        return;
      }
      const query = parsed.data;
      const limit = query.limit ?? JOBS_DEFAULT_LIMIT;
      const moment = now();

      const and: Prisma.JobWhereInput[] = [];
      if (query.cursor !== undefined) {
        const cursor = decodeCursor(query.cursor);
        if (!cursor) {
          res.status(400).json({ error: "invalid_cursor", message: INVALID_CURSOR_MESSAGE });
          return;
        }
        and.push({
          OR: [
            { publishedAt: { lt: cursor.publishedAt } },
            { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
          ],
        });
      }
      // Cada palavra da busca precisa aparecer no título, na descrição ou no nome da categoria.
      for (const term of (query.q ?? "").split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_TERMS)) {
        and.push({
          OR: [
            { title: { contains: escapeLike(term), mode: "insensitive" } },
            { description: { contains: escapeLike(term), mode: "insensitive" } },
            { category: { name: { contains: escapeLike(term), mode: "insensitive" } } },
          ],
        });
      }

      const rows = await prisma.job.findMany({
        where: {
          status: { in: [...OPEN_JOB_STATUSES] },
          expiresAt: { gt: moment },
          publishedAt: { not: null },
          category: { active: true, ...(query.category ? { slug: query.category } : {}) },
          ...(query.city ? { city: { contains: escapeLike(query.city), mode: "insensitive" } } : {}),
          ...(query.minPriceCents !== undefined || query.maxPriceCents !== undefined
            ? {
                proposedPriceCents: {
                  ...(query.minPriceCents !== undefined ? { gte: query.minPriceCents } : {}),
                  ...(query.maxPriceCents !== undefined ? { lte: query.maxPriceCents } : {}),
                },
              }
            : {}),
          AND: and,
        },
        select: summarySelect,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      const body: JobsResponse = {
        jobs: page.map((row) => toSummary(row, moment)),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const notFound = () =>
        res.status(404).json({ error: "not_found", message: "Oportunidade não encontrada." });
      if (!UUID.test(id)) {
        notFound();
        return;
      }
      const row = await prisma.job.findFirst({
        // Rascunho não é público: tratado como inexistente.
        where: { id, status: { not: "DRAFT" } },
        select: {
          ...summarySelect,
          additionalInfo: true,
          owner: { select: { name: true, city: true, isDemo: true } },
        },
      });
      if (!row) {
        notFound();
        return;
      }
      const moment = now();
      const summary = toSummary(row, moment);
      const availability = describeJobAvailability(summary.status);
      const body: JobDetail = {
        ...summary,
        description: row.description,
        additionalInfo: row.additionalInfo,
        expiresAt: row.expiresAt.toISOString(),
        owner: { name: row.owner.name, city: row.owner.city, isDemo: row.owner.isDemo },
        acceptingInterests: availability.acceptingInterests,
        statusMessage: availability.message,
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
