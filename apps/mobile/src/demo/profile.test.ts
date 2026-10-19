import { groupProfileHistory, publicProfileResponseSchema, type PublicProfile } from "@freelah/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDemoRequest } from "./server";
import { reset, setLoggedIn } from "./store";
import { testStorage } from "./test/local-storage";

// Meu perfil, edição e histórico de serviços concluídos na demonstração.

const call = (method: string, path: string, body?: unknown) =>
  handleDemoRequest(method, path, body === undefined ? undefined : JSON.stringify(body));

const LUCAS = "demo-profile-lucas";
const ROBERTO = "demo-profile-roberto";
const MARIANA = "demo-profile-mariana";
const STATE_KEY = "freelah:demo:state:v1";

const publicProfile = (id: string) => publicProfileResponseSchema.parse(call("GET", `/profiles/${id}`).body).profile;
const ownProfile = () => publicProfileResponseSchema.parse(call("GET", "/me/profile").body).profile;
const edit = (body: unknown) => call("PATCH", "/me/profile", body);
const valid = { roles: ["PROFESSIONAL"], headline: "Pintor e reparos", bio: "Atendo toda a região.", city: "Leopoldina" };

beforeEach(() => {
  reset();
  setLoggedIn(true);
});

describe("Meu perfil", () => {
  it("exige sessão", () => {
    setLoggedIn(false);
    expect(call("GET", "/me/profile").status).toBe(401);
    expect(edit(valid).status).toBe(401);
  });

  it("mostra o perfil da própria conta, igual ao público, sem telefone nem e-mail", () => {
    const profile = ownProfile();
    expect(profile.id).toBe(LUCAS);
    expect(profile.roles).toEqual(["PROFESSIONAL", "CLIENT"]);
    const text = JSON.stringify(call("GET", "/me/profile").body);
    expect(text).not.toContain("32987654321");
    expect(text).not.toContain("usuario@gmail.com");
    expect(text).not.toMatch(/phone|email/i);
  });
});

describe("Editar perfil", () => {
  it("salva papéis, ocupação, apresentação e cidade, e o perfil público passa a mostrá-los", () => {
    const res = edit({ ...valid, roles: ["CLIENT"] });
    expect(res.status).toBe(200);
    const after = publicProfile(LUCAS);
    expect(after.roles).toEqual(["CLIENT"]);
    expect(after.headline).toBe("Pintor e reparos");
    expect(after.bio).toBe("Atendo toda a região.");
    expect(after.city).toBe("Leopoldina");
    expect(ownProfile()).toEqual(after);
  });

  it("as tags de papel não dependem de haver ocupação ou apresentação", () => {
    edit({ roles: ["PROFESSIONAL", "CLIENT"], headline: "", bio: "   ", city: "Cataguases" });
    const profile = publicProfile(LUCAS);
    expect(profile.headline).toBeNull();
    expect(profile.bio).toBeNull();
    expect(profile.roles).toEqual(["PROFESSIONAL", "CLIENT"]);
  });

  it("não muda o perfil de Roberto nem o de Mariana", () => {
    const roberto = publicProfile(ROBERTO);
    const mariana = publicProfile(MARIANA);
    edit({ roles: ["CLIENT"], headline: "Outra coisa", bio: "Outro texto", city: "Muriaé" });
    expect(publicProfile(ROBERTO)).toEqual(roberto);
    expect(publicProfile(MARIANA)).toEqual(mariana);
    expect(publicProfile(ROBERTO).roles).toEqual(["PROFESSIONAL"]);
    expect(publicProfile(MARIANA).roles).toEqual(["CLIENT"]);
  });

  it("os papéis editados valem também para as preferências de uso da demonstração", () => {
    edit({ ...valid, roles: ["CLIENT"] });
    expect((call("GET", "/me/preferences").body as { preferences: unknown }).preferences).toEqual({ wantsWork: false, wantsToHire: true });
  });

  it.each([
    ["nenhum papel", { ...valid, roles: [] }, "roles"],
    ["papel desconhecido", { ...valid, roles: ["ADMIN"] }, "roles"],
    ["cidade vazia", { ...valid, city: " " }, "city"],
    ["ocupação longa demais", { ...valid, headline: "x".repeat(81) }, "headline"],
    ["apresentação longa demais", { ...valid, bio: "x".repeat(601) }, "bio"],
  ])("recusa %s com 400 e não grava nada", (_name, body, field) => {
    const before = ownProfile();
    const res = edit(body);
    expect(res.status).toBe(400);
    expect((res.body as { fields: Record<string, string> }).fields[field]).toBeTruthy();
    expect(ownProfile()).toEqual(before);
  });

  it("recusa campos que não são editáveis (telefone, e-mail, id)", () => {
    for (const extra of [{ phone: "32999990000" }, { email: "x@y.com" }, { id: "outro" }]) {
      expect(edit({ ...valid, ...extra }).status).toBe(400);
    }
    expect(JSON.stringify(ownProfile())).not.toContain("32999990000");
  });
});

