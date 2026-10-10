import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MVP_CATEGORIES } from "../prisma/categories";

const migration = readFileSync(
  new URL("../prisma/migrations/20261009000000_init/migration.sql", import.meta.url),
  "utf8",
);

describe("categorias do MVP", () => {
  it("são as 5 do PRD, sem nomes ou slugs duplicados", () => {
    expect(MVP_CATEGORIES).toHaveLength(5);
    expect(new Set(MVP_CATEGORIES.map((c) => c.slug)).size).toBe(5);
    expect(new Set(MVP_CATEGORIES.map((c) => c.name)).size).toBe(5);
  });
});

describe("migração inicial", () => {
  it.each([
    "UserPreference_at_least_one_chk",
    "Job_price_non_negative_chk",
    "Job_start_time_format_chk",
    "Job_hiring_consistency_chk",
    "Report_has_target_chk",
    "UserBlock_not_self_chk",
  ])("inclui a regra de integridade %s", (name) => {
    expect(migration).toContain(name);
  });

  it("garante interesse único por trabalhador e oportunidade", () => {
    expect(migration).toMatch(/UNIQUE INDEX "Interest_jobId_workerId_key"/);
  });

  it("garante um único trabalhador selecionado por oportunidade", () => {
    expect(migration).toMatch(/UNIQUE INDEX "Job_selectedInterestId_key"/);
  });

  it("não guarda senha nem telefone em tabelas públicas além do esperado", () => {
    expect(migration.match(/"password"/g)).toHaveLength(1);
    expect(migration.match(/"phone"/g)).toHaveLength(1);
  });
});
