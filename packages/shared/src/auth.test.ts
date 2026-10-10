import { describe, expect, it } from "vitest";
import { meResponseSchema, phoneSchema, signInSchema, signUpSchema } from "./auth";

const valid = {
  name: "João Silva",
  email: "joao@exemplo.com",
  password: "senha-segura-123",
  phone: "(32) 99999-0000",
  city: "Cataguases",
  adultConfirmed: true,
};

function firstMessage(input: unknown): string | undefined {
  const result = signUpSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("signUpSchema", () => {
  it("aceita um cadastro completo e guarda só os dígitos do telefone", () => {
    const result = signUpSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBe("32999990000");
  });

  it("exige a declaração de 18 anos ou mais", () => {
    expect(firstMessage({ ...valid, adultConfirmed: false })).toMatch(/18 anos/);
    expect(firstMessage({ ...valid, adultConfirmed: undefined })).toMatch(/18 anos/);
    expect(firstMessage({ ...valid, adultConfirmed: "true" })).toMatch(/18 anos/);
  });

  it("rejeita senha curta, e-mail inválido e campos vazios", () => {
    expect(firstMessage({ ...valid, password: "curta" })).toMatch(/pelo menos 8/);
    expect(firstMessage({ ...valid, email: "sem-arroba" })).toMatch(/e-mail válido/);
    expect(firstMessage({ ...valid, name: " " })).toMatch(/nome/);
    expect(firstMessage({ ...valid, city: "" })).toMatch(/cidade/);
    expect(firstMessage({ ...valid, phone: undefined })).toMatch(/telefone/);
  });
});

describe("phoneSchema", () => {
  it.each(["3233334444", "32999990000", "(32) 3333-4444", "32 9 9999-0000"])("aceita %s", (v) => {
    expect(phoneSchema.safeParse(v).success).toBe(true);
  });

  it.each(["", "12345", "999990000", "329999900001", "telefone"])("recusa %s", (v) => {
    expect(phoneSchema.safeParse(v).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("exige e-mail válido e senha preenchida", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "x", password: "x" }).success).toBe(false);
  });
});

describe("meResponseSchema", () => {
  it("aceita avatar nulo", () => {
    const body = {
      id: "1",
      name: "João",
      email: "a@b.com",
      phone: "32999990000",
      city: "X",
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    };
    expect(meResponseSchema.safeParse(body).success).toBe(true);
  });
});
