import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createAuth } from "./auth";
import type { PrismaClient } from "./db";
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
const brasiliaDay = (ms: number) => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);

describe.skipIf(!testDatabaseUrl)("interesses (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let categoryId: string;
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
    categoryId = (await prisma.category.create({ data: { slug: "construcao-civil", name: "Construção Civil" } })).id;
  });

  async function signUp(name = "Pessoa"): Promise<{ agent: Agent; id: string }> {
    counter += 1;
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `${name} ${counter}`,
      email: `pessoa${counter}@exemplo.com`,
      password: "senha-segura-123",
      phone: "32999990000",
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, id: res.body.user.id as string };
  }

  const post = (agent: Agent, path: string) => agent.post(path).set("Origin", ORIGIN).send({});

  async function publishedJob(owner: { agent: Agent }, overrides: Record<string, unknown> = {}) {
    const service = Date.now() + 10 * DAY;
    const res = await owner.agent
      .post("/me/jobs")
      .set("Origin", ORIGIN)
      .send({
        title: "Pintura de sala",
        description: "Preciso pintar uma sala de aproximadamente 20 m².",
        categoryId,
        city: "Cataguases",
        state: "MG",
        scheduledDate: brasiliaDay(service),
        startTime: "08:00",
        proposedPriceCents: 20000,
        expiresAt: new Date(service - DAY).toISOString(),
        publish: true,
        ...overrides,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.job as { id: string };
  }
  const statusOf = async (id: string) => (await prisma.job.findUniqueOrThrow({ where: { id } })).status;

  it("exige sessão em todas as rotas (401)", async () => {
    const id = "01990000-0000-7000-8000-000000000001";
    for (const [method, path] of [
      ["post", `/jobs/${id}/interest`],
      ["get", `/jobs/${id}/viewer`],
      ["post", `/me/interests/${id}/withdraw`],
      ["get", "/me/interests"],
      ["get", `/me/jobs/${id}/interests`],
    ] as const) {
      const res = await request(app)[method](path).set("Origin", ORIGIN).send({});
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("demonstrar interesse: salva, a oportunidade vira 'Em negociação' e o segundo interessado não muda isso", async () => {
    const owner = await signUp("Dona");
    const a = await signUp("A");
    const b = await signUp("B");
    const job = await publishedJob(owner);

    const first = await post(a.agent, `/jobs/${job.id}/interest`);
    expect(first.status).toBe(201);
    expect(first.body.interest.status).toBe("PENDING");
    expect(await statusOf(job.id)).toBe("NEGOTIATING");
    expect((await post(b.agent, `/jobs/${job.id}/interest`)).status).toBe(201);
    expect(await statusOf(job.id)).toBe("NEGOTIATING");
    expect(await prisma.interest.count({ where: { jobId: job.id } })).toBe(2);
  });

  it("não duplica: segundo pedido é 409 já demonstrou; 10 pedidos simultâneos geram UMA linha", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const job = await publishedJob(owner);

    const again = await post(worker.agent, `/jobs/${job.id}/interest`);
    expect(again.status).toBe(201);
    const dup = await post(worker.agent, `/jobs/${job.id}/interest`);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("already_interested");
    expect(dup.body.interest.id).toBe(again.body.interest.id);

    const other = await signUp("Outro");
    const results = await Promise.all(Array.from({ length: 10 }, () => post(other.agent, `/jobs/${job.id}/interest`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect(results.every((r) => r.status !== 500)).toBe(true);
    expect(await prisma.interest.count({ where: { jobId: job.id, workerId: other.id } })).toBe(1);
  });

  it("pessoas diferentes ao mesmo tempo: todas entram e o estado final é 'Em negociação'", async () => {
    const owner = await signUp("Dona");
    const workers = await Promise.all([signUp("A"), signUp("B"), signUp("C"), signUp("D")]);
    const job = await publishedJob(owner);
    const results = await Promise.all(workers.map((w) => post(w.agent, `/jobs/${job.id}/interest`)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(await statusOf(job.id)).toBe("NEGOTIATING");
  });

  it("a dona não demonstra interesse na própria oportunidade", async () => {
    const owner = await signUp("Dona");
    const job = await publishedJob(owner);
    const res = await post(owner.agent, `/jobs/${job.id}/interest`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("own_job");
    expect(await prisma.interest.count()).toBe(0);
    expect((await owner.agent.get(`/jobs/${job.id}/viewer`)).body).toEqual({ isOwner: true, interest: null });
  });

  it("oportunidade que não aceita interessados: cancelada, vencida, contratada ou concluída recusam; rascunho e id ruim são 404", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const cancelled = await publishedJob(owner);
    await post(owner.agent, `/me/jobs/${cancelled.id}/cancel`);
    const overdue = await publishedJob(owner);
    await prisma.job.update({ where: { id: overdue.id }, data: { expiresAt: new Date(Date.now() - HOUR) } }); // vencida e ainda não varrida

    for (const id of [cancelled.id, overdue.id]) {
      const res = await post(worker.agent, `/jobs/${id}/interest`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("not_accepting");
    }
    const draft = await publishedJob(owner, { publish: false });
    expect((await post(worker.agent, `/jobs/${draft.id}/interest`)).status).toBe(404);
    expect((await post(worker.agent, "/jobs/nao-e-um-id/interest")).status).toBe(404);
    expect(await prisma.interest.count()).toBe(0);
  });

  it("contratada: não aceita novos interessados", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const picked = await signUp("Escolhido");
    const job = await publishedJob(owner);
    const interest = await prisma.interest.create({ data: { jobId: job.id, workerId: picked.id, status: "ACCEPTED" } });
    await prisma.job.update({ where: { id: job.id }, data: { status: "HIRED", selectedInterestId: interest.id, hiredAt: new Date() } });
    const res = await post(worker.agent, `/jobs/${job.id}/interest`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("já foi contratada");
  });

  it("corrida com o cancelamento: nunca sobra interesse criado DEPOIS de cancelar", async () => {
    const owner = await signUp("Dona");
    const workers = await Promise.all([signUp("A"), signUp("B"), signUp("C")]);
    const job = await publishedJob(owner);
    const results = await Promise.all([
      ...workers.map((w) => post(w.agent, `/jobs/${job.id}/interest`)),
      post(owner.agent, `/me/jobs/${job.id}/cancel`),
    ]);
    expect(results.every((r) => r.status !== 500)).toBe(true);
    expect(await statusOf(job.id)).toBe("CANCELLED");
    // Todo interesse que existe foi aceito (201) antes do cancelamento; os demais foram recusados.
    const accepted = results.slice(0, 3).filter((r) => r.status === 201).length;
    expect(await prisma.interest.count({ where: { jobId: job.id } })).toBe(accepted);
    // Depois do cancelamento, ninguém mais entra.
    expect((await post(workers[0]!.agent, `/jobs/${job.id}/interest`)).status).toBe(409);
  });

  it("retirar: só o próprio, só pendente; depois pode demonstrar de novo na mesma linha", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const stranger = await signUp("Intruso");
    const job = await publishedJob(owner);
    const created = await post(worker.agent, `/jobs/${job.id}/interest`);
    const id = created.body.interest.id as string;

    expect((await post(stranger.agent, `/me/interests/${id}/withdraw`)).status).toBe(404);
    expect((await prisma.interest.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    expect((await post(owner.agent, `/me/interests/${id}/withdraw`)).status).toBe(404);

    const withdrawn = await post(worker.agent, `/me/interests/${id}/withdraw`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.interest.status).toBe("WITHDRAWN");
    const twice = await post(worker.agent, `/me/interests/${id}/withdraw`);
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe("not_withdrawable");
    expect((await owner.agent.get(`/me/jobs/${job.id}/interests`)).body.interests).toHaveLength(0);

    const back = await post(worker.agent, `/jobs/${job.id}/interest`);
    expect(back.status).toBe(201);
    expect(back.body.interest.id).toBe(id);
    expect(await prisma.interest.count({ where: { jobId: job.id } })).toBe(1);

    await prisma.interest.update({ where: { id }, data: { status: "ACCEPTED" } });
    expect((await post(worker.agent, `/me/interests/${id}/withdraw`)).status).toBe(409);
  });

  it("só a dona vê os interessados, e sem telefone nem e-mail", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const stranger = await signUp("Intruso");
    const job = await publishedJob(owner);
    await post(worker.agent, `/jobs/${job.id}/interest`);

    const list = await owner.agent.get(`/me/jobs/${job.id}/interests`);
    expect(list.status).toBe(200);
    expect(list.body.interests).toHaveLength(1);
    expect(list.body.interests[0]).toMatchObject({ status: "PENDING", worker: { city: "Cataguases" } });
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain("32999990000");
    expect(raw).not.toContain("@exemplo.com");
    expect(raw).not.toContain(worker.id);

    expect((await stranger.agent.get(`/me/jobs/${job.id}/interests`)).status).toBe(404);
    expect((await worker.agent.get(`/me/jobs/${job.id}/interests`)).status).toBe(404);
  });

  it("Meus interesses: só os meus, com o estado atual da oportunidade (cancelada aparece como cancelada)", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const other = await signUp("Outro");
    const open = await publishedJob(owner, { title: "Aberta" });
    const toCancel = await publishedJob(owner, { title: "Vai cancelar" });
    await post(worker.agent, `/jobs/${open.id}/interest`);
    await post(worker.agent, `/jobs/${toCancel.id}/interest`);
    await post(other.agent, `/jobs/${open.id}/interest`);
    await post(owner.agent, `/me/jobs/${toCancel.id}/cancel`);

    const mine = await worker.agent.get("/me/interests");
    expect(mine.status).toBe(200);
    expect(mine.body.interests).toHaveLength(2);
    const byTitle = Object.fromEntries(mine.body.interests.map((i: { job: { title: string; status: string }; status: string }) => [i.job.title, i.job.status]));
    expect(byTitle).toEqual({ Aberta: "NEGOTIATING", "Vai cancelar": "CANCELLED" });
    // Cancelar a oportunidade não altera a linha do interesse.
    expect(mine.body.interests.every((i: { status: string }) => i.status === "PENDING")).toBe(true);
    expect(JSON.stringify(mine.body)).not.toContain("32999990000");
  });

  it("'viewer' mostra a relação de cada pessoa; /me/jobs traz a contagem de interessados pendentes", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const stranger = await signUp("Intruso");
    const job = await publishedJob(owner);
    expect((await worker.agent.get(`/jobs/${job.id}/viewer`)).body).toEqual({ isOwner: false, interest: null });
    const created = await post(worker.agent, `/jobs/${job.id}/interest`);
    expect((await worker.agent.get(`/jobs/${job.id}/viewer`)).body).toEqual({
      isOwner: false,
      interest: { id: created.body.interest.id, status: "PENDING" },
    });
    expect((await stranger.agent.get(`/jobs/${job.id}/viewer`)).body.interest).toBeNull();
    expect((await owner.agent.get("/me/jobs")).body.jobs[0].interestCount).toBe(1);
    await post(worker.agent, `/me/interests/${created.body.interest.id}/withdraw`);
    expect((await owner.agent.get("/me/jobs")).body.jobs[0].interestCount).toBe(0);
  });

  it("editar e expirar com interessados não mexem nos interesses", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const job = await publishedJob(owner);
    await post(worker.agent, `/jobs/${job.id}/interest`);
    const current = (await owner.agent.get(`/me/jobs/${job.id}`)).body.job;
    const edit = await owner.agent
      .patch(`/me/jobs/${job.id}`)
      .set("Origin", ORIGIN)
      .send({ title: "Título novo", expectedUpdatedAt: current.updatedAt });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    await prisma.job.update({ where: { id: job.id }, data: { expiresAt: new Date(Date.now() - HOUR) } });
    expect((await owner.agent.get(`/me/jobs/${job.id}`)).body.job.status).toBe("EXPIRED");
    expect(await prisma.interest.count({ where: { jobId: job.id, status: "PENDING" } })).toBe(1);
  });
});
