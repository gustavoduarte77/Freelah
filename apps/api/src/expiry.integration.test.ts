import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createAuth } from "./auth";
import type { PrismaClient } from "./db";
import { expireOverdueJobs, startExpiryJob } from "./expiry";
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
type Agent = ReturnType<typeof request.agent>;

describe.skipIf(!testDatabaseUrl)("expiração automática de oportunidades (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let category: { id: string };
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
      select: { id: true },
    });
  });

  async function signUp(): Promise<{ agent: Agent; id: string }> {
    counter += 1;
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `Pessoa ${counter}`,
      email: `pessoa${counter}@exemplo.com`,
      password: "senha-segura-123",
      phone: "32999990000",
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, id: res.body.user.id as string };
  }

  /** Linha direta no banco (o prazo vencido não pode ser criado pela API). */
  async function insertJob(ownerId: string, status: JobStatus, expiresAt: Date, title = "Oportunidade") {
    const hired = status === "HIRED" || status === "COMPLETED";
    const job = await prisma.job.create({
      data: {
        title,
        description: "Descrição da oportunidade de teste.",
        categoryId: category.id,
        ownerId,
        city: "Cataguases",
        state: "MG",
        scheduledDate: new Date("2030-01-10T00:00:00.000Z"),
        startTime: "08:00",
        proposedPriceCents: 10000,
        expiresAt,
        status: hired ? "PUBLISHED" : status,
        publishedAt: status === "DRAFT" ? null : new Date(Date.now() - 2 * DAY),
        cancelledAt: status === "CANCELLED" ? new Date() : null,
      },
    });
    if (!hired) return job;
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
      data: { status, selectedInterestId: interest.id, hiredAt: new Date(), completedAt: status === "COMPLETED" ? new Date() : null },
    });
  }

  const statusOf = async (id: string) => (await prisma.job.findUniqueOrThrow({ where: { id } })).status;
  const past = () => new Date(Date.now() - HOUR);
  const future = () => new Date(Date.now() + DAY);

  // =========================================================================
  describe("expireOverdueJobs", () => {
    it("expira publicadas e em negociação com o prazo vencido", async () => {
      const { id } = await signUp();
      const published = await insertJob(id, "PUBLISHED", past());
      const negotiating = await insertJob(id, "NEGOTIATING", past());
      expect(await expireOverdueJobs(prisma)).toBe(2);
      expect(await statusOf(published.id)).toBe("EXPIRED");
      expect(await statusOf(negotiating.id)).toBe("EXPIRED");
    });

    it("não toca em nenhum outro estado, mesmo com o prazo vencido", async () => {
      const { id } = await signUp();
      const untouched = {
        draft: await insertJob(id, "DRAFT", past()),
        cancelled: await insertJob(id, "CANCELLED", past()),
        hired: await insertJob(id, "HIRED", past()),
        completed: await insertJob(id, "COMPLETED", past()),
        expired: await insertJob(id, "EXPIRED", past()),
      };
      const before = await prisma.job.findMany({ orderBy: { id: "asc" } });
      expect(await expireOverdueJobs(prisma)).toBe(0);
      expect(await prisma.job.findMany({ orderBy: { id: "asc" } })).toEqual(before);
      expect(await statusOf(untouched.draft.id)).toBe("DRAFT");
      expect(await statusOf(untouched.hired.id)).toBe("HIRED");
      expect(await statusOf(untouched.completed.id)).toBe("COMPLETED");
      expect(await statusOf(untouched.cancelled.id)).toBe("CANCELLED");
    });

    it("não expira o que ainda está dentro do prazo", async () => {
      const { id } = await signUp();
      const open = await insertJob(id, "PUBLISHED", future());
      const negotiating = await insertJob(id, "NEGOTIATING", new Date(Date.now() + 60_000));
      expect(await expireOverdueJobs(prisma)).toBe(0);
      expect(await statusOf(open.id)).toBe("PUBLISHED");
      expect(await statusOf(negotiating.id)).toBe("NEGOTIATING");
    });

    it("trata o instante exato do prazo como vencido, e um milissegundo antes como aberto", async () => {
      const { id } = await signUp();
      const moment = new Date("2030-06-01T12:00:00.000Z");
      const exact = await insertJob(id, "PUBLISHED", moment, "no instante");
      const justBefore = await insertJob(id, "PUBLISHED", new Date(moment.getTime() + 1), "um ms depois");
      expect(await expireOverdueJobs(prisma, moment)).toBe(1);
      expect(await statusOf(exact.id)).toBe("EXPIRED");
      expect(await statusOf(justBefore.id)).toBe("PUBLISHED");
    });

    it("só muda o estado: o restante da oportunidade fica como estava", async () => {
      const { id } = await signUp();
      const row = await insertJob(id, "PUBLISHED", past(), "Título original");
      await expireOverdueJobs(prisma);
      const after = await prisma.job.findUniqueOrThrow({ where: { id: row.id } });
      expect(after).toMatchObject({
        title: "Título original",
        ownerId: id,
        publishedAt: row.publishedAt,
        cancelledAt: null,
        selectedInterestId: null,
        hiredAt: null,
        completedAt: null,
        expiresAt: row.expiresAt,
        status: "EXPIRED",
      });
    });

    it("é segura para repetir: a segunda execução não encontra nada", async () => {
      const { id } = await signUp();
      await insertJob(id, "PUBLISHED", past());
      expect(await expireOverdueJobs(prisma)).toBe(1);
      expect(await expireOverdueJobs(prisma)).toBe(0);
      expect(await expireOverdueJobs(prisma)).toBe(0);
    });

    it("execuções simultâneas marcam cada oportunidade uma única vez", async () => {
      const { id } = await signUp();
      for (let i = 0; i < 12; i += 1) await insertJob(id, i % 2 ? "PUBLISHED" : "NEGOTIATING", past(), `Vencida ${i}`);
      await insertJob(id, "PUBLISHED", future(), "Aberta");
      const counts = await Promise.all(Array.from({ length: 8 }, () => expireOverdueJobs(prisma)));
      expect(counts.reduce((a, b) => a + b, 0)).toBe(12);
      expect(await prisma.job.count({ where: { status: "EXPIRED" } })).toBe(12);
      expect(await prisma.job.count({ where: { status: { in: ["PUBLISHED", "NEGOTIATING"] } } })).toBe(1);
    });

    it("com ownerId, só olha as oportunidades dessa pessoa", async () => {
      const a = await signUp();
      const b = await signUp();
      const mine = await insertJob(a.id, "PUBLISHED", past());
      const theirs = await insertJob(b.id, "PUBLISHED", past());
      expect(await expireOverdueJobs(prisma, new Date(), a.id)).toBe(1);
      expect(await statusOf(mine.id)).toBe("EXPIRED");
      expect(await statusOf(theirs.id)).toBe("PUBLISHED");
    });
  });

  // =========================================================================
  describe("na inicialização (reinício da API)", () => {
    it("recupera o que venceu enquanto a API estava fora do ar", async () => {
      const { id } = await signUp();
      // A API "caiu" com esta oportunidade aberta; o prazo terminou durante a queda.
      const row = await insertJob(id, "PUBLISHED", past());
      expect(await statusOf(row.id)).toBe("PUBLISHED");

      const job = startExpiryJob(() => expireOverdueJobs(prisma), { setTimer: () => 0, clearTimer: () => undefined });
      await job.runNow(); // junta-se à varredura da inicialização
      expect(await statusOf(row.id)).toBe("EXPIRED");
      job.stop();
    });

    it("reiniciar várias vezes é inofensivo", async () => {
      const { id } = await signUp();
      const row = await insertJob(id, "NEGOTIATING", past());
      const keep = await insertJob(id, "PUBLISHED", future());
      for (let i = 0; i < 3; i += 1) {
        const job = startExpiryJob(() => expireOverdueJobs(prisma), { setTimer: () => 0, clearTimer: () => undefined });
        await job.runNow();
        job.stop();
      }
      expect(await statusOf(row.id)).toBe("EXPIRED");
      expect(await statusOf(keep.id)).toBe("PUBLISHED");
    });

    it("duas instâncias da API varrendo ao mesmo tempo não se atrapalham", async () => {
      const { id } = await signUp();
      for (let i = 0; i < 6; i += 1) await insertJob(id, "PUBLISHED", past(), `Vencida ${i}`);
      const first = startExpiryJob(() => expireOverdueJobs(prisma), { setTimer: () => 0, clearTimer: () => undefined });
      const second = startExpiryJob(() => expireOverdueJobs(prisma), { setTimer: () => 0, clearTimer: () => undefined });
      const counts = await Promise.all([first.runNow(), second.runNow()]);
      expect(counts[0]! + counts[1]!).toBe(6);
      expect(await prisma.job.count({ where: { status: "EXPIRED" } })).toBe(6);
      first.stop();
      second.stop();
    });
  });

  // =========================================================================
  describe("antes de listar 'Minhas oportunidades'", () => {
    it("marca as vencidas da pessoa no banco e devolve o estado expirada", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "PUBLISHED", past(), "Venceu");
      const open = await insertJob(id, "PUBLISHED", future(), "Aberta");
      const draft = await insertJob(id, "DRAFT", past(), "Rascunho antigo");
      const res = await agent.get("/me/jobs");
      expect(res.status).toBe(200);
      const byTitle = Object.fromEntries(res.body.jobs.map((j: { title: string; status: string }) => [j.title, j.status]));
      expect(byTitle).toEqual({ Venceu: "EXPIRED", Aberta: "PUBLISHED", "Rascunho antigo": "DRAFT" });
      expect(await statusOf(row.id)).toBe("EXPIRED");
      expect(await statusOf(open.id)).toBe("PUBLISHED");
      expect(await statusOf(draft.id)).toBe("DRAFT");
    });

    it("não mexe nas oportunidades de outras pessoas", async () => {
      const a = await signUp();
      const b = await signUp();
      const theirs = await insertJob(b.id, "PUBLISHED", past());
      await a.agent.get("/me/jobs");
      expect(await statusOf(theirs.id)).toBe("PUBLISHED");
    });

    it("se a marcação falhar, a lista sai mesmo assim com o estado calculado", async () => {
      const { agent, id } = await signUp();
      await insertJob(id, "PUBLISHED", past(), "Venceu");
      const brokenJob = new Proxy(prisma.job, {
        get(target, prop) {
          if (prop === "updateMany") return () => Promise.reject(new Error("falha simulada"));
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const brokenPrisma = new Proxy(prisma, {
        get(target, prop) {
          if (prop === "job") return brokenJob;
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as PrismaClient;
      const brokenApp = createApp(config, createAuth(config, prisma), brokenPrisma);
      const login = request.agent(brokenApp);
      await login.post("/api/auth/sign-in/email").set("Origin", ORIGIN).send({ email: `pessoa${counter}@exemplo.com`, password: "senha-segura-123" });
      const res = await login.get("/me/jobs");
      expect(res.status).toBe(200);
      expect(res.body.jobs[0]).toMatchObject({ title: "Venceu", status: "EXPIRED", canEdit: false });
      void agent;
    });

    it("depois de expirada, editar e cancelar continuam recusados e a lista pública não a mostra", async () => {
      const { agent, id } = await signUp();
      const row = await insertJob(id, "PUBLISHED", past());
      await expireOverdueJobs(prisma);
      expect((await agent.patch(`/me/jobs/${row.id}`).set("Origin", ORIGIN).send({ title: "Novo título" })).status).toBe(409);
      expect((await agent.post(`/me/jobs/${row.id}/cancel`).set("Origin", ORIGIN).send({})).status).toBe(409);
      expect((await agent.post(`/me/jobs/${row.id}/publish`).set("Origin", ORIGIN).send({})).status).toBe(409);
      expect(await statusOf(row.id)).toBe("EXPIRED");
    });
  });

  // =========================================================================
  describe("exploração pública não muda", () => {
    it("a lista pública mostra o mesmo antes e depois da varredura, e o detalhe explica a expiração", async () => {
      const { id } = await signUp();
      const open = await insertJob(id, "PUBLISHED", future(), "Aberta");
      const overdue = await insertJob(id, "PUBLISHED", past(), "Vencida");
      await insertJob(id, "DRAFT", past(), "Rascunho");
      await insertJob(id, "CANCELLED", future(), "Cancelada");

      const before = await request(app).get("/jobs");
      expect(before.body.jobs.map((j: { id: string }) => j.id)).toEqual([open.id]);
      const beforeDetail = await request(app).get(`/jobs/${overdue.id}`);
      expect(beforeDetail.body).toMatchObject({ status: "EXPIRED", acceptingInterests: false });

      await expireOverdueJobs(prisma);

      const after = await request(app).get("/jobs");
      expect(after.body).toEqual(before.body);
      const afterDetail = await request(app).get(`/jobs/${overdue.id}`);
      expect(afterDetail.body).toEqual(beforeDetail.body);
      expect(afterDetail.body.statusMessage).toMatch(/prazo/);
      expect((await request(app).get("/jobs?q=vencida")).body.jobs).toHaveLength(0);
    });

    it("uma em negociação com prazo vencido some da lista e continua com o aviso de expirada", async () => {
      const { id } = await signUp();
      const row = await insertJob(id, "NEGOTIATING", past());
      await expireOverdueJobs(prisma);
      expect((await request(app).get("/jobs")).body.jobs).toHaveLength(0);
      expect((await request(app).get(`/jobs/${row.id}`)).body.status).toBe("EXPIRED");
    });
  });
});
