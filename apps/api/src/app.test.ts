import request from "supertest";
import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@freelah/shared";
import { createApp } from "./app";
import { loadConfig } from "./config";

const app = createApp({ CORS_ORIGINS: ["http://localhost:8081"] });

describe("GET /health", () => {
  it("responde 200 com o contrato compartilhado", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("libera CORS para a origem configurada", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:8081");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("não libera CORS para origens desconhecidas", async () => {
    const res = await request(app).get("/health").set("Origin", "http://evil.test");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rotas inexistentes", () => {
  it("respondem 404 em JSON", async () => {
    const res = await request(app).get("/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

const baseEnv = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  it("usa as origens padrão do app e do navegador", () => {
    const config = loadConfig(baseEnv);
    expect(config.TRUSTED_ORIGINS).toEqual(["http://localhost:8081", "freelah://"]);
    expect(config.BETTER_AUTH_URL).toBe("http://localhost:3333");
  });

  it("exige o banco e um segredo de autenticação forte", () => {
    expect(() => loadConfig({ BETTER_AUTH_SECRET: "x".repeat(32) })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: baseEnv.DATABASE_URL })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadConfig({ ...baseEnv, BETTER_AUTH_SECRET: "curto" })).toThrow(/32 caracteres/);
    expect(() => loadConfig({ ...baseEnv, DATABASE_URL: "mysql://x" })).toThrow(/postgresql/);
  });

  it("usa valores padrão e separa as origens por vírgula", () => {
    const config = loadConfig({ ...baseEnv, CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(config.PORT).toBe(3333);
    expect(config.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("rejeita uma porta inválida", () => {
    expect(() => loadConfig({ ...baseEnv, PORT: "abc" })).toThrow(/inválidas/);
  });
});
