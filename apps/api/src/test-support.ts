import { isLocalDatabaseUrl } from "../scripts/db-safety";
import { createPrisma, type PrismaClient } from "./db";

// URL do banco de testes. O vitest.config.ts só a define depois de todas as verificações de segurança.
export const testDatabaseUrl = process.env.DATABASE_URL;

/** Conecta ao banco de testes. Segunda barreira: recusa banco remoto sem permissão explícita. */
export function connectTestDatabase(): PrismaClient {
  const url = testDatabaseUrl;
  if (!url) throw new Error("Banco de testes não configurado (apps/api/.env.test).");
  if (!isLocalDatabaseUrl(url) && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error("Recusado: banco de teste remoto sem ALLOW_REMOTE_TEST_DB=1.");
  }
  return createPrisma(url);
}

/** Apaga TODOS os dados do banco de testes (nunca use fora dele). */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
