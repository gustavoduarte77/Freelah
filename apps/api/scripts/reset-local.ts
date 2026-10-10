import { spawnSync } from "node:child_process";
import { createPrisma } from "../src/db";
import { databaseName, isLocalDatabaseUrl } from "./db-safety";

// Apaga TODOS os dados do banco apontado por DATABASE_URL e recarrega as categorias.
// Recusa qualquer banco que não seja local, para nunca atingir o Neon.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (apps/api/.env).");
if (!isLocalDatabaseUrl(url)) {
  throw new Error(
    "Reset recusado: DATABASE_URL não aponta para um banco local (localhost/127.0.0.1).",
  );
}

const prisma = createPrisma(url);
try {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) {
    throw new Error("Nenhuma tabela encontrada. Rode as migrações primeiro (db:deploy).");
  }
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Banco local "${databaseName(url)}" limpo (${tables.length} tabelas).`);
} finally {
  await prisma.$disconnect();
}

const seed = spawnSync("npx", ["prisma", "db", "seed"], { stdio: "inherit", shell: true });
process.exit(seed.status ?? 1);
