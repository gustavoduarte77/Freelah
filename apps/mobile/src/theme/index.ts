import { Platform, useWindowDimensions, type ViewStyle } from "react-native";

/** Tokens visuais compartilhados: toda tela deve usar estes valores em vez de valores soltos. */
export const colors = {
  brand: "#1D5FD6",
  brandDark: "#164BAD",
  brandSoft: "#EAF1FD",
  brandBorder: "#C7DAF8",
  background: "#F6F8FC",
  surface: "#FFFFFF",
  text: "#142033",
  textSoft: "#3C4A5F",
  muted: "#667085",
  border: "#E1E7F0",
  error: "#B3261E",
  errorSoft: "#FCE8E6",
  warningSoft: "#FFF4E5",
  warningText: "#7A4B00",
  success: "#1B7F4B",
  successSoft: "#E3F3EA",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const fontSize = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 };

// Sombras projetadas para baixo: deslocamento vertical e espalhamento negativo mantêm o topo limpo.
export const shadow = {
  card: "0 4px 8px -4px rgba(20, 32, 51, 0.14), 0 1px 2px rgba(20, 32, 51, 0.05)",
  hover: "0 16px 24px -12px rgba(20, 32, 51, 0.30), 0 2px 4px rgba(20, 32, 51, 0.06)",
  raised: "0 12px 24px -8px rgba(20, 32, 51, 0.22)",
};

/** Largura máxima do conteúdo das telas largas. */
export const CONTENT_MAX_WIDTH = 1800;
/** Margem lateral das telas largas. */
export const PAGE_PADDING = 24;
export const WIDE_BREAKPOINT = 1100;
export const NARROW_BREAKPOINT = 720;

/** Colunas de cartões para a largura útil da área de resultados: 3 por padrão, 4 em telas ultralargas. */
export function gridColumnsFor(mainWidth: number): number {
  if (mainWidth >= 1900) return 4;
  if (mainWidth >= 900) return 3;
  if (mainWidth >= 560) return 2;
  return 1;
}

/** Faixa de largura da janela, para escolher entre a barra compacta e a completa. */
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return { width, isWide: width >= WIDE_BREAKPOINT, isNarrow: width < NARROW_BREAKPOINT };
}

/**
 * Degradê linear em CSS ("linear-gradient(...)"). A Web usa `backgroundImage`; o React Native
 * aceita a mesma sintaxe em `experimental_backgroundImage`.
 */
export function gradient(css: string): ViewStyle {
  return (Platform.OS === "web"
    ? { backgroundImage: css }
    : { experimental_backgroundImage: css }) as ViewStyle;
}

/**
 * Foco de campos que ficam dentro de uma caixa (busca, mensagem): a caixa inteira ganha o contorno
 * azul, acompanhando o formato dela, e o campo interno não desenha o contorno próprio do navegador.
 * (Com `outline-style: auto`, o Chrome ignora a largura zero; por isso o estilo é "solid".)
 */
export const focusRing: ViewStyle = {
  borderColor: colors.brand,
  boxShadow: "0 0 0 3px rgba(29, 95, 214, 0.2)",
};
export const noInnerOutline = { outlineStyle: "solid", outlineWidth: 0 } as const;
