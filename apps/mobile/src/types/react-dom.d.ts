// O app só usa o portal do react-dom na Web (balões de ajuda); evita instalar @types/react-dom.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element): ReactPortal;
}
