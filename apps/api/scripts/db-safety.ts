export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host);
  } catch {
    return false;
  }
}

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

export function isValidPostgresUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      parsed.hostname !== "" &&
      databaseName(url) !== ""
    );
  } catch {
    return false;
  }
}

export function isPoolerUrl(url: string): boolean {
  try {
    return new URL(url).hostname.split(".")[0]?.endsWith("-pooler") ?? false;
  } catch {
    return false;
  }
}

// Identifica o banco sem usuário, senha ou parâmetros. Em bancos remotos, o endereço já
// identifica o branch inteiro; em bancos locais, o endereço é igual e só o nome do banco muda.
export function databaseIdentity(url: string): string {
  const parsed = new URL(url);
  if (isLocalDatabaseUrl(url)) {
    return `local:${parsed.port || "5432"}/${databaseName(url)}`;
  }
  return `remoto:${parsed.hostname.replace("-pooler", "")}`;
}

export interface OtherEnvUrl {
  file: string;
  url: string;
}

// Devolve o motivo da recusa, ou undefined se o banco pode ser usado nos testes
// (que apagam todos os dados dele).
export function findTestDatabaseProblem(
  testUrl: string,
  allowRemote: boolean,
  others: OtherEnvUrl[],
): string | undefined {
  if (!isValidPostgresUrl(testUrl)) {
    return "a DATABASE_URL de apps/api/.env.test não é uma URL PostgreSQL válida.";
  }
  if (!isLocalDatabaseUrl(testUrl) && !allowRemote) {
    return (
      "apps/api/.env.test aponta para um banco remoto. Use o banco local (npm run db:local) " +
      'ou, para usar o branch "test" do Neon, adicione ALLOW_REMOTE_TEST_DB=1 ao .env.test.'
    );
  }
  const identity = databaseIdentity(testUrl);
  for (const other of others) {
    if (!isValidPostgresUrl(other.url)) continue;
    if (databaseIdentity(other.url) === identity) {
      return (
        `apps/api/.env.test aponta para o mesmo banco de apps/api/${other.file}. ` +
        "Os testes apagam dados: use um banco de teste separado."
      );
    }
  }
  return undefined;
}
