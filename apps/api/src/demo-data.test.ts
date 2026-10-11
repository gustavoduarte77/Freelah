import { describe, expect, it } from "vitest";
import { MVP_CATEGORIES } from "../prisma/categories";
import {
  DEMO_OWNERS,
  DEMO_VISIBLE_JOB_COUNT,
  DEMO_WORKER,
  buildDemoJobs,
} from "../prisma/demo-data";

const NOW = new Date("2026-10-11T12:00:00Z");
const jobs = buildDemoJobs(NOW);

describe("dados de demonstração", () => {
  it("ids únicos, em formato de UUID, e e-mails fictícios", () => {
    const ids = jobs.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    for (const person of [...DEMO_OWNERS, DEMO_WORKER]) {
      expect(person.email.endsWith("@demo.freelah.invalid")).toBe(true);
      expect(person.name).toContain("(demonstração)");
    }
  });

  it("respeita as regras do banco (horário, valor, categoria e dono)", () => {
    const slugs = MVP_CATEGORIES.map((c) => c.slug) as string[];
    const owners = DEMO_OWNERS.map((o) => o.id);
    for (const job of jobs) {
      expect(job.startTime).toMatch(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
      expect(job.proposedPriceCents).toBeGreaterThanOrEqual(0);
      expect(slugs).toContain(job.category);
      expect(owners).toContain(job.ownerId);
      expect(job.state).toHaveLength(2);
    }
  });

  it("cobre as cinco categorias entre as oportunidades visíveis", () => {
    const visible = jobs.filter((j) => (j.status === "PUBLISHED" || j.status === "NEGOTIATING") && j.expiresAt > NOW);
    expect(visible).toHaveLength(DEMO_VISIBLE_JOB_COUNT);
    expect(new Set(visible.map((j) => j.category)).size).toBe(MVP_CATEGORIES.length);
    expect(visible.every((j) => j.publishedAt && j.publishedAt <= NOW)).toBe(true);
  });

  it("inclui casos que precisam ficar escondidos: cancelada, prazo vencido, contratada e rascunho", () => {
    const hidden = jobs.filter((j) => !((j.status === "PUBLISHED" || j.status === "NEGOTIATING") && j.expiresAt > NOW));
    expect(hidden.map((j) => j.status).sort()).toEqual(["CANCELLED", "DRAFT", "HIRED", "PUBLISHED"]);
    expect(hidden.find((j) => j.status === "HIRED")?.hiredWorkerId).toBe(DEMO_WORKER.id);
  });

  it("as datas acompanham o momento da execução (não envelhecem)", () => {
    const later = buildDemoJobs(new Date("2027-01-01T00:00:00Z"));
    const first = jobs[0]!;
    const same = later.find((j) => j.id === first.id)!;
    expect(same.expiresAt.getTime() - first.expiresAt.getTime()).toBe(
      new Date("2027-01-01T00:00:00Z").getTime() - NOW.getTime(),
    );
  });
});
