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

describe.skipIf(!testDatabaseUrl)("selecionar o trabalhador e concluir (integração)", () => {
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

  async function signUp(name: string): Promise<{ agent: Agent; id: string }> {
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
  const post = (agent: Agent, path: string, payload: unknown = {}) =>
    agent.post(path).set("Origin", ORIGIN).send(payload as object);

  /** Dona com uma oportunidade publicada e N trabalhadores interessados. */
  async function scenario(workers = 3) {
    const owner = await signUp("Dona");
    const service = Date.now() + 10 * DAY;
    const job = (
      await post(owner.agent, "/me/jobs", {
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
      })
    ).body.job as { id: string };
    const people: { agent: Agent; id: string; interestId: string }[] = [];
    for (let i = 0; i < workers; i += 1) {
      const worker = await signUp(`Trab${i}`);
      const res = await post(worker.agent, `/jobs/${job.id}/interest`);
      expect(res.status).toBe(201);
      people.push({ ...worker, interestId: res.body.interest.id as string });
    }
    return { owner, job, workers: people };
  }
  const jobRow = (id: string) => prisma.job.findUniqueOrThrow({ where: { id } });
  const interestStatuses = async (jobId: string) =>
    Object.fromEntries((await prisma.interest.findMany({ where: { jobId } })).map((i) => [i.id, i.status]));

  it("exige sessão (401) em selecionar e concluir", async () => {
    const id = "01990000-0000-7000-8000-000000000001";
    expect((await request(app).post(`/me/interests/${id}/select`).set("Origin", ORIGIN).send({})).status).toBe(401);
    expect((await request(app).post(`/me/jobs/${id}/complete`).set("Origin", ORIGIN).send({})).status).toBe(401);
  });

  it("selecionar: oportunidade vira Contratada, o escolhido Aceito, os pendentes Não selecionados e quem retirou continua retirado", async () => {
    const { owner, job, workers } = await scenario(3);
    await post(workers[2]!.agent, `/me/interests/${workers[2]!.interestId}/withdraw`);

    const res = await post(owner.agent, `/me/interests/${workers[0]!.interestId}/select`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.interest).toEqual({ id: workers[0]!.interestId, status: "ACCEPTED" });

    const row = await jobRow(job.id);
    expect(row.status).toBe("HIRED");
    expect(row.selectedInterestId).toBe(workers[0]!.interestId);
    expect(row.hiredAt).not.toBeNull();
    expect(row.completedAt).toBeNull();
    expect(await interestStatuses(job.id)).toEqual({
      [workers[0]!.interestId]: "ACCEPTED",
      [workers[1]!.interestId]: "REJECTED",
      [workers[2]!.interestId]: "WITHDRAWN",
    });

    const mine = (await owner.agent.get(`/me/jobs/${job.id}`)).body.job;
    expect(mine).toMatchObject({ status: "HIRED", canComplete: true, canEdit: false, canCancel: false, interestCount: 0 });
    expect(mine.hiredWorkerName).toContain("Trab0");
    // O trabalhador escolhido e o não escolhido enxergam o próprio resultado.
    expect((await workers[0]!.agent.get("/me/interests")).body.interests[0].status).toBe("ACCEPTED");
    expect((await workers[1]!.agent.get("/me/interests")).body.interests[0].status).toBe("REJECTED");
    // Depois de contratar, ninguém mais demonstra interesse.
    const late = await signUp("Atrasada");
    expect((await post(late.agent, `/jobs/${job.id}/interest`)).status).toBe(409);
  });

  it("só a dona seleciona: outra pessoa, o próprio trabalhador e um estranho recebem 404 e nada muda", async () => {
    const { job, workers } = await scenario(2);
    const stranger = await signUp("Intruso");
    for (const who of [stranger, workers[0]!, workers[1]!]) {
      expect((await post(who.agent, `/me/interests/${workers[0]!.interestId}/select`)).status).toBe(404);
    }
    expect((await jobRow(job.id)).status).toBe("NEGOTIATING");
    expect(Object.values(await interestStatuses(job.id))).toEqual(["PENDING", "PENDING"]);
    expect((await post(stranger.agent, "/me/interests/nao-e-um-id/select")).status).toBe(404);
  });

  it("seleção única: duas seleções simultâneas, só uma vence e só um fica Aceito", async () => {
    const { owner, job, workers } = await scenario(4);
    const results = await Promise.all(workers.map((w) => post(owner.agent, `/me/interests/${w.interestId}/select`)));
    expect(results.every((r) => r.status !== 500)).toBe(true);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const statuses = Object.values(await interestStatuses(job.id));
    expect(statuses.filter((s) => s === "ACCEPTED")).toHaveLength(1);
    expect(statuses.filter((s) => s === "REJECTED")).toHaveLength(3);
    const row = await jobRow(job.id);
    expect(row.status).toBe("HIRED");
    expect(workers.map((w) => w.interestId)).toContain(row.selectedInterestId);
  });

  it("não seleciona de novo, nem interesse retirado, nem oportunidade cancelada ou vencida", async () => {
    const first = await scenario(2);
    await post(first.owner.agent, `/me/interests/${first.workers[0]!.interestId}/select`);
    const again = await post(first.owner.agent, `/me/interests/${first.workers[1]!.interestId}/select`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("not_selectable");
    expect((await post(first.owner.agent, `/me/interests/${first.workers[0]!.interestId}/select`)).status).toBe(409);

    const second = await scenario(2);
    await post(second.workers[0]!.agent, `/me/interests/${second.workers[0]!.interestId}/withdraw`);
    expect((await post(second.owner.agent, `/me/interests/${second.workers[0]!.interestId}/select`)).status).toBe(409);

    const third = await scenario(1);
    await post(third.owner.agent, `/me/jobs/${third.job.id}/cancel`);
    expect((await post(third.owner.agent, `/me/interests/${third.workers[0]!.interestId}/select`)).status).toBe(409);

    const fourth = await scenario(1);
    await prisma.job.update({ where: { id: fourth.job.id }, data: { expiresAt: new Date(Date.now() - HOUR) } });
    expect((await post(fourth.owner.agent, `/me/interests/${fourth.workers[0]!.interestId}/select`)).status).toBe(409);
    expect((await jobRow(fourth.job.id)).selectedInterestId).toBeNull();
  });

  it("não contrata quem retirou o interesse no meio da seleção, e a transação inteira é desfeita", async () => {
    const { owner, job, workers } = await scenario(2);
    const [leaving, staying] = [workers[0]!, workers[1]!];

    // Reproduz o intervalo entre a leitura e a escrita da seleção: a retirada fica gravada (ainda sem
    // commit) com a linha do interesse travada. A seleção já leu "pendente" e espera nessa trava.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockedFirst = new Promise<void>((resolve) => (locked = resolve));
    const withdrawing = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Interest" WHERE "id" = ${leaving.interestId} FOR UPDATE`;
      await tx.interest.update({ where: { id: leaving.interestId }, data: { status: "WITHDRAWN" } });
      locked();
      await gate;
    });
    await lockedFirst;
    // O supertest só envia quando é aguardado: o .then() inicia a requisição agora.
    const selecting = post(owner.agent, `/me/interests/${leaving.interestId}/select`).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 700)); // a seleção já está esperando a trava
    release();
    await withdrawing;
    const res = await selecting;

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe("not_selectable");
    const row = await jobRow(job.id);
    expect(row.status).toBe("NEGOTIATING");
    expect(row.selectedInterestId).toBeNull();
    expect(row.hiredAt).toBeNull();
    expect(await interestStatuses(job.id)).toEqual({
      [leaving.interestId]: "WITHDRAWN",
      [staying.interestId]: "PENDING",
    });
    expect(await prisma.interest.count({ where: { jobId: job.id, status: "ACCEPTED" } })).toBe(0);

    // A oportunidade segue utilizável: a dona ainda seleciona quem continua interessado.
    expect((await post(owner.agent, `/me/interests/${staying.interestId}/select`)).status).toBe(200);
    expect((await jobRow(job.id)).selectedInterestId).toBe(staying.interestId);
  });

  it("corrida entre selecionar e cancelar termina sempre coerente", async () => {
    const { owner, job, workers } = await scenario(1);
    const [select, cancel] = await Promise.all([
      post(owner.agent, `/me/interests/${workers[0]!.interestId}/select`),
      post(owner.agent, `/me/jobs/${job.id}/cancel`),
    ]);
    expect([select.status, cancel.status].every((s) => s !== 500)).toBe(true);
    const row = await jobRow(job.id);
    if (select.status === 200) {
      expect(row.status).toBe("HIRED");
      expect(cancel.status).toBe(409);
    } else {
      expect(row.status).toBe("CANCELLED");
      expect(row.selectedInterestId).toBeNull();
    }
  });

  it("concluir: só a dona, só depois de contratar, uma vez; os interesses não mudam", async () => {
    const { owner, job, workers } = await scenario(2);
    const stranger = await signUp("Intruso");
    expect((await post(owner.agent, `/me/jobs/${job.id}/complete`)).status).toBe(409); // ainda não contratou
    await post(owner.agent, `/me/interests/${workers[0]!.interestId}/select`);

    expect((await post(stranger.agent, `/me/jobs/${job.id}/complete`)).status).toBe(404);
    expect((await post(workers[0]!.agent, `/me/jobs/${job.id}/complete`)).status).toBe(404); // nem o contratado conclui
    expect((await jobRow(job.id)).status).toBe("HIRED");

    const before = await interestStatuses(job.id);
    const done = await post(owner.agent, `/me/jobs/${job.id}/complete`);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.job).toMatchObject({ status: "COMPLETED", canComplete: false, canEdit: false, canCancel: false });
    const row = await jobRow(job.id);
    expect(row.status).toBe("COMPLETED");
    expect(row.completedAt).not.toBeNull();
    expect(row.selectedInterestId).toBe(workers[0]!.interestId);
    expect(await interestStatuses(job.id)).toEqual(before);

    const twice = await post(owner.agent, `/me/jobs/${job.id}/complete`);
    expect(twice.status).toBe(409);
    expect(twice.body.message).toContain("já foi concluído");
    // Concluída continua sem aceitar interessados e sem poder ser cancelada ou editada.
    expect((await post(owner.agent, `/me/jobs/${job.id}/cancel`)).status).toBe(409);
    expect((await owner.agent.patch(`/me/jobs/${job.id}`).set("Origin", ORIGIN).send({ title: "Nova" })).status).toBe(409);
  });

  it("concluir não vale para rascunho, publicada, em negociação nem cancelada", async () => {
    const { owner, job } = await scenario(1); // em negociação
    expect((await post(owner.agent, `/me/jobs/${job.id}/complete`)).status).toBe(409);
    await post(owner.agent, `/me/jobs/${job.id}/cancel`);
    expect((await post(owner.agent, `/me/jobs/${job.id}/complete`)).status).toBe(409);
    expect((await jobRow(job.id)).status).toBe("CANCELLED");
  });

  it("o chat segue as regras: o escolhido continua conversando, quem não foi escolhido só lê", async () => {
    const { owner, workers } = await scenario(2);
    const [chosen, other] = [workers[0]!, workers[1]!];
    const chatChosen = (await post(chosen.agent, `/me/interests/${chosen.interestId}/conversation`)).body.conversation.id as string;
    const chatOther = (await post(other.agent, `/me/interests/${other.interestId}/conversation`)).body.conversation.id as string;
    await post(other.agent, `/me/conversations/${chatOther}/messages`, { content: "oi" });

    await post(owner.agent, `/me/interests/${chosen.interestId}/select`);
    expect((await post(owner.agent, `/me/conversations/${chatChosen}/messages`, { content: "Está contratado" })).status).toBe(201);
    expect((await post(chosen.agent, `/me/conversations/${chatChosen}/messages`, { content: "Obrigado" })).status).toBe(201);
    const blocked = await post(owner.agent, `/me/conversations/${chatOther}/messages`, { content: "Desculpe" });
    expect(blocked.status).toBe(409);
    expect((await other.agent.get(`/me/conversations/${chatOther}/messages`)).body.messages).toHaveLength(1);
  });
});
