import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { meResponseSchema } from "@freelah/shared";
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

const signUpBody = {
  name: "João Silva",
  email: "joao@exemplo.com",
  password: "senha-segura-123",
  phone: "(32) 99999-0000",
  city: "Cataguases",
  adultConfirmed: true,
};

describe.skipIf(!testDatabaseUrl)("autenticação (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;

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

  const post = (path: string, body: object) =>
    request(app).post(path).set("Origin", ORIGIN).send(body);

  it("cadastra, guarda só os dígitos do telefone e registra a maioridade", async () => {
    const before = Date.now();
    const res = await post("/api/auth/sign-up/email", signUpBody);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("joao@exemplo.com");
    expect(res.body.user.phone).toBe("32999990000");
    expect(String(res.headers["set-cookie"])).toMatch(/HttpOnly/i);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "joao@exemplo.com" } });
    expect(user.adultConfirmedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(user.isDemo).toBe(false);
    expect(user.city).toBe("Cataguases");
  });

  it("nunca guarda a senha em texto puro", async () => {
    await post("/api/auth/sign-up/email", signUpBody);
    const account = await prisma.account.findFirstOrThrow();
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain("senha-segura-123");
  });

  it("recusa o cadastro sem a declaração de 18 anos ou mais", async () => {
    for (const adultConfirmed of [false, undefined, "true", 1]) {
      const res = await post("/api/auth/sign-up/email", { ...signUpBody, adultConfirmed });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ADULT_CONFIRMATION_REQUIRED");
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("recusa dados incompletos ou inválidos", async () => {
    const cases = [
      { ...signUpBody, phone: undefined },
      { ...signUpBody, phone: "123" },
      { ...signUpBody, city: "" },
      { ...signUpBody, password: "curta" },
      { ...signUpBody, email: "sem-arroba" },
    ];
    for (const body of cases) {
      const res = await post("/api/auth/sign-up/email", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_SIGN_UP_DATA");
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("recusa e-mail repetido, ignorando maiúsculas", async () => {
    expect((await post("/api/auth/sign-up/email", signUpBody)).status).toBe(200);
    const again = await post("/api/auth/sign-up/email", {
      ...signUpBody,
      email: "JOAO@exemplo.com",
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count()).toBe(1);
  });

  it("não deixa o cliente definir campos controlados pelo servidor", async () => {
    const res = await post("/api/auth/sign-up/email", {
      ...signUpBody,
      adultConfirmedAt: "1990-01-01T00:00:00.000Z",
      isDemo: true,
    });
    if (res.status === 200) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "joao@exemplo.com" } });
      expect(user.adultConfirmedAt.getFullYear()).toBeGreaterThanOrEqual(new Date().getFullYear());
      expect(user.isDemo).toBe(false);
    } else {
      expect(await prisma.user.count()).toBe(0);
    }
  });

  it("entra com a senha certa e recusa a errada", async () => {
    await post("/api/auth/sign-up/email", signUpBody);
    const wrong = await post("/api/auth/sign-in/email", {
      email: "joao@exemplo.com",
      password: "senha-errada-123",
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    const unknown = await post("/api/auth/sign-in/email", {
      email: "ninguem@exemplo.com",
      password: "senha-segura-123",
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    const ok = await post("/api/auth/sign-in/email", {
      email: "joao@exemplo.com",
      password: "senha-segura-123",
    });
    expect(ok.status).toBe(200);
  });

  it("protege GET /me: 401 sem sessão, perfil do próprio usuário com sessão, 401 após sair", async () => {
    expect((await request(app).get("/me")).status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send(signUpBody);

    const me = await agent.get("/me");
    expect(me.status).toBe(200);
    expect(meResponseSchema.safeParse(me.body).success).toBe(true);
    expect(me.body).toMatchObject({
      email: "joao@exemplo.com",
      phone: "32999990000",
      city: "Cataguases",
    });
    expect(me.body).not.toHaveProperty("password");

    const out = await agent.post("/api/auth/sign-out").set("Origin", ORIGIN).send({});
    expect(out.status).toBe(200);
    expect((await agent.get("/me")).status).toBe(401);
  });

  it("recusa cookie de sessão inventado", async () => {
    const res = await request(app)
      .get("/me")
      .set("Cookie", "better-auth.session_token=invalido.invalido");
    expect(res.status).toBe(401);
  });

  it("com sessão ativa, recusa ações vindas de outra origem e mantém a sessão", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send(signUpBody);

    const forged = await agent.post("/api/auth/sign-out").set("Origin", "http://evil.test").send({});
    expect(forged.status).toBe(403);
    expect((await agent.get("/me")).status).toBe(200);
  });

  it("bloqueia login disparado por navegação vinda de outro site (login CSRF)", async () => {
    await post("/api/auth/sign-up/email", signUpBody);
    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Sec-Fetch-Site", "cross-site")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .send({ email: "joao@exemplo.com", password: "senha-segura-123" });
    expect(res.status).toBe(403);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("não libera CORS com credenciais para outra origem", async () => {
    const res = await request(app)
      .options("/api/auth/sign-in/email")
      .set("Origin", "http://evil.test")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("recusa cadastro vindo de uma origem não autorizada", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://evil.test")
      .send(signUpBody);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count()).toBe(0);
  });
});
