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

describe("loadConfig", () => {
  it("usa valores padrão e separa as origens por vírgula", () => {
    const config = loadConfig({ CORS_ORIGINS: "http://a.test, http://b.test" });
    expect(config.PORT).toBe(3333);
    expect(config.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("rejeita uma porta inválida", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/inválidas/);
  });
});
