import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MVP_CATEGORIES } from "../prisma/categories";

const migration = readFileSync(
  new URL("../prisma/migrations/20261009000000_init/migration.sql", import.meta.url),
  "utf8",
);

describe("categorias do MVP", () => {
  const original = ["servicos-domesticos", "servicos-comerciais", "construcao-civil", "servicos-de-manutencao", "aulas-particulares"];
  const technology = ["tecnologia-e-suporte", "sites-e-aplicativos", "design-e-criacao-digital"];

  it("são as 5 do PRD mais as 3 de tecnologia e criação, sem nomes ou slugs duplicados", () => {
    expect(MVP_CATEGORIES).toHaveLength(8);
    expect(new Set(MVP_CATEGORIES.map((c) => c.slug)).size).toBe(8);
    expect(new Set(MVP_CATEGORIES.map((c) => c.name)).size).toBe(8);
  });

  it("mantém as cinco originais e acrescenta as três novas (acrescenta, não substitui)", () => {
    const slugs = MVP_CATEGORIES.map((c) => c.slug) as string[];
    for (const slug of [...original, ...technology]) expect(slugs).toContain(slug);
    expect(MVP_CATEGORIES.find((c) => c.slug === "design-e-criacao-digital")?.name).toBe("Design e Criação Digital");
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

describe("migração do valor opcional (A negociar)", () => {
  const optional = readFileSync(
    new URL("../prisma/migrations/20261018000000_job_price_optional/migration.sql", import.meta.url),
    "utf8",
  );
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  it("só torna o valor opcional e exige negociável sem valor, sem alterar nem apagar dados", () => {
    expect(optional).toContain('ALTER COLUMN "proposedPriceCents" DROP NOT NULL');
    expect(optional).toContain("Job_no_price_requires_negotiable_chk");
    expect(optional).toContain('"proposedPriceCents" IS NOT NULL OR "negotiable"');
    const statements = optional.replace(/--.*$/gm, "");
    expect(statements).not.toMatch(/\b(UPDATE|DELETE|DROP TABLE|TRUNCATE)\b/i);
    // preços antigos nunca viram zero nem "A negociar" automaticamente
    expect(statements).not.toMatch(/SET\s+"proposedPriceCents"/i);
  });

  it("o schema do Prisma tem o valor opcional e a migração inicial continua com o valor não negativo", () => {
    expect(schema).toMatch(/proposedPriceCents\s+Int\?/);
    expect(migration).toContain("Job_price_non_negative_chk");
  });
});

describe("migração das propostas de valor", () => {
  const proposals = readFileSync(new URL("../prisma/migrations/20261018010000_proposals/migration.sql", import.meta.url), "utf8");
  const sql = proposals.replace(/--.*$/gm, "");

  it("é independente: só cria o tipo e a tabela novos, sem tocar em outras tabelas nem apagar dados", () => {
    expect(sql).toContain('CREATE TYPE "ProposalStatus"');
    expect(sql).toContain('CREATE TABLE "Proposal"');
    expect(sql).not.toMatch(/\bALTER TABLE "(?!Proposal")/);
    // (ON DELETE / ON UPDATE das chaves estrangeiras não são comandos que alteram dados)
    expect(sql.replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT)/g, "")).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/"Job"/);
  });

  it("garante no banco o valor, as partes, a decisão e uma pendente / uma aceita por conversa", () => {
    for (const name of ["Proposal_amount_range_chk", "Proposal_parties_differ_chk", "Proposal_decision_consistency_chk"]) {
      expect(sql).toContain(name);
    }
    expect(sql).toMatch(/UNIQUE INDEX "Proposal_one_pending_per_conversation_idx"[^;]*WHERE "status" = 'PENDING'/);
    expect(sql).toMatch(/UNIQUE INDEX "Proposal_one_accepted_per_conversation_idx"[^;]*WHERE "status" = 'ACCEPTED'/);
    expect(sql).toContain('"amountCents" > 0 AND "amountCents" <= 99999999');
  });

  it("o schema do Prisma tem o modelo, os estados e a relação com a conversa", () => {
    const schemaText = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schemaText).toMatch(/model Proposal \{/);
    expect(schemaText).toMatch(/enum ProposalStatus \{\s*PENDING[^}]*ACCEPTED[^}]*DECLINED[^}]*WITHDRAWN/);
    expect(schemaText).toMatch(/conversation\s+Conversation\s+@relation\(fields: \[conversationId\], references: \[id\], onDelete: Cascade\)/);
  });
});

describe("migração dos campos de perfil", () => {
  const profile = readFileSync(new URL("../prisma/migrations/20261018020000_profile_fields/migration.sql", import.meta.url), "utf8");
  const sql = profile.replace(/--.*$/gm, "");

  it("só acrescenta ocupação e apresentação opcionais em User, sem apagar nem alterar dados", () => {
    expect(sql).toContain('ALTER TABLE "User" ADD COLUMN "headline" TEXT');
    expect(sql).toContain('ADD COLUMN "bio" TEXT');
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/"phone"|"email"/);
  });

  it("limita o tamanho no banco e o schema do Prisma tem os dois campos opcionais", () => {
    expect(sql).toContain("User_headline_len_chk");
    expect(sql).toContain('char_length("headline") <= 80');
    expect(sql).toContain("User_bio_len_chk");
    expect(sql).toContain('char_length("bio") <= 600');
    const schemaText = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schemaText).toMatch(/headline\s+String\?/);
    expect(schemaText).toMatch(/bio\s+String\?/);
  });
});
