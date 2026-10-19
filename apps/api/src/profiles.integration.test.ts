import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { publicProfileResponseSchema } from "@freelah/shared";
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

describe.skipIf(!testDatabaseUrl)("perfil público (integração)", () => {
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

  async function signUp() {
    counter += 1;
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `Pessoa ${counter}`,
      email: `perfil${counter}@exemplo.com`,
      password: "senha-segura-123",
      phone: "32999990000",
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, id: res.body.user.id as string };
  }

  const choose = (agent: ReturnType<typeof request.agent>, wantsWork: boolean, wantsToHire: boolean) =>
    agent.put("/me/preferences").set("Origin", ORIGIN).send({ wantsWork, wantsToHire }).expect(200);

  it("é público e devolve os papéis derivados das preferências", async () => {
    const worker = await signUp();
    const client = await signUp();
    const both = await signUp();
    await choose(worker.agent, true, false);
    await choose(client.agent, false, true);
    await choose(both.agent, true, true);

    const roles = async (id: string) => {
      const res = await request(app).get(`/profiles/${id}`);
      expect(res.status).toBe(200);
      return publicProfileResponseSchema.parse(res.body).profile.roles;
    };
    expect(await roles(worker.id)).toEqual(["PROFESSIONAL"]);
    expect(await roles(client.id)).toEqual(["CLIENT"]);
    expect(await roles(both.id)).toEqual(["PROFESSIONAL", "CLIENT"]);
  });

  it("quem ainda não escolheu preferências fica sem papéis", async () => {
    const person = await signUp();
    const res = await request(app).get(`/profiles/${person.id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.roles).toEqual([]);
  });

  it("não expõe telefone, e-mail nem as preferências em si", async () => {
    const person = await signUp();
    await choose(person.agent, true, true);
    const res = await request(app).get(`/profiles/${person.id}`);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("32999990000");
    expect(text).not.toContain("@exemplo.com");
    expect(text).not.toContain("wantsWork");
    expect(text).not.toContain("wantsToHire");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  describe("perfil próprio (GET e PATCH /me/profile)", () => {
    const patch = (agent: ReturnType<typeof request.agent>, body: unknown) =>
      agent.patch("/me/profile").set("Origin", ORIGIN).send(body as object);
    const valid = { roles: ["PROFESSIONAL"], headline: "Eletricista", bio: "Atendo a região.", city: "Leopoldina" };

    it("exige sessão", async () => {
      expect((await request(app).get("/me/profile")).status).toBe(401);
      expect((await request(app).patch("/me/profile").set("Origin", ORIGIN).send(valid)).status).toBe(401);
    });

    it("devolve o perfil da conta sem telefone nem e-mail", async () => {
      const me = await signUp();
      const res = await me.agent.get("/me/profile");
      expect(res.status).toBe(200);
      expect(publicProfileResponseSchema.parse(res.body).profile.id).toBe(me.id);
      expect(JSON.stringify(res.body)).not.toMatch(/32999990000|@exemplo\.com|phone|email/i);
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("salva ocupação, apresentação, cidade e papéis, e o perfil público passa a mostrá-los", async () => {
      const me = await signUp();
      const res = await patch(me.agent, { ...valid, roles: ["PROFESSIONAL", "CLIENT"] });
      expect(res.status).toBe(200);
      const pub = publicProfileResponseSchema.parse((await request(app).get(`/profiles/${me.id}`)).body).profile;
      expect([pub.headline, pub.bio, pub.city, pub.roles]).toEqual(["Eletricista", "Atendo a região.", "Leopoldina", ["PROFESSIONAL", "CLIENT"]]);
      // os papéis são as preferências do onboarding
      const prefs = await me.agent.get("/me/preferences");
      expect(prefs.body.preferences).toMatchObject({ wantsWork: true, wantsToHire: true });
    });

    it("trocar os papéis atualiza as preferências (uma só linha) e não toca no restante da conta", async () => {
      const me = await signUp();
      await choose(me.agent, true, true);
      await patch(me.agent, { ...valid, roles: ["CLIENT"] }).expect(200);
      expect(await prisma.userPreference.count({ where: { userId: me.id } })).toBe(1);
      const row = await prisma.userPreference.findUniqueOrThrow({ where: { userId: me.id } });
      expect([row.wantsWork, row.wantsToHire]).toEqual([false, true]);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect(user.phone).toBe("32999990000");
    });

    it("quem ainda não tinha preferências ganha a linha ao salvar", async () => {
      const me = await signUp();
      expect(await prisma.userPreference.count({ where: { userId: me.id } })).toBe(0);
      await patch(me.agent, valid).expect(200);
      expect(await prisma.userPreference.count({ where: { userId: me.id } })).toBe(1);
    });

    it("só altera a própria conta: o id nunca vem do corpo, e o perfil de outra pessoa não muda", async () => {
      const me = await signUp();
      const other = await signUp();
      await choose(other.agent, false, true);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
      expect((await patch(me.agent, { ...valid, id: other.id })).status).toBe(400);
      await patch(me.agent, valid).expect(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
      expect([after.headline, after.bio, after.city]).toEqual([before.headline, before.bio, before.city]);
      expect((await prisma.userPreference.findUniqueOrThrow({ where: { userId: other.id } })).wantsWork).toBe(false);
    });

    it.each([
      ["nenhum papel", { ...valid, roles: [] }, "roles"],
      ["papel desconhecido", { ...valid, roles: ["ADMIN"] }, "roles"],
      ["cidade vazia", { ...valid, city: " " }, "city"],
      ["ocupação longa demais", { ...valid, headline: "x".repeat(81) }, "headline"],
      ["apresentação longa demais", { ...valid, bio: "x".repeat(601) }, "bio"],
    ])("recusa %s (400) sem gravar nada", async (_name, body, field) => {
      const me = await signUp();
      await patch(me.agent, valid).expect(200);
      const res = await patch(me.agent, body);
      expect(res.status).toBe(400);
      expect(res.body.fields[field]).toBeTruthy();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect([user.headline, user.bio, user.city]).toEqual(["Eletricista", "Atendo a região.", "Leopoldina"]);
    });

    it("recusa campos que não são editáveis (telefone, e-mail, foto)", async () => {
      const me = await signUp();
      for (const extra of [{ phone: "32911112222" }, { email: "novo@exemplo.com" }, { avatarUrl: "x" }, { isDemo: true }]) {
        expect((await patch(me.agent, { ...valid, ...extra })).status).toBe(400);
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect([user.phone, user.isDemo]).toEqual(["32999990000", false]);
    });

    it("ocupação e apresentação vazias viram nulas", async () => {
      const me = await signUp();
      await patch(me.agent, valid).expect(200);
      await patch(me.agent, { ...valid, headline: "  ", bio: "" }).expect(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
      expect([user.headline, user.bio]).toEqual([null, null]);
    });

    it("o banco também limita ocupação (80) e apresentação (600)", async () => {
      const me = await signUp();
      await expect(prisma.user.update({ where: { id: me.id }, data: { headline: "x".repeat(81) } })).rejects.toThrow();
      await expect(prisma.user.update({ where: { id: me.id }, data: { bio: "x".repeat(601) } })).rejects.toThrow();
      await prisma.user.update({ where: { id: me.id }, data: { headline: "x".repeat(80), bio: "x".repeat(600) } });
    });
  });

  it("perfil inexistente: 404", async () => {
    expect((await request(app).get("/profiles/nao-existe")).status).toBe(404);
  });
});
