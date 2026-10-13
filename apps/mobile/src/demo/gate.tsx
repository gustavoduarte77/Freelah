import type { ReactNode } from "react";

/**
 * Único ponto em que o Modo Demonstração Offline toca o aplicativo. Ele só existe quando o app é
 * iniciado com EXPO_PUBLIC_DEMO_MODE=1 (npm run demo:web); caso contrário nada é carregado e o
 * `require` abaixo é descartado do pacote. Este módulo precisa ser o PRIMEIRO import do app, para
 * trocar o `fetch` antes de qualquer chamada.
 */
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === "1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtime = process.env.EXPO_PUBLIC_DEMO_MODE === "1" ? (require("./runtime") as typeof import("./runtime")) : null;
runtime?.installDemoFetch();

export function DemoRoot({ children }: { children: ReactNode }) {
  return runtime ? <runtime.DemoRoot>{children}</runtime.DemoRoot> : <>{children}</>;
}
