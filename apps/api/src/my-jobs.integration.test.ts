import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { jobDetailSchema, jobsResponseSchema, ownJobResponseSchema, ownJobsResponseSchema } from "@freelah/shared";
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
const PHONE = "32999990000";
type Agent = ReturnType<typeof request.agent>;

/** "AAAA-MM-DD" no horário de Brasília (UTC-3) de um instante. */
const brasiliaDay = (ms: number) => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);

describe.skipIf(!testDatabaseUrl)("minhas oportunidades: criar, editar, publicar e cancelar (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let category: { id: string; slug: string };
  let inactive: { id: string };
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
    category = await prisma.category.create({
      data: { slug: "construcao-civil", name: "Construção Civil" },
      select: { id: true, slug: true },
    });
    inactive = await prisma.category.create({
      data: { slug: "antiga", name: "Antiga", active: false },
      select: { id: true },
    });
  });

  /** Cria uma conta de verdade e devolve um agente HTTP já com a sessão (cookie). */
  async function signUp(name = "Pessoa"): Promise<{ agent: Agent; id: string; email: string }> {
    counter += 1;
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `${name} ${counter}`,
      email: `pessoa${counter}@exemplo.com`,
      password: "senha-segura-123",
      phone: PHONE,
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, id: res.body.user.id as string, email: `pessoa${counter}@exemplo.com` };
  }

  /** Corpo válido: serviço daqui a 10 dias às 08:00 e prazo um dia antes. */
  function body(overrides: Record<string, unknown> = {}) {
    const service = Date.now() + 10 * DAY;
    return {
      title: "Pintura de sala",
      description: "Preciso pintar uma sala de aproximadamente 20 m².",
      categoryId: category.id,
      city: "Cataguases",
      state: "MG",
      scheduledDate: brasiliaDay(service),
      startTime: "08:00",
      proposedPriceCents: 20000,
      negotiable: true,
      expiresAt: new Date(service - DAY).toISOString(),
      ...overrides,
    };
  }

  const post = (agent: Agent, path: string, payload?: unknown) =>
    agent.post(path).set("Origin", ORIGIN).send((payload ?? {}) as object);
  const patch = (agent: Agent, id: string, payload: unknown) =>
    agent.patch(`/me/jobs/${id}`).set("Origin", ORIGIN).send(payload as object);

  async function createJob(agent: Agent, overrides: Record<string, unknown> = {}) {
    const res = await post(agent, "/me/jobs", body(overrides));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.job as { id: string; status: string; updatedAt: string };
  }

  /** Linha direta no banco, para estados que a API (ainda) não produz sozinha. */
  async function insertJob(ownerId: string, status: JobStatus, over: { expiresAt?: Date; publishedAt?: Date | null } = {}) {
    const hired = status === "HIRED" || status === "COMPLETED";
    const job = await prisma.job.create({
      data: {
        title: "Linha direta",
        description: "Criada direto no banco para o teste.",
        categoryId: category.id,
        ownerId,
        city: "Muriaé",
        state: "MG",
        scheduledDate: new Date("2030-01-10T00:00:00.000Z"),
        startTime: "08:00",
        proposedPriceCents: 10000,
        expiresAt: over.expiresAt ?? new Date(Date.now() + 5 * DAY),
        status: hired ? "PUBLISHED" : status,
        publishedAt: over.publishedAt === undefined ? (status === "DRAFT" ? null : new Date()) : over.publishedAt,
      },
    });
    if (!hired) return job;
    // O banco exige um trabalhador selecionado para contratada/concluída (CHECK de coerência).
    counter += 1;
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
        status,
        selectedInterestId: interest.id,
        hiredAt: new Date(),
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
    });
  }

  // =========================================================================
  describe("autenticação", () => {
    const routes: [string, string][] = [
      ["post", "/me/jobs"],
      ["get", "/me/jobs"],
      ["get", "/me/jobs/01990000-0000-7000-8000-000000000001"],
      ["patch", "/me/jobs/01990000-0000-7000-8000-000000000001"],
      ["post", "/me/jobs/01990000-0000-7000-8000-000000000001/publish"],
      ["post", "/me/jobs/01990000-0000-7000-8000-000000000001/cancel"],
    ];

    it.each(routes)("%s %s exige sessão (401) e não grava nada", async (method, path) => {
      const agent = request(app) as unknown as Record<string, (p: string) => request.Test>;
      const res = await agent[method]!(path).send(body());
      expect(res.status).toBe(401);
      expect(await prisma.job.count()).toBe(0);
    });

    it("recusa cookie de sessão inventado", async () => {
      const res = await request(app)
        .post("/me/jobs")
        .set("Cookie", "better-auth.session_token=invalido.invalido")
        .send(body());
      expect(res.status).toBe(401);
      expect(await prisma.job.count()).toBe(0);
    });

    it("as respostas não podem ser guardadas em cache", async () => {
      const { agent } = await signUp();
      expect((await agent.get("/me/jobs")).headers["cache-control"]).toBe("no-store");
    });
  });

  // =========================================================================
  describe("criar", () => {
    it("salva como rascunho por padrão, com o dono vindo da sessão", async () => {
      const { agent, id } = await signUp();
      const res = await post(agent, "/me/jobs", body());
      expect(res.status).toBe(201);
      expect(ownJobResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.job).toMatchObject({
        status: "DRAFT",
        publishedAt: null,
        isDemo: false,
        title: "Pintura de sala",
        state: "MG",
        canEdit: true,
        canPublish: true,
        canCancel: true,
      });
      const row = await prisma.job.findUniqueOrThrow({ where: { id: res.body.job.id } });
      expect(row.ownerId).toBe(id);
      expect(row.isDemo).toBe(false);
    });

    it("publish:true cria já publicada e ela aparece na exploração pública", async () => {
      const { agent } = await signUp();
      const res = await post(agent, "/me/jobs", body({ publish: true, title: "Capina de quintal" }));
      expect(res.status).toBe(201);
      expect(res.body.job.status).toBe("PUBLISHED");
      expect(res.body.job.publishedAt).toEqual(expect.any(String));

      const list = await request(app).get("/jobs");
      expect(jobsResponseSchema.safeParse(list.body).success).toBe(true);
      expect(list.body.jobs.map((j: { id: string }) => j.id)).toEqual([res.body.job.id]);
      expect((await request(app).get(`/jobs?q=capina`)).body.jobs).toHaveLength(1);
      expect((await request(app).get(`/jobs?category=${category.slug}&city=cataguases`)).body.jobs).toHaveLength(1);
      expect((await request(app).get(`/jobs?minPriceCents=30000`)).body.jobs).toHaveLength(0);
      const detail = await request(app).get(`/jobs/${res.body.job.id}`);
      expect(detail.status).toBe(200);
      expect(jobDetailSchema.safeParse(detail.body).success).toBe(true);
      expect(detail.body.status).toBe("PUBLISHED");
      expect(detail.body.isDemo).toBe(false);
    });

    it("o rascunho não aparece na exploração pública, mas aparece para o dono", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      expect((await request(app).get("/jobs")).body.jobs).toHaveLength(0);
      expect((await request(app).get(`/jobs/${job.id}`)).status).toBe(404);
      const mine = await agent.get("/me/jobs");
      expect(ownJobsResponseSchema.safeParse(mine.body).success).toBe(true);
      expect(mine.body.jobs.map((j: { id: string }) => j.id)).toEqual([job.id]);
    });

    it("normaliza os textos e guarda o estado em maiúsculas", async () => {
      const { agent } = await signUp();
      const res = await post(agent, "/me/jobs", body({ title: "  Pintura   de   sala ", state: "mg", additionalInfo: "  " }));
      expect(res.status).toBe(201);
      expect(res.body.job).toMatchObject({ title: "Pintura de sala", state: "MG", additionalInfo: null });
    });

    it("não deixa o cliente definir dono, estado, demonstração nem datas internas", async () => {
      const { agent } = await signUp();
      const other = await signUp("Outra");
      for (const extra of [
        { ownerId: other.id },
        { status: "PUBLISHED" },
        { isDemo: true },
        { publishedAt: new Date().toISOString() },
        { selectedInterestId: "x" },
      ]) {
        const res = await post(agent, "/me/jobs", body(extra));
        expect(res.status, JSON.stringify(extra)).toBe(400);
        expect(res.body.error).toBe("validation_error");
        expect(res.body.fields._).toMatch(/não permitido/);
      }
      expect(await prisma.job.count()).toBe(0);
    });

    it("devolve mensagens por campo para cada regra do PRD 15.4", async () => {
      const { agent } = await signUp();
      const cases: [Record<string, unknown>, string][] = [
        [{ title: "" }, "title"],
        [{ description: "curta" }, "description"],
        [{ proposedPriceCents: -1 }, "proposedPriceCents"],
        [{ proposedPriceCents: 10.5 }, "proposedPriceCents"],
        [{ state: "XX" }, "state"],
        [{ city: " " }, "city"],
        [{ categoryId: "nao-e-uuid" }, "categoryId"],
        [{ scheduledDate: "2026-02-30" }, "scheduledDate"],
        [{ scheduledDate: brasiliaDay(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - 3 * DAY).toISOString() }, "scheduledDate"],
        [{ startTime: "24:00" }, "startTime"],
        [{ expiresAt: "amanhã" }, "expiresAt"],
        [{ expiresAt: new Date(Date.now() - DAY).toISOString() }, "expiresAt"],
        [{ expiresAt: new Date(Date.now() + 11 * DAY).toISOString() }, "expiresAt"],
        [{ negotiable: "sim" }, "negotiable"],
        [{ publish: "sim" }, "publish"],
      ];
      for (const [override, field] of cases) {
        const res = await post(agent, "/me/jobs", body(override));
        expect(res.status, JSON.stringify(override)).toBe(400);
        expect(res.body.fields[field], JSON.stringify(res.body)).toEqual(expect.any(String));
      }
      expect(await prisma.job.count()).toBe(0);
    });

    it("exige cada campo obrigatório", async () => {
      const { agent } = await signUp();
      for (const field of ["title", "description", "categoryId", "city", "state", "scheduledDate", "startTime", "proposedPriceCents", "expiresAt"]) {
        const payload: Record<string, unknown> = body();
        delete payload[field];
        const res = await post(agent, "/me/jobs", payload);
        expect(res.status, field).toBe(400);
        expect(res.body.fields[field]).toEqual(expect.any(String));
      }
    });

    it("limita o prazo a 60 dias e a data do serviço", async () => {
      const { agent } = await signUp();
      const service = Date.now() + 90 * DAY;
      const farDeadline = await post(agent, "/me/jobs", body({ scheduledDate: brasiliaDay(service), expiresAt: new Date(Date.now() + 61 * DAY).toISOString() }));
      expect(farDeadline.status).toBe(400);
      expect(farDeadline.body.fields.expiresAt).toMatch(/60 dias/);
      const afterService = await post(agent, "/me/jobs", body({ expiresAt: new Date(Date.now() + 11 * DAY).toISOString() }));
      expect(afterService.body.fields.expiresAt).toMatch(/depois da data/);
      const ok = await post(agent, "/me/jobs", body({ scheduledDate: brasiliaDay(service), expiresAt: new Date(Date.now() + 59 * DAY).toISOString() }));
      expect(ok.status).toBe(201);
    });

    it("recusa categoria inexistente ou inativa", async () => {
      const { agent } = await signUp();
      for (const categoryId of [inactive.id, "01990000-0000-7000-8000-0000000000ff"]) {
        const res = await post(agent, "/me/jobs", body({ categoryId }));
        expect(res.status).toBe(400);
        expect(res.body.fields.categoryId).toEqual(expect.any(String));
      }
      expect(await prisma.job.count()).toBe(0);
    });

    it("aceita valor zero (a combinar)", async () => {
      const { agent } = await signUp();
      expect((await post(agent, "/me/jobs", body({ proposedPriceCents: 0 }))).status).toBe(201);
    });

    it("JSON malformado ou corpo que não é objeto é erro 400, nunca 500", async () => {
      const { agent } = await signUp();
      const malformed = await agent
        .post("/me/jobs")
        .set("Origin", ORIGIN)
        .set("Content-Type", "application/json")
        .send("{ isto não é json");
      expect(malformed.status).toBe(400);
      for (const payload of [[], "texto", null]) {
        const res = await agent.post("/me/jobs").set("Origin", ORIGIN).set("Content-Type", "application/json").send(JSON.stringify(payload));
        expect(res.status, JSON.stringify(payload)).toBe(400);
      }
      expect(await prisma.job.count()).toBe(0);
    });

    it("não vaza dados privados do dono nem de ninguém", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent, { publish: true });
      const text = JSON.stringify([(await agent.get("/me/jobs")).body, (await request(app).get(`/jobs/${job.id}`)).body]);
      expect(text).not.toContain(PHONE);
      expect(text).not.toMatch(/@exemplo\.com/);
    });

    it("preferências não são permissões: quem só escolheu 'Encontrar trabalho' também publica", async () => {
      const { agent } = await signUp();
      await agent.put("/me/preferences").set("Origin", ORIGIN).send({ wantsWork: true, wantsToHire: false });
      const res = await post(agent, "/me/jobs", body({ publish: true }));
      expect(res.status).toBe(201);
      expect(res.body.job.status).toBe("PUBLISHED");
    });
  });

  // =========================================================================
  describe("leitura privada", () => {
    it("lista só as oportunidades do próprio usuário, as mais novas primeiro", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const first = await createJob(a.agent, { title: "Primeira" });
      const second = await createJob(a.agent, { title: "Segunda", publish: true });
      await createJob(b.agent, { title: "Da outra pessoa" });
      const res = await a.agent.get("/me/jobs");
      expect(res.body.jobs.map((j: { id: string }) => j.id)).toEqual([second.id, first.id]);
      expect((await b.agent.get("/me/jobs")).body.jobs).toHaveLength(1);
    });

    it("abre o detalhe do próprio rascunho; o de outra pessoa é 404", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent);
      expect((await a.agent.get(`/me/jobs/${job.id}`)).status).toBe(200);
      const foreign = await b.agent.get(`/me/jobs/${job.id}`);
      expect(foreign.status).toBe(404);
      expect(JSON.stringify(foreign.body)).not.toContain("Pintura");
    });

    it("id malformado ou inexistente é 404", async () => {
      const { agent } = await signUp();
      for (const id of ["abc", "'; DROP TABLE \"Job\"; --", "01990000-0000-7000-8000-0000000000ff"]) {
        expect((await agent.get(`/me/jobs/${encodeURIComponent(id)}`)).status, id).toBe(404);
      }
    });

    it("mostra como expirada a oportunidade aberta com prazo vencido, sem permitir mudanças", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "PUBLISHED", { expiresAt: new Date(Date.now() - HOUR) });
      const res = await agent.get(`/me/jobs/${row.id}`);
      expect(res.body.job).toMatchObject({ status: "EXPIRED", canEdit: false, canCancel: false, canPublish: false });
      expect((await patch(agent, row.id, { title: "Novo título" })).status).toBe(409);
      expect((await post(agent, `/me/jobs/${row.id}/cancel`)).status).toBe(409);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PUBLISHED");
    });
  });

  // =========================================================================
  describe("editar", () => {
    it("altera só os campos enviados e atualiza a versão", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const res = await patch(agent, job.id, { title: "Pintura de quarto", proposedPriceCents: 25000 });
      expect(res.status).toBe(200);
      expect(res.body.job).toMatchObject({
        title: "Pintura de quarto",
        proposedPriceCents: 25000,
        description: "Preciso pintar uma sala de aproximadamente 20 m².",
        negotiable: true,
        status: "DRAFT",
      });
      expect(new Date(res.body.job.updatedAt).getTime()).toBeGreaterThan(new Date(job.updatedAt).getTime());
    });

    it("com a versão que a pessoa viu (expectedUpdatedAt) a edição passa; sem o campo, continua passando", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const first = await patch(agent, job.id, { title: "Primeira edição", expectedUpdatedAt: job.updatedAt });
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.job.title).toBe("Primeira edição");
      expect((await patch(agent, job.id, { title: "Sem versão informada" })).status).toBe(200);
    });

    it("versão desatualizada: 409 conflict e NADA é alterado (inclusive com campos inválidos junto)", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const other = await patch(agent, job.id, { title: "Editada em outra aba" });
      expect(other.status).toBe(200);
      const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });

      const stale = await patch(agent, job.id, { title: "Editada com tela velha", expectedUpdatedAt: job.updatedAt });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("conflict");
      const staleInvalid = await patch(agent, job.id, { title: "x", expectedUpdatedAt: job.updatedAt });
      expect(staleInvalid.status).toBe(409);
      expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toEqual(before);

      // Com a versão atual, a mesma edição passa.
      const fresh = await patch(agent, job.id, { title: "Editada com tela nova", expectedUpdatedAt: other.body.job.updatedAt });
      expect(fresh.status).toBe(200);
    });

    it("versão inválida (não é texto de data) é 400 e não altera nada", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      for (const expectedUpdatedAt of ["ontem", 123, null, ""]) {
        const res = await patch(agent, job.id, { title: "Nova", expectedUpdatedAt });
        expect(res.status).toBe(400);
        expect(res.body.fields).toHaveProperty("expectedUpdatedAt");
      }
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).title).toBe("Pintura de sala");
    });

    it("a versão não abre brecha: oportunidade de outra pessoa continua 404 e cancelada continua 409 invalid_state", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent);
      expect((await patch(b.agent, job.id, { title: "Invadida", expectedUpdatedAt: job.updatedAt })).status).toBe(404);
      const cancelled = await post(a.agent, `/me/jobs/${job.id}/cancel`);
      const res = await patch(a.agent, job.id, { title: "Tarde demais", expectedUpdatedAt: cancelled.body.job.updatedAt });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invalid_state");
    });

    it("rascunho com prazo vencido pode ser corrigido pela edição e depois publicado", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "DRAFT", { expiresAt: new Date(Date.now() - 2 * DAY) });
      const stale = await post(agent, `/me/jobs/${row.id}/publish`);
      expect(stale.status).toBe(400);
      const service = Date.now() + 10 * DAY;
      const fix = await patch(agent, row.id, {
        scheduledDate: brasiliaDay(service),
        startTime: "08:00",
        expiresAt: new Date(service - DAY).toISOString(),
        expectedUpdatedAt: new Date(row.updatedAt).toISOString(),
      });
      expect(fix.status, JSON.stringify(fix.body)).toBe(200);
      expect((await post(agent, `/me/jobs/${row.id}/publish`)).status).toBe(200);
    });

    it("quem edita uma publicada muda o que a exploração pública mostra", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent, { publish: true });
      expect((await patch(agent, job.id, { title: "Título corrigido", city: "Muriaé" })).status).toBe(200);
      const detail = await request(app).get(`/jobs/${job.id}`);
      expect(detail.body).toMatchObject({ title: "Título corrigido", city: "Muriaé", status: "PUBLISHED" });
    });

    it("não deixa editar a oportunidade de outra pessoa (404) e nada muda", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent, { publish: true });
      const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      const res = await patch(b.agent, job.id, { title: "Invadida", proposedPriceCents: 1 });
      expect(res.status).toBe(404);
      const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(after).toEqual(before);
    });

    it("não troca o dono nem o estado por edição", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent);
      for (const extra of [{ ownerId: b.id }, { status: "PUBLISHED" }, { isDemo: true }, { publish: true }]) {
        const res = await patch(a.agent, job.id, { title: "Novo título", ...extra });
        expect(res.status, JSON.stringify(extra)).toBe(400);
      }
      const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row).toMatchObject({ ownerId: a.id, status: "DRAFT", isDemo: false, title: "Pintura de sala" });
    });

    it("rejeita corpo vazio e valores inválidos, sem alterar nada", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      for (const payload of [{}, { title: "" }, { proposedPriceCents: -5 }, { state: "ZZ" }, { startTime: "99:00" }, { expiresAt: new Date(Date.now() - DAY).toISOString() }, { scheduledDate: "2026-02-30" }]) {
        const res = await patch(agent, job.id, payload);
        expect(res.status, JSON.stringify(payload)).toBe(400);
      }
      expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toEqual(before);
    });

    it("confere a coerência do calendário com os campos que já existem", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      // O serviço seria antes do prazo já gravado.
      const res = await patch(agent, job.id, { scheduledDate: brasiliaDay(Date.now() + 2 * DAY) });
      expect(res.status).toBe(400);
      expect(res.body.fields.expiresAt).toMatch(/depois da data/);
      const ok = await patch(agent, job.id, {
        scheduledDate: brasiliaDay(Date.now() + 20 * DAY),
        expiresAt: new Date(Date.now() + 15 * DAY).toISOString(),
      });
      expect(ok.status).toBe(200);
    });

    it("recusa categoria inativa na edição", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const res = await patch(agent, job.id, { categoryId: inactive.id });
      expect(res.status).toBe(400);
      expect(res.body.fields.categoryId).toEqual(expect.any(String));
    });

    it("um rascunho antigo, com prazo vencido, ainda pode ter o título corrigido", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "DRAFT", { expiresAt: new Date(Date.now() - 3 * DAY) });
      const res = await patch(agent, row.id, { title: "Título novo" });
      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe("DRAFT");
    });

    it.each(["HIRED", "COMPLETED", "CANCELLED"] as const)("não edita oportunidade %s (409)", async (status) => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, status);
      const res = await patch(agent, row.id, { title: "Mudança indevida" });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("invalid_state");
      expect((await prisma.job.findUniqueOrThrow({ where: { id: row.id } })).title).toBe("Linha direta");
    });

    it("permite editar uma oportunidade em negociação (sem contratação)", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "NEGOTIATING");
      expect((await patch(agent, row.id, { description: "Descrição melhorada para o serviço." })).status).toBe(200);
    });

    it("edições simultâneas nunca dão erro 500 nem misturam versões", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const titles = ["Versão A", "Versão B", "Versão C", "Versão D"];
      const results = await Promise.all(titles.map((title) => patch(agent, job.id, { title })));
      for (const r of results) expect([200, 409], JSON.stringify(r.body)).toContain(r.status);
      expect(results.some((r) => r.status === 200)).toBe(true);
      const final = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(titles).toContain(final.title);
      const winners = results.filter((r) => r.status === 200).map((r) => r.body.job.title);
      expect(winners).toContain(final.title);
    });
  });

  // =========================================================================
  describe("publicar", () => {
    it("publica um rascunho e ele passa a aparecer na exploração", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const res = await post(agent, `/me/jobs/${job.id}/publish`);
      expect(res.status).toBe(200);
      expect(res.body.job).toMatchObject({ status: "PUBLISHED", canEdit: true, canPublish: false, canCancel: true });
      expect(res.body.job.publishedAt).toEqual(expect.any(String));
      expect((await request(app).get("/jobs")).body.jobs.map((j: { id: string }) => j.id)).toEqual([job.id]);
    });

    it("publicar de novo é recusado (409) e não muda a data de publicação", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const first = await post(agent, `/me/jobs/${job.id}/publish`);
      const again = await post(agent, `/me/jobs/${job.id}/publish`);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("invalid_state");
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).publishedAt?.toISOString()).toBe(first.body.job.publishedAt);
    });

    it("não publica a oportunidade de outra pessoa (404)", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent);
      expect((await post(b.agent, `/me/jobs/${job.id}/publish`)).status).toBe(404);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("DRAFT");
      expect((await request(app).get("/jobs")).body.jobs).toHaveLength(0);
    });

    it("não publica rascunho cuja data ou prazo já passaram", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "DRAFT", { expiresAt: new Date(Date.now() - DAY) });
      const res = await post(agent, `/me/jobs/${row.id}/publish`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("validation_error");
      expect((await prisma.job.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("DRAFT");
      // Depois de corrigir o prazo e a data, publica.
      const fix = await patch(agent, row.id, {
        scheduledDate: brasiliaDay(Date.now() + 10 * DAY),
        expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
      });
      expect(fix.status).toBe(200);
      expect((await post(agent, `/me/jobs/${row.id}/publish`)).status).toBe(200);
    });

    it("não publica se a categoria foi desativada depois do rascunho", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      await prisma.category.update({ where: { id: category.id }, data: { active: false } });
      const res = await post(agent, `/me/jobs/${job.id}/publish`);
      expect(res.status).toBe(400);
      expect(res.body.fields.categoryId).toEqual(expect.any(String));
    });

    it.each(["PUBLISHED", "NEGOTIATING", "HIRED", "COMPLETED", "CANCELLED"] as const)("não publica oportunidade %s (409)", async (status) => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, status);
      expect((await post(agent, `/me/jobs/${row.id}/publish`)).status).toBe(409);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
    });

    it("publicações simultâneas: só uma vence e a data de publicação é única", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const results = await Promise.all(Array.from({ length: 6 }, () => post(agent, `/me/jobs/${job.id}/publish`)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      const winner = results.find((r) => r.status === 200)!;
      const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt?.toISOString()).toBe(winner.body.job.publishedAt);
    });
  });

  // =========================================================================
  describe("cancelar", () => {
    it("cancela um rascunho marcando o estado, sem apagar o registro", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const res = await post(agent, `/me/jobs/${job.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.job).toMatchObject({ status: "CANCELLED", canEdit: false, canCancel: false, canPublish: false });
      expect(res.body.job.cancelledAt).toEqual(expect.any(String));
      const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("CANCELLED");
      expect(await prisma.job.count()).toBe(1);
      expect((await agent.get("/me/jobs")).body.jobs).toHaveLength(1);
    });

    it("cancela uma publicada: sai da lista pública e o detalhe explica o motivo", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent, { publish: true });
      expect((await request(app).get("/jobs")).body.jobs).toHaveLength(1);
      expect((await post(agent, `/me/jobs/${job.id}/cancel`)).status).toBe(200);
      expect((await request(app).get("/jobs")).body.jobs).toHaveLength(0);
      const detail = await request(app).get(`/jobs/${job.id}`);
      expect(detail.body).toMatchObject({ status: "CANCELLED", acceptingInterests: false });
      expect(detail.body.statusMessage).toMatch(/cancelou/);
    });

    it("cancela uma oportunidade em negociação", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "NEGOTIATING");
      expect((await post(agent, `/me/jobs/${row.id}/cancel`)).status).toBe(200);
    });

    it("cancelar de novo é recusado com mensagem clara e não muda a data", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      const first = await post(agent, `/me/jobs/${job.id}/cancel`);
      const again = await post(agent, `/me/jobs/${job.id}/cancel`);
      expect(again.status).toBe(409);
      expect(again.body.message).toMatch(/já foi cancelada/);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).cancelledAt?.toISOString()).toBe(first.body.job.cancelledAt);
    });

    it("não cancela a oportunidade de outra pessoa (404)", async () => {
      const a = await signUp("A");
      const b = await signUp("B");
      const job = await createJob(a.agent, { publish: true });
      expect((await post(b.agent, `/me/jobs/${job.id}/cancel`)).status).toBe(404);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PUBLISHED");
    });

    it.each(["HIRED", "COMPLETED"] as const)("não cancela oportunidade %s (409)", async (status) => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, status);
      expect((await post(agent, `/me/jobs/${row.id}/cancel`)).status).toBe(409);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
    });

    it("cancelamentos simultâneos: só um vence", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent, { publish: true });
      const results = await Promise.all(Array.from({ length: 6 }, () => post(agent, `/me/jobs/${job.id}/cancel`)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
    });

    it("publicar e cancelar ao mesmo tempo termina sempre cancelada, sem estado inconsistente", async () => {
      for (let round = 0; round < 6; round += 1) {
        const { agent } = await signUp();
        const job = await createJob(agent);
        const [published, cancelled] = await Promise.all([
          post(agent, `/me/jobs/${job.id}/publish`),
          post(agent, `/me/jobs/${job.id}/cancel`),
        ]);
        expect([200, 409]).toContain(published.status);
        expect(cancelled.status).toBe(200);
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(row.status).toBe("CANCELLED");
        expect(row.cancelledAt).not.toBeNull();
        // Só tem data de publicação se a publicação realmente venceu.
        expect(row.publishedAt !== null).toBe(published.status === 200);
      }
    });

    it("editar e cancelar ao mesmo tempo não ressuscita nem altera uma oportunidade cancelada", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent, { publish: true });
      const [edit, cancel] = await Promise.all([
        patch(agent, job.id, { title: "Editada na corrida" }),
        post(agent, `/me/jobs/${job.id}/cancel`),
      ]);
      expect([200, 409]).toContain(edit.status);
      expect(cancel.status).toBe(200);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
    });
  });

  // =========================================================================
  describe("corridas determinísticas (todas as requisições leem antes de qualquer uma escrever)", () => {
    /**
     * Um app cuja leitura da oportunidade só termina quando `parties` requisições já leram. Assim
     * todas veem o mesmo estado antigo e a decisão fica por conta do UPDATE condicional.
     */
    async function racingAgent(parties: number): Promise<Agent> {
      let arrived = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const jobProxy = new Proxy(prisma.job, {
        get(target, prop) {
          if (prop === "findFirst") {
            return async (...args: unknown[]) => {
              const result = await (target.findFirst as (...a: unknown[]) => Promise<unknown>)(...args);
              arrived += 1;
              if (arrived >= parties) release();
              await gate;
              return result;
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const prismaProxy = new Proxy(prisma, {
        get(target, prop) {
          if (prop === "job") return jobProxy;
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as PrismaClient;
      const racingApp = createApp(config, createAuth(config, prisma), prismaProxy);
      const { email } = await signUp("Corredora");
      const agent = request.agent(racingApp);
      const login = await agent.post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email, password: "senha-segura-123" });
      expect(login.status).toBe(200);
      return agent;
    }

    /** Cria a oportunidade da mesma conta do agente de corrida. */
    async function ownJob(agent: Agent, overrides: Record<string, unknown> = {}) {
      return createJob(agent, overrides);
    }

    it("6 publicações lendo o mesmo rascunho: só uma grava", async () => {
      const racer = await racingAgent(6);
      const job = await ownJob(racer);
      const results = await Promise.all(Array.from({ length: 6 }, () => post(racer, `/me/jobs/${job.id}/publish`)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(results.filter((r) => r.status === 409).every((r) => r.body.message === "Esta oportunidade já foi publicada.")).toBe(true);
    });

    it("6 cancelamentos lendo a mesma oportunidade: só um grava", async () => {
      const racer = await racingAgent(6);
      const job = await ownJob(racer, { publish: true });
      const results = await Promise.all(Array.from({ length: 6 }, () => post(racer, `/me/jobs/${job.id}/cancel`)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(results.filter((r) => r.status === 409).every((r) => /já foi cancelada/.test(r.body.message))).toBe(true);
    });

    it("4 edições lendo a mesma versão: só uma grava, as outras recebem conflito", async () => {
      const racer = await racingAgent(4);
      const job = await ownJob(racer);
      const titles = ["Versão A", "Versão B", "Versão C", "Versão D"];
      const results = await Promise.all(titles.map((title) => patch(racer, job.id, { title })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const losers = results.filter((r) => r.status === 409);
      expect(losers).toHaveLength(3);
      expect(losers.every((r) => r.body.error === "conflict")).toBe(true);
      const winner = results.find((r) => r.status === 200)!;
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).title).toBe(winner.body.job.title);
    });

    it("relógio parado (mesmo milissegundo): duas edições lendo a mesma versão ainda não se sobrescrevem", async () => {
      const racer = await racingAgent(4);
      const job = await ownJob(racer);
      // Simula o pior caso do controle por data: o relógio devolve, na escrita, o mesmo instante
      // que já era a versão lida (mesmo milissegundo, ou relógio que andou para trás).
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(job.updatedAt) });
      let results: request.Response[];
      try {
        const titles = ["Versão A", "Versão B", "Versão C", "Versão D"];
        results = await Promise.all(titles.map((title) => patch(racer, job.id, { title })));
      } finally {
        vi.useRealTimers();
      }
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409 && r.body.error === "conflict")).toHaveLength(3);
    });

    it("publicar e cancelar lendo o mesmo rascunho: o resultado é sempre coerente", async () => {
      for (let round = 0; round < 4; round += 1) {
        const racer = await racingAgent(2);
        const job = await ownJob(racer);
        const [published, cancelled] = await Promise.all([
          post(racer, `/me/jobs/${job.id}/publish`),
          post(racer, `/me/jobs/${job.id}/cancel`),
        ]);
        expect(cancelled.status).toBe(200);
        expect([200, 409]).toContain(published.status);
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(row.status).toBe("CANCELLED");
        expect(row.publishedAt !== null).toBe(published.status === 200);
      }
    });

    it("editar e cancelar lendo a mesma publicada: nunca sobra uma edição numa cancelada", async () => {
      const racer = await racingAgent(2);
      const job = await ownJob(racer, { publish: true });
      const [edit, cancel] = await Promise.all([
        patch(racer, job.id, { title: "Editada na corrida" }),
        post(racer, `/me/jobs/${job.id}/cancel`),
      ]);
      expect(cancel.status).toBe(200);
      expect([200, 409]).toContain(edit.status);
      const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.status).toBe("CANCELLED");
      // Se a edição venceu, o título mudou; se perdeu, não pode ter mudado.
      expect(row.title === "Editada na corrida").toBe(edit.status === 200);
    });
  });

  // =========================================================================
  describe("regressões da exploração pública", () => {
    it("só aparecem na lista pública as oportunidades publicadas e dentro do prazo", async () => {
      const { agent, id } = await signUp();
      const published = await createJob(agent, { publish: true });
      await createJob(agent); // rascunho
      const cancelled = await createJob(agent, { publish: true });
      await post(agent, `/me/jobs/${cancelled.id}/cancel`);
      await insertJob(id, "PUBLISHED", { expiresAt: new Date(Date.now() - HOUR) });
      const list = await request(app).get("/jobs");
      expect(list.body.jobs.map((j: { id: string }) => j.id)).toEqual([published.id]);
    });

    it("rotas públicas continuam abertas sem sessão", async () => {
      expect((await request(app).get("/categories")).status).toBe(200);
      expect((await request(app).get("/jobs")).status).toBe(200);
      expect((await request(app).get("/health")).status).toBe(200);
    });

    it("a rota privada não é alcançada por /jobs/:id", async () => {
      const { agent } = await signUp();
      const job = await createJob(agent);
      expect((await request(app).get(`/jobs/${job.id}`)).status).toBe(404);
      expect((await request(app).get("/jobs/me")).status).toBe(404);
    });
  });
});
