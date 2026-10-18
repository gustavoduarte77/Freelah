import { createElement } from "react";
import { Platform, Text } from "react-native";

/** Ícones de traço (24x24, estilo Lucide), desenhados em SVG na Web. Sem dependência extra. */
const PATHS = {
  search: ["M21 21l-4.3-4.3", "circle:11,11,8"],
  grid: ["rect:3,3,7,7", "rect:14,3,7,7", "rect:3,14,7,7", "rect:14,14,7,7"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z", "circle:12,10,3"],
  calendar: ["rect:3,4,18,18", "M16 2v4", "M8 2v4", "M3 10h18"],
  chat: ["M7.9 20A9 9 0 1 0 4 16.1L2 22z"],
  filter: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "circle:12,7,4"],
  briefcase: ["rect:2,7,20,14", "M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"],
  home: ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
  building: ["M3 21h18", "M5 21V7l8-4v18", "M19 21V11l-6-4", "M9 9v.01", "M9 13v.01", "M9 17v.01"],
  wrench: [
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
  ],
  book: ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
  layers: ["M12 2l10 5-10 5L2 7z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  image: ["rect:3,3,18,18", "circle:8.5,8.5,1.5", "M21 15l-5-5L5 21"],
  chevronDown: ["M6 9l6 6 6-6"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  clock: ["circle:12,12,10", "M12 6v6l4 2"],
  check: ["M20 6L9 17l-5-5"],
  info: ["circle:12,12,10", "M12 16v-4", "M12 8h.01"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  chevronLeft: ["M15 18l-6-6 6-6"],
  chevronRight: ["M9 18l6-6-6-6"],
  panelLeft: ["rect:3,3,18,18", "M9 3v18"],
  panelRight: ["rect:3,3,18,18", "M15 3v18"],
  userCircle: ["circle:12,12,10", "circle:12,10,3", "M7 20.7a7 7 0 0 1 10 0"],
  alert: ["circle:12,12,10", "M12 8v4", "M12 16h.01"],
} as const;

export type IconName = keyof typeof PATHS;

/** Ícone por categoria; categorias novas caem em "briefcase". */
export function iconForCategory(slug: string): IconName {
  switch (slug) {
    case "servicos-domesticos":
      return "home";
    case "servicos-comerciais":
      return "building";
    case "construcao-civil":
      return "layers";
    case "servicos-de-manutencao":
      return "wrench";
    case "aulas-particulares":
      return "book";
    default:
      return "briefcase";
  }
}

export function Icon({ name, size = 18, color = "#142033", strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  // No celular o desenho SVG não está disponível sem biblioteca extra; o ícone some sem quebrar
  // o texto ao lado (todo ícone tem um rótulo escrito).
  if (Platform.OS !== "web") return <Text style={{ width: 0, height: 0 }} />;
  const children = PATHS[name].map((item, index) => {
    if (item.startsWith("circle:")) {
      const [cx, cy, r] = item.slice(7).split(",");
      return createElement("circle", { key: index, cx, cy, r });
    }
    if (item.startsWith("rect:")) {
      const [x, y, width, height] = item.slice(5).split(",");
      return createElement("rect", { key: index, x, y, width, height, rx: 2 });
    }
    return createElement("path", { key: index, d: item });
  });
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      style: { flexShrink: 0, display: "block" },
    },
    ...children,
  );
}
