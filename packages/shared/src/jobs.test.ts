import { describe, expect, it } from "vitest";
import {
  JOBS_MAX_LIMIT,
  buildJobsQueryString,
  describeJobAvailability,
  effectiveJobStatus,
  formatJobDate,
  formatPriceCents,
  jobDetailSchema,
  jobsQuerySchema,
  jobsResponseSchema,
  makeExcerpt,
  parseReaisToCents,
  publicJobStatusSchema,
} from "./jobs";

describe("jobsQuerySchema", () => {
  it("aceita consulta vazia", () => {
    expect(jobsQuerySchema.parse({})).toEqual({});
  });

  it("converte e normaliza os filtros", () => {
    expect(
      jobsQuerySchema.parse({
        q: "  pintura ",
        category: "construcao-civil",
        city: " Cataguases ",
        minPriceCents: "10000",
        maxPriceCents: "30000",
        limit: "10",
        cursor: "abc",
      }),
    ).toEqual({
      q: "pintura",
      category: "construcao-civil",
      city: "Cataguases",
      minPriceCents: 10000,
      maxPriceCents: 30000,
      limit: 10,
      cursor: "abc",
    });
  });

  it("trata campos vazios como não informados (formulário sem preencher)", () => {
    expect(
      jobsQuerySchema.parse({ q: "", category: " ", city: "", minPriceCents: "", limit: "" }),
    ).toEqual({});
  });

  it("aceita valor 0", () => {
    expect(jobsQuerySchema.parse({ minPriceCents: "0" })).toEqual({ minPriceCents: 0 });
  });

  it.each([
    ["limite zero", { limit: "0" }],
    ["limite acima do máximo", { limit: String(JOBS_MAX_LIMIT + 1) }],
    ["limite decimal", { limit: "2.5" }],
    ["limite negativo", { limit: "-1" }],
    ["valor com letras", { minPriceCents: "abc" }],
    ["valor com notação científica", { maxPriceCents: "1e3" }],
    ["valor negativo", { minPriceCents: "-5" }],
    ["valor enorme", { maxPriceCents: "9999999999" }],
    ["categoria com maiúsculas", { category: "Construcao" }],
    ["categoria com caracteres perigosos", { category: "a;drop" }],
    ["busca repetida (array)", { q: ["a", "b"] }],
    ["busca longa demais", { q: "x".repeat(101) }],
    ["mínimo maior que máximo", { minPriceCents: "500", maxPriceCents: "100" }],
  ])("recusa %s", (_name, query) => {
    expect(jobsQuerySchema.safeParse(query).success).toBe(false);
  });

  it("aceita mínimo igual ao máximo", () => {
    expect(jobsQuerySchema.safeParse({ minPriceCents: "100", maxPriceCents: "100" }).success).toBe(
      true,
    );
  });
});

describe("buildJobsQueryString", () => {
  it("omite vazios e codifica os valores", () => {
    expect(buildJobsQueryString({})).toBe("");
    expect(buildJobsQueryString({ q: "  ", city: "" })).toBe("");
    expect(buildJobsQueryString({ q: "pintar sala & muro", minPriceCents: 0, limit: 10 })).toBe(
      "?q=pintar%20sala%20%26%20muro&minPriceCents=0&limit=10",
    );
  });

  it("gera uma consulta que o schema aceita de volta", () => {
    const qs = buildJobsQueryString({ q: "aula", category: "aulas-particulares", maxPriceCents: 5000 });
    const parsed = jobsQuerySchema.parse(Object.fromEntries(qs.slice(1).split("&").map((p) => p.split("=").map(decodeURIComponent))));
    expect(parsed).toEqual({ q: "aula", category: "aulas-particulares", maxPriceCents: 5000 });
  });
});

