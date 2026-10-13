import { usePathname, useRouter, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSessionState } from "../features/auth/SessionState";
import { authClient } from "../lib/auth-client";
import { CONTENT_MAX_WIDTH, PAGE_PADDING, colors, radius, shadow, useBreakpoint } from "../theme";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  label: string;
  href: Href;
  /** Prefixos de rota que deixam o item marcado como ativo. */
  match: string[];
  icon: IconName;
  needsSession?: boolean;
}

const NAV: NavItem[] = [
  { label: "Explorar", href: "/explorar", match: ["/explorar", "/oportunidades"], icon: "search" },
  { label: "Publicar", href: "/publicar", match: ["/publicar"], icon: "briefcase" },
  {
    label: "Minhas oportunidades",
    href: "/minhas-oportunidades",
    match: ["/minhas-oportunidades", "/editar", "/interessados"],
    icon: "list",
    needsSession: true,
  },
  {
    label: "Meus interesses",
    href: "/meus-interesses" as Href,
    match: ["/meus-interesses"],
    icon: "user",
    needsSession: true,
  },
];

// Telas de entrada têm cartão próprio e não mostram a barra.
const HIDDEN_ON = ["/entrar", "/cadastrar"];

type Hover = { hovered?: boolean };

// Perfil e configurações ainda não foram construídos: aparecem desabilitados e marcados "Em breve",
// sem levar a páginas inexistentes. Navegação principal (oportunidades, interesses, mensagens) fica só na barra.
const FUTURE_MENU = ["Meu perfil", "Editar perfil", "Configurações"];

function isActive(pathname: string, match: string[]) {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Barra superior compartilhada: logotipo, navegação principal, conversas e conta. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.includes(pathname);
  return (
    <View style={styles.root}>
      {hidden ? null : <TopBar pathname={pathname} />}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { isNarrow } = useBreakpoint();
  const { state, recheck } = useSessionState();
  const session = state.status === "authenticated" ? state.session : null;
  const items = NAV.filter((item) => !item.needsSession || session);

  const nav = items.map((item) => (
    <NavLink
      key={item.label}
      item={item}
      active={isActive(pathname, item.match)}
      onPress={() => router.push(item.href)}
    />
  ));

  return (
    <View style={styles.bar} accessibilityRole="header">
      <View style={styles.barInner}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Freelah, ir para o início"
          onPress={() => router.push("/")}
          style={styles.logo}
        >
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>F</Text>
          </View>
          <Text style={styles.logoText}>Freelah</Text>
        </Pressable>

        {isNarrow ? <View style={styles.spacer} /> : <View style={styles.navRow}>{nav}</View>}

        <View style={styles.right}>
          {session ? (
            <>
              <IconButton
                label="Mensagens"
                icon="chat"
                active={isActive(pathname, ["/mensagens", "/conversa"])}
                onPress={() => router.push("/mensagens" as Href)}
                compact={isNarrow}
              />
              <AccountMenu name={session.user.name} email={session.user.email} compact={isNarrow} />
            </>
          ) : state.status === "unknown" ? (
            <Pressable accessibilityRole="button" onPress={recheck} style={styles.unknown}>
              <Text style={styles.unknownText}>Sessão não verificada · tentar de novo</Text>
            </Pressable>
          ) : state.status === "unauthenticated" ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/entrar")}
                style={({ hovered }: Hover) => [styles.signIn, hovered ? styles.signInHover : null]}
              >
                <Text style={styles.signInText}>Entrar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/cadastrar")}
                style={({ hovered }: Hover) => [styles.signUp, hovered ? styles.signUpHover : null]}
              >
                <Text style={styles.signUpText}>Criar conta</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
      {isNarrow ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navScroll}>
          {nav}
        </ScrollView>
      ) : null}
    </View>
  );
}

