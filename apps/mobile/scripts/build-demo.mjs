
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const env = {
  ...process.env,
  EXPO_PUBLIC_DEMO_MODE: "1",
  EXPO_OFFLINE: "1",
  EXPO_NO_TELEMETRY: "1",
  EXPO_NO_DEPENDENCY_VALIDATION: "1",
};

const isWindows = process.platform === "win32";
const command = isWindows ? "npx.cmd" : "npx";

const child = spawn(
  command,
  ["expo", "export", "--platform", "web"],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: isWindows,
  },
);

child.on("error", (error) => {
  console.error("Falha ao iniciar a compilação:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