describe("estado da oportunidade", () => {
  const future = new Date("2026-10-20T00:00:00Z");
  const past = new Date("2026-10-01T00:00:00Z");
  const now = new Date("2026-10-11T12:00:00Z");

  it("aberta com prazo vencido vira expirada", () => {
    expect(effectiveJobStatus("PUBLISHED", past, now)).toBe("EXPIRED");
    expect(effectiveJobStatus("NEGOTIATING", past, now)).toBe("EXPIRED");
  });

  it("aberta dentro do prazo continua como está; prazo igual a agora já venceu", () => {
    expect(effectiveJobStatus("PUBLISHED", future, now)).toBe("PUBLISHED");
    expect(effectiveJobStatus("NEGOTIATING", future, now)).toBe("NEGOTIATING");
    expect(effectiveJobStatus("PUBLISHED", now, now)).toBe("EXPIRED");
  });

  it("estados finais não mudam, mesmo com prazo vencido", () => {
    for (const status of ["HIRED", "COMPLETED", "CANCELLED", "EXPIRED"] as const) {
      expect(effectiveJobStatus(status, past, now)).toBe(status);
    }
  });

  it("só publicada e em negociação aceitam interessados; os demais explicam o motivo", () => {
    for (const status of publicJobStatusSchema.options) {
      const a = describeJobAvailability(status);
      const open = status === "PUBLISHED" || status === "NEGOTIATING";
      expect(a.acceptingInterests).toBe(open);
      if (!open) expect(a.message).toMatch(/\S/);
    }
    expect(describeJobAvailability("PUBLISHED").message).toBeNull();
  });
});

describe("formatadores", () => {
  it.each([
    [0, "R$ 0,00"],
    [5, "R$ 0,05"],
    [20000, "R$ 200,00"],
    [123456, "R$ 1.234,56"],
    [100000000, "R$ 1.000.000,00"],
  ])("formatPriceCents(%i)", (cents, expected) => {
    expect(formatPriceCents(cents)).toBe(expected);
  });

  it("formatJobDate", () => {
    expect(formatJobDate("2026-09-12")).toBe("12/09/2026");
    expect(formatJobDate("lixo")).toBe("lixo");
  });

  it("makeExcerpt não corta palavras nem passa do limite", () => {
    expect(makeExcerpt("Texto curto.")).toBe("Texto curto.");
    const long = "palavra ".repeat(60);
    const excerpt = makeExcerpt(long, 50);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.endsWith("palavra…")).toBe(true);
    expect(makeExcerpt("linha 1\n\n   linha 2")).toBe("linha 1 linha 2");
  });

  it.each([
    ["200", 20000],
    ["200,5", 20050],
    ["10.50", 1050],
    ["R$ 99,99", 9999],
    ["0", 0],
  ])("parseReaisToCents(%s)", (input, expected) => {
    expect(parseReaisToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-1", "1,234", "1e3", "10,"])("parseReaisToCents recusa %j", (input) => {
    expect(parseReaisToCents(input)).toBeNull();
  });
});

describe("respostas", () => {
  const summary = {
    id: "1",
    title: "Pintura de sala",
    excerpt: "Preciso de alguém",
    category: { slug: "construcao-civil", name: "Construção Civil" },
    city: "Cataguases",
    state: "MG",
    scheduledDate: "2026-09-12",
    startTime: "08:00",
    proposedPriceCents: 20000,
    negotiable: true,
    status: "PUBLISHED",
    isDemo: true,
    publishedAt: "2026-09-01T10:00:00.000Z",
  };

  it("lista", () => {
    expect(jobsResponseSchema.safeParse({ jobs: [summary], nextCursor: null }).success).toBe(true);
    expect(jobsResponseSchema.safeParse({ jobs: [{ ...summary, status: "DRAFT" }], nextCursor: null }).success).toBe(false);
    expect(jobsResponseSchema.safeParse({ jobs: [{ ...summary, scheduledDate: "12/09" }], nextCursor: null }).success).toBe(false);
  });

  it("detalhe exige o contratante só com nome e cidade", () => {
    const detail = {
      ...summary,
      description: "Descrição completa",
      additionalInfo: null,
      expiresAt: "2026-10-01T00:00:00.000Z",
      owner: { name: "Ana", city: "Cataguases", isDemo: true },
      acceptingInterests: true,
      statusMessage: null,
    };
    const parsed = jobDetailSchema.parse({
      ...detail,
      owner: { ...detail.owner, phone: "32999990000", email: "a@b.c" },
    });
    expect(parsed.owner).toEqual({ name: "Ana", city: "Cataguases", isDemo: true });
  });
});
