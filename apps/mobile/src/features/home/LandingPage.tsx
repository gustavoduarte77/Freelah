import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../../components/Icon";
import { Button } from "../../components/ui";
import { colors, gradient, radius, shadow, useBreakpoint } from "../../theme";
import { ConnectionBanner, EmptyBox, ErrorBox, LoadingBox, StaleNotice } from "../jobs/components";
import { JobGridCard } from "../jobs/JobGridCard";
import { useJobsList } from "../jobs/hooks";

const LANDING_MAX_WIDTH = 1320;
const RECENT_PARAMS = { limit: 3 };
const STEPS: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "search",
    title: "Encontre oportunidades",
    description: "Explore trabalhos e serviços disponíveis na sua região.",
  },
  {
    icon: "chat",
    title: "Entre em contato",
    description: "Demonstre interesse e converse diretamente com quem publicou a oportunidade.",
  },
  {
    icon: "calendar",
    title: "Combine os detalhes",
    description: "Converse sobre valores, disponibilidade e condições para realizar o serviço.",
  },
];

/** Os dois caminhos usam as rotas existentes; a preferência só muda a ordem dos atalhos. */
function LandingActions({ publishFirst, exploreLabel = "Explorar oportunidades", stacked }: {
  publishFirst: boolean;
  exploreLabel?: string;
  stacked: boolean;
}) {
  const router = useRouter();
  const explore = (
    <View key="explore" style={stacked ? styles.fullAction : null}>
      <Button title={exploreLabel} variant={publishFirst ? "secondary" : "primary"} onPress={() => router.push("/explorar")} />
    </View>
  );
  const publish = (
    <View key="publish" style={stacked ? styles.fullAction : null}>
      <Button title="Publicar oportunidade" variant={publishFirst ? "primary" : "secondary"} onPress={() => router.push("/publicar")} />
    </View>
  );
  return <View style={styles.actions}>{publishFirst ? [publish, explore] : [explore, publish]}</View>;
}

/** Composição de conexões locais, sem simular oportunidades ou pessoas cadastradas. */
function LocalConnections() {
  return (
    <View style={styles.visual} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <View style={styles.orbitOuter} />
      <View style={styles.orbitInner} />
      <View style={styles.connectionHorizontal} />
      <View style={styles.connectionVertical} />
      <View style={styles.centerNode}>
        <Icon name="pin" size={38} color={colors.brand} strokeWidth={1.7} />
        <Text style={styles.centerName}>FreeLah</Text>
        <Text style={styles.centerCaption}>Perto de você</Text>
      </View>
      <View style={[styles.connectionNode, styles.peopleNode]}>
        <Icon name="user" size={24} color={colors.brand} />
        <Text style={styles.nodeLabel}>Pessoas</Text>
      </View>
      <View style={[styles.connectionNode, styles.workNode]}>
        <Icon name="briefcase" size={24} color={colors.brand} />
        <Text style={styles.nodeLabel}>Trabalho</Text>
      </View>
      <View style={[styles.connectionNode, styles.servicesNode]}>
        <Icon name="wrench" size={24} color={colors.brand} />
        <Text style={styles.nodeLabel}>Serviços</Text>
      </View>
      <View style={styles.visualCaption}>
        <View style={styles.captionDot} />
        <Text style={styles.visualCaptionText}>Conexões que começam na sua região.</Text>
      </View>
    </View>
  );
}

