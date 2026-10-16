import { describe, expect, it } from "vitest";
import {
  AT_LEAST_ONE_PREFERENCE_MESSAGE,
  hasAtLeastOnePreference,
  preferencesResponseSchema,
  updatePreferencesSchema,
} from "./preferences";

describe("updatePreferencesSchema", () => {
  it.each([
    { wantsWork: true, wantsToHire: false },
    { wantsWork: false, wantsToHire: true },
    { wantsWork: true, wantsToHire: true },
  ])("aceita %j", (body) => {
    expect(updatePreferencesSchema.safeParse(body).success).toBe(true);
  });

  it("recusa as duas desativadas, com a mensagem em português", () => {
    const result = updatePreferencesSchema.safeParse({ wantsWork: false, wantsToHire: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(AT_LEAST_ONE_PREFERENCE_MESSAGE);
  });

  it("recusa campos desconhecidos, inclusive userId", () => {
    for (const extra of [{ userId: "outra-pessoa" }, { isAdmin: true }, { id: "x" }]) {
      const result = updatePreferencesSchema.safeParse({
        wantsWork: true,
        wantsToHire: false,
        ...extra,
      });
      expect(result.success).toBe(false);
    }
  });

  it("recusa campos ausentes e valores que não são booleanos", () => {
    for (const body of [
      {},
      { wantsWork: true },
      { wantsToHire: true },
      { wantsWork: "true", wantsToHire: false },
      { wantsWork: 1, wantsToHire: 0 },
      { wantsWork: null, wantsToHire: true },
      undefined,
      null,
      "texto",
    ]) {
      expect(updatePreferencesSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("hasAtLeastOnePreference", () => {
  it("é verdadeira se qualquer uma das opções estiver ativa", () => {
    expect(hasAtLeastOnePreference({ wantsWork: true, wantsToHire: false })).toBe(true);
    expect(hasAtLeastOnePreference({ wantsWork: false, wantsToHire: true })).toBe(true);
    expect(hasAtLeastOnePreference({ wantsWork: false, wantsToHire: false })).toBe(false);
  });
});

describe("preferencesResponseSchema", () => {
  it("aceita preferências nulas (conta que ainda não escolheu) e preenchidas", () => {
    expect(preferencesResponseSchema.safeParse({ preferences: null }).success).toBe(true);
    expect(
      preferencesResponseSchema.safeParse({
        preferences: { wantsWork: true, wantsToHire: false },
      }).success,
    ).toBe(true);
  });

  it("não aceita a chave preferences ausente", () => {
    expect(preferencesResponseSchema.safeParse({}).success).toBe(false);
  });
});
