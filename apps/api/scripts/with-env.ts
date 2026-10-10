import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseEnv } from "node:util";
import {
  databaseName,
  isLocalDatabaseUrl,
  isPoolerUrl,
  isValidPostgresUrl,
} from "./db-safety";

// Uso: tsx scripts/with-env.ts [--neon] <arquivo-env> -- <comando> [argumentos]
//
// Roda o comando com a DATABASE_URL do arquivo informado, SOBRESCREVENDO qualquer
// DATABASE_URL já presente no terminal. Antes de rodar, valida a URL e mostra apenas
// o endereço e o nome do banco (nunca usuário, senha ou parâmetros).
// Com --neon: o arquivo precisa ser .env.neon, o banco precisa ser remoto e a conexão
// precisa ser direta (sem "-pooler"), que é o que as migrações exigem.

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const separator = args.indexOf("--");
if (separator === -1) fail("informe o comando depois de '--'.");
const options = args.slice(0, separator);
const command = args.slice(separator + 1);
if (command.length === 0) fail("nenhum comando informado depois de '--'.");

const neonMode = options.includes("--neon");
const files = options.filter((option) => !option.startsWith("--"));
const envFile = files[0];
if (files.length !== 1 || !envFile) fail("informe exatamente um arquivo de ambiente.");

if (neonMode && basename(envFile) !== ".env.neon") {
  fail("os comandos do Neon só aceitam a configuração de apps/api/.env.neon.");
}
if (!existsSync(envFile)) {
  fail(
    `${envFile} não existe. Crie o arquivo e coloque nele a linha DATABASE_URL=... ` +
      "(veja as instruções no README, seção Neon).",
  );
}

const values = parseEnv(readFileSync(envFile, "utf8"));
const url = values.DATABASE_URL?.trim();
if (!url) fail(`${envFile} não define DATABASE_URL (ou ela está vazia).`);
if (!isValidPostgresUrl(url)) {
  fail(`a DATABASE_URL de ${envFile} não é uma URL PostgreSQL válida (postgresql://...).`);
}

const local = isLocalDatabaseUrl(url);
if (neonMode) {
  if (local) fail(`${envFile} aponta para um banco local; os comandos do Neon exigem um banco remoto.`);
  if (isPoolerUrl(url)) {
    fail(
      "a URL é de conexão com pooler (endereço com '-pooler'). Use a conexão DIRETA: " +
        "no Neon, em Connect, desmarque 'Connection pooling'.",
    );
  }
}

console.log(`Banco alvo: ${new URL(url).hostname} / ${databaseName(url)} (${local ? "local" : "remoto"})`);

// Comando como uma única string: o shell é necessário no Windows para achar prisma e tsx.
const child = spawn(command.join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...values },
});
child.on("exit", (code) => process.exit(code ?? 1));