describe("persistência e compatibilidade", () => {
  it("a edição sobrevive a recarregar a página", async () => {
    edit({ roles: ["PROFESSIONAL", "CLIENT"], headline: "Reparos em geral", bio: "Texto salvo.", city: "Muriaé" });
    vi.resetModules();
    const reloaded = await import("./server");
    const profile = publicProfileResponseSchema.parse(reloaded.handleDemoRequest("GET", `/profiles/${LUCAS}`).body).profile;
    expect([profile.headline, profile.bio, profile.city, profile.roles]).toEqual(["Reparos em geral", "Texto salvo.", "Muriaé", ["PROFESSIONAL", "CLIENT"]]);
  });

  it("estado antigo salvo, sem o campo de perfil (ou sem roles), carrega com o perfil original", async () => {
    testStorage.setItem(STATE_KEY, JSON.stringify({ loggedIn: true, hireStep: 2, createdJobs: [], proposals: [] }));
    vi.resetModules();
    const reloaded = await import("./server");
    const profile = publicProfileResponseSchema.parse(reloaded.handleDemoRequest("GET", `/profiles/${LUCAS}`).body).profile;
    expect(profile.headline).toBe("Pintura e pequenos reparos");
    expect(profile.roles).toEqual(["PROFESSIONAL", "CLIENT"]);
  });

  it("perfil salvo inválido (sem papéis, campo estranho, tipo errado) é descartado e o original volta", async () => {
    for (const saved of [{ roles: [], headline: null, bio: null, city: "X1" }, { roles: ["CLIENT"], headline: 5, bio: null, city: "Muriaé" }, "texto", { roles: ["CLIENT"] }]) {
      testStorage.setItem(STATE_KEY, JSON.stringify({ loggedIn: true, profile: saved }));
      vi.resetModules();
      const reloaded = await import("./server");
      const profile = publicProfileResponseSchema.parse(reloaded.handleDemoRequest("GET", `/profiles/${LUCAS}`).body).profile;
      expect(profile.roles).toEqual(["PROFESSIONAL", "CLIENT"]);
    }
  });

  it("Reiniciar volta o perfil ao original", () => {
    edit({ ...valid, roles: ["CLIENT"] });
    reset();
    expect(publicProfile(LUCAS).roles).toEqual(["PROFESSIONAL", "CLIENT"]);
  });
});

describe("serviços concluídos e avaliações de exemplo", () => {
  const history = (profile: PublicProfile) => groupProfileHistory(profile);

  it("Roberto: duas publicações agrupadas com a avaliação do mesmo serviço, uma publicação sem avaliação e uma avaliação sem publicação", () => {
    const grouped = history(publicProfile(ROBERTO));
    const pairs = grouped.items.map((item) => [item.service.id, item.review?.author ?? null]);
    expect(pairs).toEqual([
      ["demo-service-roberto-chuveiro", "Helena M."],
      ["demo-service-roberto-tomadas", "Sérgio P."],
      ["demo-service-roberto-quadro", null],
    ]);
    expect(grouped.standaloneReviews.map((review) => review.author)).toEqual(["Ana Clara R."]);
  });

  it("o resumo de nota continua contando todas as avaliações, ligadas ou não", () => {
    const roberto = publicProfile(ROBERTO);
    expect(roberto.rating?.count).toBe(3);
    expect(roberto.reviews).toHaveLength(3);
  });

  it("Lucas também tem os três casos; Mariana (só contrata) não tem histórico", () => {
    const lucas = history(publicProfile(LUCAS));
    expect(lucas.items.map((item) => item.review !== null)).toEqual([true, false]);
    expect(lucas.standaloneReviews).toHaveLength(1);
    expect(history(publicProfile(MARIANA)).items).toEqual([]);
  });

  it("cada publicação traz descrição, data e espaços de foto, e nenhuma imagem, URL ou arquivo", () => {
    for (const id of [LUCAS, ROBERTO]) {
      const profile = publicProfile(id);
      for (const service of profile.completedServices) {
        expect(service.description.length).toBeGreaterThan(20);
        expect(Number.isFinite(Date.parse(service.completedAt))).toBe(true);
        expect(service.photoCount).toBeGreaterThan(0);
      }
      expect(JSON.stringify(profile)).not.toMatch(/https?:|data:image|\.(png|jpe?g|webp|gif)/i);
    }
  });

  it("o perfil é marcado como demonstrativo, para a tela avisar que os exemplos são fictícios", () => {
    for (const id of [LUCAS, ROBERTO, MARIANA]) expect(publicProfile(id).isDemo).toBe(true);
  });
});
