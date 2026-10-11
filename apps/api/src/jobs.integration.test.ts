import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  categoriesResponseSchema,
  jobDetailSchema,
  jobsResponseSchema,
  type JobSummary,
} from "@freelah/shared";
import { createApp } from "./app";
import { createAuth } from "./auth";
import type { PrismaClient } from "./db";
import type { JobStatus } from "./generated/prisma/client";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./test-support";

const ORIGIN = "http://localhost:8081";
const config = {
  NODE_ENV: "test" as const,
  CORS_ORIGINS: [ORIGIN],
  BETTER_AUTH_SECRET: "segredo-so-para-testes-com-mais-de-32-caracteres",
  BETTER_AUTH_URL: "http://localhost:3333",
  TRUSTED_ORIGINS: [ORIGIN, "freelah://"],
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OWNER_PHONE = "32988887777";
const OWNER_EMAIL = "contratante.privado@exemplo.com";

describe.skipIf(!testDatabaseUrl)("categorias e oportunidades públicas (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let ownerId: string;
  let construction: { id: string; slug: string };
  let teaching: { id: string; slug: string };
  let counter = 0;

  beforeAll(() => {
    prisma = connectTestDatabase();
    app = createApp(config, createAuth(config, prisma), prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    counter = 0;
    const owner = await prisma.user.create({
      data: {
        id: "owner-1",
        name: "Marta Contratante",
        email: OWNER_EMAIL,
        phone: OWNER_PHONE,
        city: "Leopoldina",
        adultConfirmedAt: new Date(),
        isDemo: true,
      },
    });
    ownerId = owner.id;
    construction = await prisma.category.create({
      data: { slug: "construcao-civil", name: "Construção Civil" },
      select: { id: true, slug: true },
    });
    teaching = await prisma.category.create({
      data: { slug: "aulas-particulares", name: "Aulas Particulares" },
      select: { id: true, slug: true },
    });
  });

  interface JobOverrides {
    title?: string;
    description?: string;
    status?: JobStatus;
    city?: string;
    priceCents?: number;
    categoryId?: string;
    publishedAt?: Date | null;
    expiresAt?: Date;
    additionalInfo?: string | null;
  }

  async function makeJob(o: JobOverrides = {}) {
    counter += 1;
    const wantsHiring = o.status === "HIRED" || o.status === "COMPLETED";
    const job = await prisma.job.create({
      data: {
        title: o.title ?? `Oportunidade ${counter}`,
        description: o.description ?? `Descrição da oportunidade ${counter}`,
        additionalInfo: o.additionalInfo ?? null,
        categoryId: o.categoryId ?? construction.id,
        ownerId,
        city: o.city ?? "Cataguases",
        state: "MG",
        scheduledDate: new Date("2026-12-12T00:00:00Z"),
        startTime: "08:00",
        proposedPriceCents: o.priceCents ?? 20000,
        negotiable: true,
        isDemo: true,
        status: wantsHiring ? "PUBLISHED" : (o.status ?? "PUBLISHED"),
        publishedAt: o.publishedAt === undefined ? new Date(Date.now() - counter * HOUR) : o.publishedAt,
        expiresAt: o.expiresAt ?? new Date(Date.now() + 30 * DAY),
      },
    });
    if (!wantsHiring) return job;
    // O banco exige trabalhador selecionado para contratada/concluída (CHECK de coerência).
    const worker = await prisma.user.create({
      data: {
        id: `worker-${counter}`,
        name: "Trabalhador",
        email: `trabalhador${counter}@exemplo.com`,
        phone: "32977770000",
        city: "Cataguases",
        adultConfirmedAt: new Date(),
      },
    });
    const interest = await prisma.interest.create({ data: { jobId: job.id, workerId: worker.id } });
    return prisma.job.update({
      where: { id: job.id },
      data: {
        status: o.status,
        selectedInterestId: interest.id,
        hiredAt: new Date(),
        completedAt: o.status === "COMPLETED" ? new Date() : null,
      },
    });
  }

  async function list(query = "") {
    const res = await request(app).get(`/jobs${query}`);
    return res;
  }
  const titles = (jobs: JobSummary[]) => jobs.map((j) => j.title);

  describe("GET /categories", () => {
    it("é público, só traz categorias ativas, em ordem alfabética, sem cache", async () => {
      await prisma.category.create({ data: { slug: "antiga", name: "Antiga", active: false } });
      const res = await request(app).get("/categories");
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      const body = categoriesResponseSchema.parse(res.body);
      expect(body.categories.map((c) => c.slug)).toEqual(["aulas-particulares", "construcao-civil"]);
      expect(Object.keys(body.categories[0]!).sort()).toEqual(["id", "name", "slug"]);
    });

    it("lista vazia é uma resposta válida (não é erro)", async () => {
      await truncateAll(prisma);
      const res = await request(app).get("/categories");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ categories: [] });
    });
  });

  describe("GET /jobs: o que aparece", () => {
    it("mostra só oportunidades abertas e dentro do prazo, sem login", async () => {
      await makeJob({ title: "Aberta" });
      await makeJob({ title: "Em negociação", status: "NEGOTIATING" });
      await makeJob({ title: "Rascunho", status: "DRAFT" });
      await makeJob({ title: "Cancelada", status: "CANCELLED" });
      await makeJob({ title: "Contratada", status: "HIRED" });
      await makeJob({ title: "Concluída", status: "COMPLETED" });
      await makeJob({ title: "Marcada expirada", status: "EXPIRED" });
      await makeJob({ title: "Prazo vencido", expiresAt: new Date(Date.now() - HOUR) });
      await makeJob({ title: "Sem data de publicação", publishedAt: null });
      const inactive = await prisma.category.create({
        data: { slug: "inativa", name: "Inativa", active: false },
      });
      await makeJob({ title: "Categoria inativa", categoryId: inactive.id });

      const res = await list();
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      const body = jobsResponseSchema.parse(res.body);
      expect(titles(body.jobs).sort()).toEqual(["Aberta", "Em negociação"]);
      expect(body.nextCursor).toBeNull();
    });

    it("ordena da publicação mais recente para a mais antiga", async () => {
      await makeJob({ title: "Antiga", publishedAt: new Date(Date.now() - 5 * DAY) });
      await makeJob({ title: "Nova", publishedAt: new Date(Date.now() - HOUR) });
      await makeJob({ title: "Média", publishedAt: new Date(Date.now() - DAY) });
      const body = jobsResponseSchema.parse((await list()).body);
      expect(titles(body.jobs)).toEqual(["Nova", "Média", "Antiga"]);
    });

    it("devolve os campos do cartão e nenhum dado privado do contratante", async () => {
      await makeJob({
        title: "Pintura de sala",
        description: "Preciso pintar uma sala de 20 m².",
        priceCents: 20000,
      });
      const res = await list();
      const [job] = jobsResponseSchema.parse(res.body).jobs;
      expect(job).toMatchObject({
        title: "Pintura de sala",
        excerpt: "Preciso pintar uma sala de 20 m².",
        category: { slug: "construcao-civil", name: "Construção Civil" },
        city: "Cataguases",
        state: "MG",
        scheduledDate: "2026-12-12",
        startTime: "08:00",
        proposedPriceCents: 20000,
        negotiable: true,
        status: "PUBLISHED",
        isDemo: true,
      });
      const raw = JSON.stringify(res.body);
      for (const secret of [OWNER_PHONE, OWNER_EMAIL, ownerId, "Marta"]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("lista vazia é 200 com jobs [] e nextCursor null", async () => {
      const res = await list();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ jobs: [], nextCursor: null });
    });
  });

  describe("GET /jobs: paginação por cursor", () => {
    it("percorre tudo uma vez só, mesmo com a mesma data de publicação", async () => {
      const same = new Date(Date.now() - DAY);
      const created = [];
      for (let i = 0; i < 7; i++) created.push(await makeJob({ title: `Igual ${i}`, publishedAt: same }));
      const ids: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res = await list(`?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        expect(res.status).toBe(200);
        const body = jobsResponseSchema.parse(res.body);
        ids.push(...body.jobs.map((j) => j.id));
        cursor = body.nextCursor;
        pages += 1;
        expect(pages).toBeLessThan(10);
      } while (cursor);
      expect(pages).toBe(3);
      expect(new Set(ids).size).toBe(7);
      expect([...ids]).toEqual(created.map((j) => j.id).sort().reverse()); // ordem estável por id
    });

    it("mistura datas iguais e diferentes sem repetir nem pular", async () => {
      const t1 = new Date(Date.now() - 3 * DAY);
      const t2 = new Date(Date.now() - 2 * DAY);
      for (let i = 0; i < 3; i++) await makeJob({ publishedAt: t1 });
      for (let i = 0; i < 3; i++) await makeJob({ publishedAt: t2 });
      await makeJob({ publishedAt: new Date(Date.now() - HOUR) });
      const full = jobsResponseSchema.parse((await list("?limit=50")).body).jobs.map((j) => j.id);
      const paged: string[] = [];
      let cursor: string | null = null;
      do {
        const body = jobsResponseSchema.parse(
          (await list(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)).body,
        );
        paged.push(...body.jobs.map((j) => j.id));
        cursor = body.nextCursor;
      } while (cursor);
      expect(paged).toEqual(full);
      expect(full).toHaveLength(7);
    });

    it("uma publicação nova no meio do caminho não repete nem tira itens da próxima página", async () => {
      for (let i = 0; i < 4; i++) await makeJob({ publishedAt: new Date(Date.now() - (i + 2) * DAY) });
      const first = jobsResponseSchema.parse((await list("?limit=2")).body);
      await makeJob({ title: "Chegou agora", publishedAt: new Date() });
      const second = jobsResponseSchema.parse(
        (await list(`?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`)).body,
      );
      const seen = [...first.jobs, ...second.jobs].map((j) => j.id);
      expect(new Set(seen).size).toBe(4);
      expect(second.jobs.map((j) => j.title)).not.toContain("Chegou agora");
    });

    it("a última página não tem cursor, e página exata também não", async () => {
      for (let i = 0; i < 4; i++) await makeJob();
      const exact = jobsResponseSchema.parse((await list("?limit=4")).body);
      expect(exact.jobs).toHaveLength(4);
      expect(exact.nextCursor).toBeNull();
      const part = jobsResponseSchema.parse((await list("?limit=3")).body);
      expect(part.nextCursor).not.toBeNull();
      const rest = jobsResponseSchema.parse(
        (await list(`?limit=3&cursor=${encodeURIComponent(part.nextCursor!)}`)).body,
      );
      expect(rest.jobs).toHaveLength(1);
      expect(rest.nextCursor).toBeNull();
    });

    it("o cursor respeita os filtros da página seguinte", async () => {
      for (let i = 0; i < 3; i++) await makeJob({ title: `Obra ${i}`, categoryId: construction.id });
      for (let i = 0; i < 3; i++) await makeJob({ title: `Aula ${i}`, categoryId: teaching.id });
      const first = jobsResponseSchema.parse((await list(`?category=${teaching.slug}&limit=2`)).body);
      const second = jobsResponseSchema.parse(
        (await list(`?category=${teaching.slug}&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`)).body,
      );
      expect([...first.jobs, ...second.jobs].every((j) => j.title.startsWith("Aula"))).toBe(true);
      expect(first.jobs.length + second.jobs.length).toBe(3);
    });
  });

  describe("GET /jobs: busca e filtros", () => {
    beforeEach(async () => {
      await makeJob({
        title: "Pintura de sala",
        description: "Pintar uma sala de 20 m² com tinta fornecida.",
        city: "Cataguases",
        priceCents: 20000,
        categoryId: construction.id,
      });
      await makeJob({
        title: "Reforço de matemática",
        description: "Aulas para aluno do 9º ano.",
        city: "Leopoldina",
        priceCents: 6000,
        categoryId: teaching.id,
      });
      await makeJob({
        title: "Reparo no telhado",
        description: "Trocar telhas quebradas após a chuva.",
        city: "Cataguases",
        priceCents: 45000,
        categoryId: construction.id,
      });
    });

    it("busca por título, ignorando maiúsculas", async () => {
      expect(titles(jobsResponseSchema.parse((await list("?q=PINTURA")).body).jobs)).toEqual([
        "Pintura de sala",
      ]);
    });

    it("busca na descrição", async () => {
      expect(titles(jobsResponseSchema.parse((await list("?q=telhas")).body).jobs)).toEqual([
        "Reparo no telhado",
      ]);
    });

    it("busca pelo nome da categoria", async () => {
      expect(titles(jobsResponseSchema.parse((await list("?q=particulares")).body).jobs)).toEqual([
        "Reforço de matemática",
      ]);
    });

    it("várias palavras: todas precisam aparecer", async () => {
      expect(titles(jobsResponseSchema.parse((await list("?q=pintar%20tinta")).body).jobs)).toEqual([
        "Pintura de sala",
      ]);
      expect(jobsResponseSchema.parse((await list("?q=pintura%20matem%C3%A1tica")).body).jobs).toEqual([]);
    });

    it("% e _ são texto comum, não curingas", async () => {
      expect(jobsResponseSchema.parse((await list("?q=%25")).body).jobs).toEqual([]);
      expect(jobsResponseSchema.parse((await list("?q=_")).body).jobs).toEqual([]);
    });

    it("% _ e \\ digitados são encontrados como texto literal", async () => {
      await makeJob({ title: "Desconto de 50% hoje", description: "Código a_b e pasta C:\\obra." });
      await makeJob({ title: "Código axb sem sublinhado", description: "Sem caracteres especiais." });
      const find = async (q: string) =>
        titles(jobsResponseSchema.parse((await list(`?q=${encodeURIComponent(q)}`)).body).jobs);
      expect(await find("50%")).toEqual(["Desconto de 50% hoje"]);
      expect(await find("%")).toEqual(["Desconto de 50% hoje"]);
      expect(await find("a_b")).toEqual(["Desconto de 50% hoje"]); // não casa com "axb"
      expect(await find("C:\\obra")).toEqual(["Desconto de 50% hoje"]);
      expect(await find("\\")).toEqual(["Desconto de 50% hoje"]);
    });

    it("texto com aspas e SQL é tratado como texto e não quebra nada", async () => {
      const res = await list(`?q=${encodeURIComponent("'; DROP TABLE \"Job\"; --")}`);
      expect(res.status).toBe(200);
      expect(res.body.jobs).toEqual([]);
      expect(await prisma.job.count()).toBe(3);
    });

    it("filtra por categoria", async () => {
      const body = jobsResponseSchema.parse((await list(`?category=${teaching.slug}`)).body);
      expect(titles(body.jobs)).toEqual(["Reforço de matemática"]);
    });

    it("categoria desconhecida devolve lista vazia", async () => {
      expect((await list("?category=nao-existe")).body).toEqual({ jobs: [], nextCursor: null });
    });

    it("filtra por cidade (parte do nome, sem diferenciar maiúsculas)", async () => {
      expect(
        jobsResponseSchema.parse((await list("?city=leopold")).body).jobs.map((j) => j.city),
      ).toEqual(["Leopoldina"]);
      expect(jobsResponseSchema.parse((await list("?city=CATAGUASES")).body).jobs).toHaveLength(2);
    });

    it("filtra por faixa de valor, com limites incluídos", async () => {
      expect(titles(jobsResponseSchema.parse((await list("?minPriceCents=20000")).body).jobs).sort()).toEqual(
        ["Pintura de sala", "Reparo no telhado"],
      );
      expect(titles(jobsResponseSchema.parse((await list("?maxPriceCents=6000")).body).jobs)).toEqual([
        "Reforço de matemática",
      ]);
      expect(
        titles(jobsResponseSchema.parse((await list("?minPriceCents=6000&maxPriceCents=20000")).body).jobs).sort(),
      ).toEqual(["Pintura de sala", "Reforço de matemática"]);
    });

    it("combina busca, categoria, cidade e valor", async () => {
      const q = `?q=telhado&category=${construction.slug}&city=cataguases&minPriceCents=40000&maxPriceCents=50000`;
      expect(titles(jobsResponseSchema.parse((await list(q)).body).jobs)).toEqual(["Reparo no telhado"]);
      // trocando qualquer um dos filtros por um que não combina, o resultado some
      const none = `?q=telhado&category=${teaching.slug}&city=cataguases&minPriceCents=40000`;
      expect(jobsResponseSchema.parse((await list(none)).body).jobs).toEqual([]);
    });

    it("filtros vazios são ignorados", async () => {
      expect(jobsResponseSchema.parse((await list("?q=&category=&city=&limit=")).body).jobs).toHaveLength(3);
    });

    it("os filtros nunca fazem aparecer oportunidade que não está aberta", async () => {
      await makeJob({ title: "Pintura cancelada", status: "CANCELLED" });
      await makeJob({ title: "Pintura vencida", expiresAt: new Date(Date.now() - HOUR) });
      expect(titles(jobsResponseSchema.parse((await list("?q=pintura")).body).jobs)).toEqual([
        "Pintura de sala",
      ]);
    });
  });

  describe("GET /jobs: parâmetros inválidos", () => {
    it.each([
      ["limite zero", "?limit=0"],
      ["limite acima do máximo", "?limit=51"],
      ["limite não numérico", "?limit=abc"],
      ["valor negativo", "?minPriceCents=-1"],
      ["valor decimal", "?maxPriceCents=1.5"],
      ["mínimo maior que máximo", "?minPriceCents=500&maxPriceCents=100"],
      ["categoria com caracteres inválidos", "?category=Constru%C3%A7%C3%A3o"],
      ["busca repetida", "?q=a&q=b"],
      ["busca longa demais", `?q=${"x".repeat(101)}`],
      ["cursor aleatório", "?cursor=lixo"],
      ["cursor com formato errado", `?cursor=${Buffer.from('{"p":"x","i":"y"}').toString("base64url")}`],
      ["cursor de outro tipo", `?cursor=${Buffer.from("[1,2]").toString("base64url")}`],
    ])("%s => 400 em português", async (_name, query) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/validation_error|invalid_cursor/);
      expect(res.body.message).toMatch(/válid/);
    });
  });

  describe("GET /jobs/:id", () => {
    it("detalhe público com o contratante apenas por nome e cidade", async () => {
      const job = await makeJob({
        title: "Pintura de sala",
        description: "Descrição completa da pintura.",
        additionalInfo: "Levar escada.",
      });
      const res = await request(app).get(`/jobs/${job.id}`);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      const body = jobDetailSchema.parse(res.body);
      expect(body).toMatchObject({
        id: job.id,
        description: "Descrição completa da pintura.",
        additionalInfo: "Levar escada.",
        status: "PUBLISHED",
        acceptingInterests: true,
        statusMessage: null,
        owner: { name: "Marta Contratante", city: "Leopoldina", isDemo: true },
      });
      expect(Object.keys(res.body.owner).sort()).toEqual(["city", "isDemo", "name"]);
      const raw = JSON.stringify(res.body);
      for (const secret of [OWNER_PHONE, OWNER_EMAIL, ownerId]) expect(raw).not.toContain(secret);
    });

    it("em negociação ainda aceita interessados, com aviso", async () => {
      const job = await makeJob({ status: "NEGOTIATING" });
      const body = jobDetailSchema.parse((await request(app).get(`/jobs/${job.id}`)).body);
      expect(body.status).toBe("NEGOTIATING");
      expect(body.acceptingInterests).toBe(true);
      expect(body.statusMessage).toMatch(/negociação/i);
    });

    it.each([
      ["HIRED", /contratada/i],
      ["COMPLETED", /conclu/i],
      ["CANCELLED", /cancelou/i],
      ["EXPIRED", /prazo/i],
    ] as const)("%s continua acessível, não aceita interessados e explica o motivo", async (status, message) => {
      const job = await makeJob({ status });
      const res = await request(app).get(`/jobs/${job.id}`);
      expect(res.status).toBe(200);
      const body = jobDetailSchema.parse(res.body);
      expect(body.status).toBe(status);
      expect(body.acceptingInterests).toBe(false);
      expect(body.statusMessage).toMatch(message);
    });

    it("publicada com prazo vencido aparece como expirada", async () => {
      const job = await makeJob({ expiresAt: new Date(Date.now() - HOUR) });
      const body = jobDetailSchema.parse((await request(app).get(`/jobs/${job.id}`)).body);
      expect(body.status).toBe("EXPIRED");
      expect(body.acceptingInterests).toBe(false);
    });

    it("rascunho, id inexistente e id malformado são 404", async () => {
      const draft = await makeJob({ status: "DRAFT" });
      for (const id of [draft.id, "019a0000-0000-7000-8000-000000000000", "abc", "1; DROP TABLE"]) {
        const res = await request(app).get(`/jobs/${encodeURIComponent(id)}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe("not_found");
      }
    });
  });
});
