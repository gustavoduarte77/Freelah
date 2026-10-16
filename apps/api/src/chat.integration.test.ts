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

describe.skipIf(!testDatabaseUrl)("chat (integração)", () => {
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

  /** Dona + trabalhador com interesse registrado e a conversa aberta. */
  async function scenario() {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
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
    const interest = (await post(worker.agent, `/jobs/${job.id}/interest`)).body.interest as { id: string };
    const opened = await post(worker.agent, `/me/interests/${interest.id}/conversation`);
    expect(opened.status).toBe(201);
    return { owner, worker, job, interest, conversationId: opened.body.conversation.id as string };
  }

  it("exige sessão em todas as rotas (401)", async () => {
    const id = "01990000-0000-7000-8000-000000000001";
    for (const [method, path] of [
      ["post", `/me/interests/${id}/conversation`],
      ["get", "/me/conversations"],
      ["get", `/me/conversations/${id}`],
      ["get", `/me/conversations/${id}/messages`],
      ["post", `/me/conversations/${id}/messages`],
    ] as const) {
      expect((await request(app)[method](path).set("Origin", ORIGIN).send({})).status, `${method} ${path}`).toBe(401);
    }
  });

  it("abrir: os dois participantes chegam na MESMA conversa; terceiros não; pedidos simultâneos geram uma só", async () => {
    const { owner, worker, interest, conversationId } = await scenario();
    const stranger = await signUp("Intruso");
    const byOwner = await post(owner.agent, `/me/interests/${interest.id}/conversation`);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.conversation.id).toBe(conversationId);
    expect((await post(stranger.agent, `/me/interests/${interest.id}/conversation`)).status).toBe(404);

    const results = await Promise.all(Array.from({ length: 6 }, () => post(worker.agent, `/me/interests/${interest.id}/conversation`)));
    expect(results.every((r) => r.body.conversation.id === conversationId)).toBe(true);
    expect(await prisma.conversation.count()).toBe(1);
    expect(await prisma.conversationParticipant.count({ where: { conversationId } })).toBe(2);
  });

  it("os dois enviam e leem em ordem; as mensagens persistem; 'after' devolve só as novas", async () => {
    const { owner, worker, conversationId } = await scenario();
    const send = (who: { agent: Agent }, content: string) => post(who.agent, `/me/conversations/${conversationId}/messages`, { content });
    const first = await send(worker, "Olá, posso fazer o serviço.");
    expect(first.status).toBe(201);
    expect(first.body.message).toMatchObject({ fromMe: true, content: "Olá, posso fazer o serviço." });
    expect((await send(owner, "  Ótimo! Pode vir às 8h.  ")).status).toBe(201);
    expect((await send(worker, "Combinado.")).status).toBe(201);

    const asWorker = await worker.agent.get(`/me/conversations/${conversationId}/messages`);
    expect(asWorker.body.messages.map((m: { content: string; fromMe: boolean }) => [m.content, m.fromMe])).toEqual([
      ["Olá, posso fazer o serviço.", true],
      ["Ótimo! Pode vir às 8h.", false],
      ["Combinado.", true],
    ]);
    const asOwner = await owner.agent.get(`/me/conversations/${conversationId}/messages`);
    expect(asOwner.body.messages.map((m: { fromMe: boolean }) => m.fromMe)).toEqual([false, true, false]);

    // Só as novas, depois do marcador.
    const cursor = asWorker.body.cursor as string;
    expect((await worker.agent.get(`/me/conversations/${conversationId}/messages`).query({ after: cursor })).body.messages).toEqual([]);
    await send(owner, "Chego cedo.");
    const news = await worker.agent.get(`/me/conversations/${conversationId}/messages`).query({ after: cursor });
    expect(news.body.messages.map((m: { content: string }) => m.content)).toEqual(["Chego cedo."]);
    expect((await worker.agent.get(`/me/conversations/${conversationId}/messages`).query({ after: "lixo" })).status).toBe(400);

    expect(await prisma.message.count({ where: { conversationId } })).toBe(4);
  });

  it("quem não participa não lê, não envia e não vê a conversa na lista (404), e nada é gravado", async () => {
    const { conversationId, owner } = await scenario();
    const stranger = await signUp("Intruso");
    expect((await stranger.agent.get(`/me/conversations/${conversationId}`)).status).toBe(404);
    expect((await stranger.agent.get(`/me/conversations/${conversationId}/messages`)).status).toBe(404);
    const sent = await post(stranger.agent, `/me/conversations/${conversationId}/messages`, { content: "invasão" });
    expect(sent.status).toBe(404);
    expect(await prisma.message.count()).toBe(0);
    expect((await stranger.agent.get("/me/conversations")).body.conversations).toEqual([]);
    expect((await owner.agent.get("/me/conversations")).body.conversations).toHaveLength(1);
  });

  it("valida a mensagem (vazia, longa, campos extras) e não vaza telefone, e-mail nem ids de pessoas", async () => {
    const { worker, owner, conversationId } = await scenario();
    const path = `/me/conversations/${conversationId}/messages`;
    for (const payload of [{ content: "   " }, { content: "x".repeat(2001) }, {}, { content: 5 }, { content: "oi", senderId: "outro" }]) {
      expect((await post(worker.agent, path, payload)).status, JSON.stringify(payload).slice(0, 40)).toBe(400);
    }
    await post(worker.agent, path, { content: "Mensagem válida" });
    expect(await prisma.message.count()).toBe(1);
    const raw = JSON.stringify([
      (await owner.agent.get(path)).body,
      (await owner.agent.get(`/me/conversations/${conversationId}`)).body,
      (await owner.agent.get("/me/conversations")).body,
    ]);
    expect(raw).not.toContain("32999990000");
    expect(raw).not.toContain("@exemplo.com");
    expect(raw).not.toContain(worker.id);
    expect(raw).not.toContain(owner.id);
  });

  it("interesse retirado ou oportunidade cancelada: a conversa continua legível, mas não aceita envio", async () => {
    const { owner, worker, interest, conversationId, job } = await scenario();
    const path = `/me/conversations/${conversationId}/messages`;
    await post(worker.agent, path, { content: "antes" });

    await post(worker.agent, `/me/interests/${interest.id}/withdraw`);
    const blocked = await post(worker.agent, path, { content: "depois" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("not_available");
    expect((await owner.agent.get(`/me/conversations/${conversationId}`)).body.conversation.canSend).toBe(false);
    expect((await owner.agent.get(path)).body.messages).toHaveLength(1);

    await post(worker.agent, `/jobs/${job.id}/interest`); // volta a demonstrar interesse
    expect((await post(owner.agent, path, { content: "de volta" })).status).toBe(201);
    await post(owner.agent, `/me/jobs/${job.id}/cancel`);
    expect((await post(owner.agent, path, { content: "cancelada" })).status).toBe(409);
    expect((await worker.agent.get(path)).body.messages).toHaveLength(2);
  });

  it("não cria conversa nova para interesse retirado", async () => {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const service = Date.now() + 10 * DAY;
    const job = (
      await post(owner.agent, "/me/jobs", {
        title: "Capina",
        description: "Capinar o quintal da casa inteira.",
        categoryId,
        city: "Cataguases",
        state: "MG",
        scheduledDate: brasiliaDay(service),
        startTime: "08:00",
        proposedPriceCents: 10000,
        expiresAt: new Date(service - DAY).toISOString(),
        publish: true,
      })
    ).body.job as { id: string };
    const interest = (await post(worker.agent, `/jobs/${job.id}/interest`)).body.interest as { id: string };
    await post(worker.agent, `/me/interests/${interest.id}/withdraw`);
    expect((await post(worker.agent, `/me/interests/${interest.id}/conversation`)).status).toBe(409);
    expect(await prisma.conversation.count()).toBe(0);
  });
});
