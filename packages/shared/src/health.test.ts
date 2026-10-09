import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("aceita uma resposta válida", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "ok",
      service: "freelah-api",
      time: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita uma resposta com status diferente de ok", () => {
    const parsed = healthResponseSchema.safeParse({
      status: "down",
      service: "freelah-api",
      time: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
