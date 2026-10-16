import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AT_LEAST_ONE_PREFERENCE_MESSAGE, preferencesResponseSchema } from "@freelah/shared";
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

describe.skipIf(!testDatabaseUrl)("preferências de uso (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
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
  });

  /** Cria uma conta de verdade e devolve um agente HTTP já com a sessão (cookie). */
  async function signUp(name = "Pessoa") {
    counter += 1;
    const agent = request.agent(app);
    const email = `pessoa${counter}@exemplo.com`;
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `${name} ${counter}`,
      email,
      password: "senha-segura-123",
      phone: "32999990000",
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, email, id: res.body.user.id as string };
  }

  const put = (agent: ReturnType<typeof request.agent>, body: unknown) =>
    agent.put("/me/preferences").set("Origin", ORIGIN).send(body as object);

  describe("autenticação", () => {
    it("recusa GET e PUT sem sessão", async () => {
      expect((await request(app).get("/me/preferences")).status).toBe(401);
      const res = await request(app)
        .put("/me/preferences")
        .send({ wantsWork: true, wantsToHire: false });
      expect(res.status).toBe(401);
      expect(await prisma.userPreference.count()).toBe(0);
    });

    it("recusa cookie de sessão inventado", async () => {
      const res = await request(app)
        .get("/me/preferences")
        .set("Cookie", "better-auth.session_token=invalido.invalido");
      expect(res.status).toBe(401);
    });

    it("não deixa o navegador guardar a resposta em cache", async () => {
      const { agent } = await signUp();
      const res = await agent.get("/me/preferences");
      expect(res.headers["cache-control"]).toBe("no-store");
    });
  });

  describe("leitura", () => {
    it("devolve preferences nulas para a conta que ainda não escolheu", async () => {
      const { agent } = await signUp();
      const res = await agent.get("/me/preferences");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ preferences: null });
      expect(preferencesResponseSchema.safeParse(res.body).success).toBe(true);
    });
  });

  describe("gravação e persistência", () => {
    it.each([
      { wantsWork: true, wantsToHire: false },
      { wantsWork: false, wantsToHire: true },
      { wantsWork: true, wantsToHire: true },
    ])("grava %j e devolve as preferências salvas", async (body) => {
      const { agent, id } = await signUp();
      const res = await put(agent, body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ preferences: body });
      expect(preferencesResponseSchema.safeParse(res.body).success).toBe(true);

      const row = await prisma.userPreference.findUniqueOrThrow({ where: { userId: id } });
      expect(row).toMatchObject(body);
      expect((await agent.get("/me/preferences")).body).toEqual({ preferences: body });
    });

    it("atualiza a mesma linha em vez de criar outra", async () => {
      const { agent, id } = await signUp();
      await put(agent, { wantsWork: true, wantsToHire: false });
      await put(agent, { wantsWork: false, wantsToHire: true });
      await put(agent, { wantsWork: true, wantsToHire: true });

      expect(await prisma.userPreference.count({ where: { userId: id } })).toBe(1);
      expect((await agent.get("/me/preferences")).body).toEqual({
        preferences: { wantsWork: true, wantsToHire: true },
      });
    });

    it("permite desativar uma opção mantendo a outra e reativá-la depois", async () => {
      const { agent } = await signUp();
      await put(agent, { wantsWork: true, wantsToHire: true });
      expect((await put(agent, { wantsWork: true, wantsToHire: false })).status).toBe(200);
      expect((await put(agent, { wantsWork: true, wantsToHire: true })).status).toBe(200);
    });

    it("mantém as preferências depois de sair e entrar de novo", async () => {
      const { agent, email } = await signUp();
      await put(agent, { wantsWork: false, wantsToHire: true });
      await agent.post("/api/auth/sign-out").set("Origin", ORIGIN).send({});
      expect((await agent.get("/me/preferences")).status).toBe(401);

      const login = await agent
        .post("/api/auth/sign-in/email")
        .set("Origin", ORIGIN)
        .send({ email, password: "senha-segura-123" });
      expect(login.status).toBe(200);
      expect((await agent.get("/me/preferences")).body).toEqual({
        preferences: { wantsWork: false, wantsToHire: true },
      });
    });

    it("não cria linhas duplicadas com gravações simultâneas na primeira escolha", async () => {
      const { agent, id } = await signUp();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          put(agent, { wantsWork: i % 2 === 0, wantsToHire: true }),
        ),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.userPreference.count({ where: { userId: id } })).toBe(1);
    });
  });

  describe("validação no servidor", () => {
    it("recusa as duas opções desativadas e não altera o que já estava salvo", async () => {
      const { agent, id } = await signUp();
      await put(agent, { wantsWork: true, wantsToHire: false });

      const res = await put(agent, { wantsWork: false, wantsToHire: false });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: "at_least_one_required",
        message: AT_LEAST_ONE_PREFERENCE_MESSAGE,
      });
      const row = await prisma.userPreference.findUniqueOrThrow({ where: { userId: id } });
      expect(row).toMatchObject({ wantsWork: true, wantsToHire: false });
    });

    it("recusa as duas desativadas na primeira escolha, sem criar linha", async () => {
      const { agent, id } = await signUp();
      const res = await put(agent, { wantsWork: false, wantsToHire: false });
      expect(res.status).toBe(400);
      expect(await prisma.userPreference.count({ where: { userId: id } })).toBe(0);
    });

    it("recusa campos desconhecidos, inclusive userId", async () => {
      const { agent, id } = await signUp();
      const other = await signUp("Outra");
      for (const extra of [{ userId: other.id }, { id: other.id }, { isAdmin: true }]) {
        const res = await put(agent, { wantsWork: true, wantsToHire: false, ...extra });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("validation_error");
        expect(res.body.message).toMatch(/^Dados inválidos/);
      }
      expect(await prisma.userPreference.count()).toBe(0);
      expect(await prisma.userPreference.count({ where: { userId: id } })).toBe(0);
    });

    it("recusa corpo ausente, incompleto ou com tipos errados", async () => {
      const { agent } = await signUp();
      const bodies: unknown[] = [
        {},
        { wantsWork: true },
        { wantsToHire: true },
        { wantsWork: "true", wantsToHire: false },
        { wantsWork: 1, wantsToHire: 0 },
        { wantsWork: null, wantsToHire: true },
        [],
      ];
      for (const body of bodies) {
        const res = await put(agent, body);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("validation_error");
        expect(res.body.message).toMatch(/^Dados inválidos/);
      }
      const empty = await agent.put("/me/preferences").set("Origin", ORIGIN);
      expect(empty.status).toBe(400);
      expect(empty.body.message).toMatch(/^Dados inválidos/);
      expect(await prisma.userPreference.count()).toBe(0);
    });
  });

  describe("isolamento entre usuários", () => {
    it("cada pessoa lê e altera somente as próprias preferências", async () => {
      const ana = await signUp("Ana");
      const bia = await signUp("Bia");

      await put(ana.agent, { wantsWork: true, wantsToHire: false });
      expect((await bia.agent.get("/me/preferences")).body).toEqual({ preferences: null });

      await put(bia.agent, { wantsWork: false, wantsToHire: true });
      expect((await ana.agent.get("/me/preferences")).body).toEqual({
        preferences: { wantsWork: true, wantsToHire: false },
      });
      expect((await bia.agent.get("/me/preferences")).body).toEqual({
        preferences: { wantsWork: false, wantsToHire: true },
      });

      await put(ana.agent, { wantsWork: true, wantsToHire: true });
      const bianRow = await prisma.userPreference.findUniqueOrThrow({ where: { userId: bia.id } });
      expect(bianRow).toMatchObject({ wantsWork: false, wantsToHire: true });
      expect(await prisma.userPreference.count()).toBe(2);
    });
  });

  describe("preferências não são permissões nem apagam dados", () => {
    it("alterar as preferências não muda publicações, interesses, conversas nem o perfil", async () => {
      const owner = await signUp("Contratante");
      const worker = await signUp("Trabalhador");
      const category = await prisma.category.create({
        data: { slug: "construcao-civil", name: "Construção Civil" },
      });
      const job = await prisma.job.create({
        data: {
          title: "Pintura de sala",
          description: "Pintar uma sala de 20 m².",
          categoryId: category.id,
          ownerId: owner.id,
          city: "Cataguases",
          state: "MG",
          scheduledDate: new Date("2026-12-12"),
          startTime: "08:00",
          proposedPriceCents: 20000,
          expiresAt: new Date("2026-12-10T00:00:00Z"),
          status: "PUBLISHED",
        },
      });
      const interest = await prisma.interest.create({
        data: { jobId: job.id, workerId: worker.id },
      });
      const conversation = await prisma.conversation.create({
        data: { jobId: job.id, interestId: interest.id },
      });
      await prisma.message.create({
        data: { conversationId: conversation.id, senderId: worker.id, content: "Olá!" },
      });

      const snapshot = async () => ({
        job: await prisma.job.findUniqueOrThrow({ where: { id: job.id } }),
        interest: await prisma.interest.findUniqueOrThrow({ where: { id: interest.id } }),
        conversation: await prisma.conversation.findUniqueOrThrow({
          where: { id: conversation.id },
        }),
        messages: await prisma.message.findMany(),
        users: await prisma.user.findMany({ orderBy: { id: "asc" } }),
      });
      const before = await snapshot();

      // O contratante escolhe só "encontrar trabalho" e o trabalhador só "contratar":
      // ainda assim ninguém perde nada.
      await put(owner.agent, { wantsWork: true, wantsToHire: false });
      await put(worker.agent, { wantsWork: false, wantsToHire: true });
      await put(owner.agent, { wantsWork: false, wantsToHire: true });

      expect(await snapshot()).toEqual(before);
    });

    it("quem prefere só encontrar trabalho continua autenticado e com o perfil intacto", async () => {
      const { agent } = await signUp();
      await put(agent, { wantsWork: true, wantsToHire: false });
      const me = await agent.get("/me");
      expect(me.status).toBe(200);
      expect(me.body.city).toBe("Cataguases");
    });
  });
});
