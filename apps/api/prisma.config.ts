import { defineConfig } from "prisma/config";

// O Prisma 7 não lê o .env sozinho. Variáveis já definidas (ex.: via --env-file) têm prioridade.
try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: segue com o ambiente atual
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Conexão DIRETA do Neon (sem "-pooler"). Vazia só permite validar/gerar o client.
    url: process.env.DATABASE_URL ?? "",
  },
});