function NavLink({ item, active, onPress }: { item: NavItem; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }: Hover) => [
        styles.navLink,
        active ? styles.navLinkActive : hovered ? styles.navLinkHover : null,
      ]}
    >
      <Icon name={item.icon} size={16} color={active ? colors.brand : colors.muted} />
      <Text style={[styles.navText, active ? styles.navTextActive : null]}>{item.label}</Text>
    </Pressable>
  );
}

function IconButton({
  label,
  icon,
  active,
  compact,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered }: Hover) => [
        styles.iconButton,
        active ? styles.navLinkActive : hovered ? styles.navLinkHover : null,
      ]}
    >
      <Icon name={icon} size={18} color={active ? colors.brand : colors.textSoft} />
      {compact ? null : <Text style={[styles.navText, active ? styles.navTextActive : null]}>{label}</Text>}
    </Pressable>
  );
}

function AccountMenu({ name, email, compact }: { name: string; email: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  return (
    <View style={styles.accountWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menu da conta"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ hovered }: Hover) => [styles.account, hovered || open ? styles.navLinkHover : null]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        {compact ? null : (
          <Text style={styles.accountName} numberOfLines={1}>
            {name}
          </Text>
        )}
        <Icon name="chevronDown" size={14} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          <Text style={styles.menuName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.menuEmail} numberOfLines={1}>
            {email}
          </Text>
          <View style={styles.menuDivider} />
          {FUTURE_MENU.map((label) => (
            <View
              key={label}
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              style={[styles.menuItem, styles.menuItemDisabled]}
            >
              <Text style={styles.menuFutureText}>{label}</Text>
              <Text style={styles.soon}>Em breve</Text>
            </View>
          ))}
          <View style={styles.menuDivider} />
          <Pressable
            accessibilityRole="button"
            disabled={signingOut}
            onPress={signOut}
            style={({ hovered }: Hover) => [styles.menuItem, hovered ? styles.navLinkHover : null]}
          >
            <Text style={styles.menuItemText}>{signingOut ? "Saindo…" : "Sair"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  barInner: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: PAGE_PADDING,
    height: 64,
  },
  logo: { flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" },
  logoMark: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkText: { color: "#FFFFFF", fontWeight: "800", fontSize: 17 },
  logoText: { fontSize: 20, fontWeight: "800", color: colors.text },
  spacer: { flex: 1 },
  navRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  navScroll: { paddingHorizontal: 12, paddingBottom: 8, gap: 4 },
  navLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  navLinkActive: { backgroundColor: colors.brandSoft },
  navLinkHover: { backgroundColor: colors.background },
  navText: { fontSize: 14, fontWeight: "600", color: colors.textSoft },
  navTextActive: { color: colors.brand },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  signIn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, cursor: "pointer" },
  signInHover: { backgroundColor: colors.background },
  signInText: { fontSize: 14, fontWeight: "700", color: colors.brand },
  signUp: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    cursor: "pointer",
  },
  signUpHover: { backgroundColor: colors.brandDark },
  signUpText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  unknown: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.warningSoft },
  unknownText: { fontSize: 12, fontWeight: "600", color: colors.warningText },
  accountWrap: { position: "relative" },
  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    cursor: "pointer",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800", color: colors.brand },
  accountName: { fontSize: 14, fontWeight: "600", color: colors.text, maxWidth: 140 },
  menu: {
    position: "absolute",
    top: 44,
    right: 0,
    width: 260,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.raised,
    padding: 8,
    gap: 2,
    zIndex: 20,
  },
  menuName: { fontSize: 14, fontWeight: "700", color: colors.text, paddingHorizontal: 8, paddingTop: 4 },
  menuEmail: { fontSize: 12, color: colors.muted, paddingHorizontal: 8, paddingBottom: 6 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: radius.sm,
    cursor: "pointer",
  },
  menuItemDisabled: { cursor: "auto", justifyContent: "space-between" },
  menuDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  menuFutureText: { fontSize: 14, color: colors.muted },
  soon: { fontSize: 11, fontWeight: "700", color: colors.muted, backgroundColor: colors.background, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  menuItemText: { fontSize: 14, fontWeight: "600", color: colors.error },
});
