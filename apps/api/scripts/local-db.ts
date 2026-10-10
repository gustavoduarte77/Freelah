import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

// PostgreSQL local para a demonstração offline e para os testes. Só escuta em 127.0.0.1.
// A senha abaixo é descartável e vale apenas para este banco local.
export const LOCAL_DB = {
  port: 54329,
  user: "freelah",
  password: "freelah",
  databases: ["freelah_local", "freelah_test"],
} as const;

const dataDir = fileURLToPath(new URL("../.local-db/data", import.meta.url));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: LOCAL_DB.port,
  user: LOCAL_DB.user,
  password: LOCAL_DB.password,
  persistent: true,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (error) => console.error(error),
});

if (!existsSync(`${dataDir}/PG_VERSION`)) {
  console.log("Primeira execução: criando o banco local (pode levar alguns segundos)...");
  await pg.initialise();
}

await pg.start();

for (const name of LOCAL_DB.databases) {
  try {
    await pg.createDatabase(name);
    console.log(`Banco "${name}" criado.`);
  } catch (error) {
    if (!String(error).includes("already exists")) throw error;
  }
}

const base = `postgresql://${LOCAL_DB.user}:${LOCAL_DB.password}@127.0.0.1:${LOCAL_DB.port}`;
console.log(`
PostgreSQL local no ar. Deixe este terminal aberto; Ctrl+C encerra.

  apps/api/.env       DATABASE_URL=${base}/freelah_local?sslmode=disable
  apps/api/.env.test  DATABASE_URL=${base}/freelah_test?sslmode=disable
`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("Encerrando o PostgreSQL local...");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Mantém o processo vivo até receber o sinal de encerramento.
setInterval(() => {}, 1 << 30);
