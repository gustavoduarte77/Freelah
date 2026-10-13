/* global process, console */
// Inicia o Freelah Web em Modo Demonstração Offline: dados fictícios locais, sem API, sem banco e
// sem internet. O modo só existe neste processo (variável de ambiente); o aplicativo normal
// (`npm run dev:web`) continua igual. Use `--port` para trocar a porta (padrão 8082).
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const portFlag = process.argv.indexOf("--port");
const port = portFlag > -1 ? process.argv[portFlag + 1] : "8082";

const env = {
  ...process.env,
  EXPO_PUBLIC_DEMO_MODE: "1",
  // Evita consultas à internet do Expo (versões, telemetria, validação de dependências).
  EXPO_OFFLINE: "1",
  EXPO_NO_TELEMETRY: "1",
  EXPO_NO_DEPENDENCY_VALIDATION: "1",
};

console.log(`\nFreelah em MODO DEMONSTRAÇÃO (offline). Abra: http://localhost:${port}`);
console.log("Entrar com usuario@gmail.com / 12345678. Atalhos: A avança, B volta.\n");

const child = spawn("npx", ["expo", "start", "--web", "--port", port, "--clear"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