/** Home pública: apresenta a plataforma e reaproveita a lista e os cartões reais da API. */
export function LandingPage({ publishFirst = false, onPreferences, preferencesNeedRecovery = false }: {
  publishFirst?: boolean;
  onPreferences?: (() => void) | undefined;
  preferencesNeedRecovery?: boolean;
}) {
  const router = useRouter();
  const { width, isNarrow } = useBreakpoint();
  const recent = useJobsList("home", RECENT_PARAMS);
  const horizontalPadding = isNarrow ? 16 : 32;
  const contentWidth = Math.min(width, LANDING_MAX_WIDTH) - horizontalPadding * 2;
  const columns = contentWidth >= 960 ? 3 : contentWidth >= 600 ? 2 : 1;
  const splitHero = contentWidth >= 1000;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingHorizontal: horizontalPadding }]}>
        <View style={[styles.hero, { padding: isNarrow ? 24 : 48, flexDirection: splitHero ? "row" : "column" }]}>
          <View style={styles.heroCopy}>
            <View style={styles.eyebrowRow}>
              <Icon name="pin" size={16} color={colors.brand} />
              <Text style={styles.eyebrow}>OPORTUNIDADES QUE CONECTAM</Text>
            </View>
            <Text style={[styles.heroTitle, { fontSize: isNarrow ? 34 : 52, lineHeight: isNarrow ? 41 : 60 }]} accessibilityRole="header">
              Seu próximo trabalho ou profissional{" "}
              <Text style={styles.heroHighlight}>está aqui.</Text>
            </Text>
            <Text style={styles.heroDescription}>
              Encontre oportunidades, publique serviços e conecte-se com pessoas da sua região. Simples, rápido e direto.
            </Text>
            <LandingActions publishFirst={publishFirst} stacked={isNarrow} />
            <Text style={styles.heroNote}>Para quem procura trabalho e para quem precisa contratar.</Text>
            {onPreferences ? (
              <View style={styles.preferencesAction}>
                <Button title={preferencesNeedRecovery ? "Revisar preferências deste aparelho" : "Personalizar meus atalhos"} variant="link" onPress={onPreferences} />
              </View>
            ) : null}
          </View>
          {splitHero ? <LocalConnections /> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionIntro}>
            <Text style={styles.eyebrow}>DO PRIMEIRO CONTATO AO SERVIÇO</Text>
            <Text style={styles.sectionTitle} accessibilityRole="header">Como funciona</Text>
            <Text style={styles.sectionDescription}>Um caminho simples para encontrar pessoas e novas possibilidades.</Text>
          </View>
          <View style={[styles.steps, { flexDirection: isNarrow ? "column" : "row" }]}>
            {STEPS.map((step, index) => (
              <View key={step.title} style={styles.step}>
                <View style={styles.stepTop}>
                  <View style={styles.stepIcon}><Icon name={step.icon} size={26} color={colors.brand} /></View>
                  <Text style={styles.stepNumber}>0{index + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.eyebrow}>DESCUBRA NOVAS POSSIBILIDADES</Text>
              <Text style={styles.sectionTitle} accessibilityRole="header">Oportunidades recentes</Text>
              <Text style={styles.sectionDescription}>Uma prévia dos trabalhos e serviços disponíveis na plataforma.</Text>
            </View>
            <Button title="Ver todas as oportunidades" variant="link" onPress={() => router.push("/explorar")} />
          </View>
          <ConnectionBanner />
          {recent.state.status === "loading" ? (
            <LoadingBox label="Carregando oportunidades…" />
          ) : recent.state.status === "error" ? (
            <ErrorBox error={recent.state.error} onRetry={recent.retry} />
          ) : (
            <View style={styles.recent}>
              <StaleNotice loadedAt={recent.state.loadedAt} refreshing={recent.state.refreshing} failed={recent.state.refreshError !== null} />
              {recent.state.jobs.length === 0 ? (
                <EmptyBox title="As próximas oportunidades começam com você" text="Ainda não há oportunidades abertas. Publique um serviço ou volte em breve para descobrir novidades." />
              ) : (
                <View style={styles.grid}>
                  {recent.state.jobs.slice(0, RECENT_PARAMS.limit).map((job) => (
                    <View key={job.id} style={[styles.cell, { width: `${100 / columns}%` }]}>
                      <JobGridCard job={job} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={[styles.finalCta, { padding: isNarrow ? 24 : 40 }]}>
          <View style={styles.ctaIcon}><Icon name="briefcase" size={28} color={colors.brand} /></View>
          <Text style={[styles.ctaTitle, { fontSize: isNarrow ? 26 : 32 }]} accessibilityRole="header">
            Tem um serviço para oferecer ou precisa de uma mãozinha?
          </Text>
          <Text style={[styles.sectionDescription, styles.ctaDescription]}>No FreeLah, uma oportunidade pode estar mais perto do que você imagina.</Text>
          <View style={isNarrow ? styles.fullAction : null}>
            <LandingActions publishFirst={publishFirst} exploreLabel="Encontrar oportunidades" stacked={isNarrow} />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerIdentity}>
              <Text style={styles.footerBrand}>FreeLah</Text>
              <Text style={styles.footerDescription}>Pessoas, serviços e oportunidades locais.{"\n"}Conectando quem precisa com quem pode fazer.</Text>
            </View>
            <View style={styles.footerLinks}>
              <Button title="Início" variant="link" onPress={() => router.push("/")} />
              <Button title="Explorar" variant="link" onPress={() => router.push("/explorar")} />
              <Button title="Publicar oportunidade" variant="link" onPress={() => router.push("/publicar")} />
            </View>
          </View>
          <Text style={styles.copyright}>© {new Date().getFullYear()} FreeLah. Todos os direitos reservados.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { width: "100%", maxWidth: LANDING_MAX_WIDTH, alignSelf: "center", paddingTop: 28, paddingBottom: 24, gap: 56 },
  hero: {
    gap: 40, alignItems: "center", backgroundColor: colors.brandSoft, borderRadius: 24,
    borderWidth: 1, borderColor: colors.brandBorder,
    ...gradient("linear-gradient(115deg, #FFFFFF 0%, #EAF1FD 60%, #DFEAFD 100%)"),
  },
  heroCopy: { flex: 1, width: "100%", minWidth: 0, gap: 24 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: { color: colors.brandDark, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, flexShrink: 1, lineHeight: 18 },
  heroTitle: { color: colors.text, fontWeight: "800", letterSpacing: -1.6 },
  heroHighlight: { color: colors.brand },
  heroDescription: { color: colors.textSoft, fontSize: 18, lineHeight: 29, maxWidth: 590 },
  heroNote: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
  preferencesAction: { alignSelf: "flex-start", marginTop: -14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fullAction: { width: "100%" },
  visual: { width: 360, height: 360, alignItems: "center", justifyContent: "center" },
  orbitOuter: { position: "absolute", width: 310, height: 310, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandBorder },
  orbitInner: { position: "absolute", width: 228, height: 228, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandBorder },
  connectionHorizontal: { position: "absolute", width: 285, height: 1, backgroundColor: colors.brandBorder, transform: [{ rotate: "-25deg" }] },
  connectionVertical: { position: "absolute", height: 265, width: 1, backgroundColor: colors.brandBorder, transform: [{ rotate: "25deg" }] },
  centerNode: {
    width: 162, height: 162, borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.brandBorder, boxShadow: shadow.raised, alignItems: "center", justifyContent: "center", gap: 7,
  },
  centerName: { color: colors.brand, fontSize: 25, fontWeight: "800", letterSpacing: -0.8 },
  centerCaption: { color: colors.textSoft, fontSize: 12 },
  connectionNode: {
    position: "absolute", width: 98, height: 88, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandBorder,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 9, boxShadow: shadow.card,
  },
  peopleNode: { top: 4, left: 25, transform: [{ rotate: "-6deg" }] },
  workNode: { top: 60, right: 0, transform: [{ rotate: "7deg" }] },
  servicesNode: { bottom: 42, left: 12, transform: [{ rotate: "-4deg" }] },
  nodeLabel: { color: colors.textSoft, fontSize: 12, fontWeight: "700" },
  visualCaption: { position: "absolute", bottom: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  captionDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.brand },
  visualCaptionText: { color: colors.brandDark, fontSize: 12 },
  section: { gap: 24 },
  sectionIntro: { gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 29, fontWeight: "800", letterSpacing: -0.6, lineHeight: 37 },
  sectionDescription: { color: colors.textSoft, fontSize: 16, lineHeight: 25 },
  steps: { gap: 18 },
  step: { flex: 1, minWidth: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 24, gap: 12 },
  stepTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  stepIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  stepNumber: { fontSize: 28, fontWeight: "800", color: colors.muted },
  stepTitle: { color: colors.text, fontSize: 18, fontWeight: "700", lineHeight: 25 },
  stepDescription: { color: colors.textSoft, fontSize: 15, lineHeight: 24 },
  sectionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 },
  sectionHeaderCopy: { flexGrow: 1, flexShrink: 1, gap: 8 },
  recent: { gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -10 },
  cell: { paddingHorizontal: 10, paddingVertical: 10 },
  finalCta: { alignItems: "center", gap: 18, backgroundColor: colors.brandSoft, borderRadius: 24, borderWidth: 1, borderColor: colors.brandBorder },
  ctaIcon: { width: 60, height: 60, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  ctaTitle: { color: colors.text, fontWeight: "800", textAlign: "center", maxWidth: 670, lineHeight: 40, letterSpacing: -0.6 },
  ctaDescription: { textAlign: "center" },
  footer: { gap: 28, paddingTop: 4 },
  footerTop: { flexDirection: "row", flexWrap: "wrap", gap: 24, justifyContent: "space-between", alignItems: "center" },
  footerIdentity: { gap: 10, flexShrink: 1 },
  footerBrand: { color: colors.brand, fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
  footerDescription: { color: colors.textSoft, fontSize: 14, lineHeight: 23 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  copyright: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20, color: colors.muted, fontSize: 12, lineHeight: 20 },
});
