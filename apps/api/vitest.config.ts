import { readdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";
import { findTestDatabaseProblem, type OtherEnvUrl } from "./scripts/db-safety.ts";

function readEnvFile(file: string): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

// Os testes de integração APAGAM todos os dados do banco que usam. Regras de proteção:
// 1. Só leem apps/api/.env.test; a DATABASE_URL do ambiente é descartada.
// 2. O banco de teste não pode ser o mesmo de NENHUM outro .env* (.env, .env.neon, ...).
// 3. Por padrão só aceitam banco local. Usar o branch "test" do Neon exige
//    ALLOW_REMOTE_TEST_DB=1 no próprio .env.test (escolha deliberada).
delete process.env.DATABASE_URL;
delete process.env.ALLOW_REMOTE_TEST_DB;
const testEnv = readEnvFile(".env.test");
const testUrl = testEnv.DATABASE_URL || undefined;
if (testUrl) {
  const others: OtherEnvUrl[] = readdirSync(".")
    .filter((name) => name.startsWith(".env") && name !== ".env.test")
    .flatMap((file) => {
      const url = readEnvFile(file).DATABASE_URL;
      return url ? [{ file, url }] : [];
    });
  const allowRemote = testEnv.ALLOW_REMOTE_TEST_DB === "1";
  const problem = findTestDatabaseProblem(testUrl, allowRemote, others);
  if (problem) throw new Error(problem);
  process.env.DATABASE_URL = testUrl;
  if (allowRemote) process.env.ALLOW_REMOTE_TEST_DB = "1";
}

export default defineConfig({
  test: {
    // Os testes de integração compartilham um banco e rodam em sequência.
    fileParallelism: false,
  },
});
