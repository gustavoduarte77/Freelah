import { describe, expect, it } from "vitest";
import {
  databaseIdentity,
  databaseName,
  findTestDatabaseProblem,
  isLocalDatabaseUrl,
  isPoolerUrl,
  isValidPostgresUrl,
} from "../scripts/db-safety";

const LOCAL_DEV = "postgresql://u:p@127.0.0.1:54329/freelah_local?sslmode=disable";
const LOCAL_TEST = "postgresql://u:p@127.0.0.1:54329/freelah_test?sslmode=disable";
const NEON_PROD = "postgresql://u:p@ep-prod-123.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const NEON_PROD_POOLED = "postgresql://u:p@ep-prod-123-pooler.sa-east-1.aws.neon.tech/neondb";
const NEON_TEST = "postgresql://u:p@ep-test-456.sa-east-1.aws.neon.tech/neondb?sslmode=require";

describe("isLocalDatabaseUrl", () => {
  it.each([
    "postgresql://u:p@127.0.0.1:54329/freelah_local",
    "postgresql://u:p@localhost:5432/x",
    "postgresql://u:p@[::1]:5432/x",
  ])("aceita %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it.each([
    NEON_PROD,
    NEON_PROD_POOLED,
    "postgresql://u:p@127.0.0.1.evil.test/x",
    "postgresql://u:p@localhost.evil.test/x",
    "isto não é uma url",
    "",
  ])("recusa %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  it("extrai o nome do banco", () => {
    expect(databaseName(LOCAL_TEST)).toBe("freelah_test");
  });
});

describe("isValidPostgresUrl e isPoolerUrl", () => {
  it("valida o formato da URL", () => {
    expect(isValidPostgresUrl(NEON_PROD)).toBe(true);
    expect(isValidPostgresUrl("mysql://u:p@host/db")).toBe(false);
    expect(isValidPostgresUrl("postgresql://u:p@host")).toBe(false);
    expect(isValidPostgresUrl("")).toBe(false);
    expect(isValidPostgresUrl("postgresql://")).toBe(false);
  });

  it("detecta conexão com pooler só no endereço", () => {
    expect(isPoolerUrl(NEON_PROD_POOLED)).toBe(true);
    expect(isPoolerUrl(NEON_PROD)).toBe(false);
    expect(isPoolerUrl("postgresql://u:p@host.test/meu-pooler-db")).toBe(false);
  });
});

describe("databaseIdentity", () => {
  it("diferencia bancos locais pelo nome e bancos remotos pelo branch", () => {
    expect(databaseIdentity(LOCAL_DEV)).not.toBe(databaseIdentity(LOCAL_TEST));
    expect(databaseIdentity(NEON_PROD)).not.toBe(databaseIdentity(NEON_TEST));
  });

  it("trata a conexão direta e a com pooler do mesmo branch como o mesmo banco", () => {
    expect(databaseIdentity(NEON_PROD)).toBe(databaseIdentity(NEON_PROD_POOLED));
  });

  it("não inclui usuário, senha nem parâmetros", () => {
    expect(databaseIdentity(NEON_PROD)).not.toMatch(/u:p|sslmode/);
  });
});

describe("findTestDatabaseProblem", () => {
  const others = [
    { file: ".env", url: LOCAL_DEV },
    { file: ".env.neon", url: NEON_PROD },
  ];

  it("aceita o banco de teste local distinto dos demais", () => {
    expect(findTestDatabaseProblem(LOCAL_TEST, false, others)).toBeUndefined();
  });

  it("recusa o mesmo banco do .env", () => {
    expect(findTestDatabaseProblem(LOCAL_DEV, false, others)).toMatch(/\.env\b/);
  });

  it("recusa banco remoto sem a permissão explícita", () => {
    expect(findTestDatabaseProblem(NEON_TEST, false, others)).toMatch(/ALLOW_REMOTE_TEST_DB/);
  });

  it("aceita um branch remoto diferente quando a permissão é explícita", () => {
    expect(findTestDatabaseProblem(NEON_TEST, true, others)).toBeUndefined();
  });

  it("recusa o banco do .env.neon mesmo com a permissão explícita", () => {
    expect(findTestDatabaseProblem(NEON_PROD, true, others)).toMatch(/\.env\.neon/);
    expect(findTestDatabaseProblem(NEON_PROD_POOLED, true, others)).toMatch(/\.env\.neon/);
  });

  it("recusa URL inválida e ignora URLs inválidas de outros arquivos", () => {
    expect(findTestDatabaseProblem("lixo", true, others)).toMatch(/válida/);
    expect(
      findTestDatabaseProblem(LOCAL_TEST, false, [{ file: ".env.x", url: "lixo" }]),
    ).toBeUndefined();
  });
});
