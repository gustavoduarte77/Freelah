import { createApp } from "./app";
import { createAuth } from "./auth";
import { loadConfig } from "./config";
import { createPrisma } from "./db";
import { expireOverdueJobs, startExpiryJob } from "./expiry";

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const auth = createAuth(config, prisma);
const app = createApp(config, auth, prisma);

// Marca como expiradas as oportunidades com prazo vencido: ao subir (inclusive depois de a API ter
// ficado fora do ar) e a cada minuto.
const expiry = startExpiryJob(() => expireOverdueJobs(prisma), {
  onError: (error) => console.error("Falha ao marcar oportunidades expiradas:", error),
});

// Escuta em todas as interfaces para que o Expo Go (celular na mesma rede) consiga acessar.
const server = app.listen(config.PORT, "0.0.0.0", () => {
  const target = new URL(config.DATABASE_URL);
  console.log(`Freelah API em http://localhost:${config.PORT} (${config.NODE_ENV})`);
  console.log(`Banco: ${target.hostname} / ${target.pathname.slice(1)}`);
});

async function shutdown() {
  expiry.stop();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
