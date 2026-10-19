import { jobDetailSchema, jobsResponseSchema, publicProfileResponseSchema } from "@freelah/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDemoRequest } from "./server";
import { reset, setLoggedIn } from "./store";
import { testStorage } from "./test/local-storage";

// Categorias de tecnologia e criação com anúncios de exemplo, e os papéis públicos dos perfis.

const call = (method: string, path: string) => handleDemoRequest(method, path);

const ORIGINAL = ["servicos-domesticos", "servicos-comerciais", "construcao-civil", "servicos-de-manutencao", "aulas-particulares"];
const NEW_SLUGS = ["tecnologia-e-suporte", "sites-e-aplicativos", "design-e-criacao-digital"];

beforeEach(() => {
  reset();
  setLoggedIn(true);
});

const listBy = (slug: string) => jobsResponseSchema.parse(call("GET", `/jobs?category=${slug}&limit=50`).body).jobs;

describe("categorias da demonstração", () => {
  it("são oito: as cinco originais continuam e as três novas foram acrescentadas", () => {
    const slugs = (call("GET", "/categories").body as { categories: Array<{ slug: string }> }).categories.map((c) => c.slug);
    expect(slugs).toHaveLength(8);
    for (const slug of [...ORIGINAL, ...NEW_SLUGS]) expect(slugs).toContain(slug);
    expect(new Set(slugs).size).toBe(8);
  });

  it("os ids das categorias têm formato de UUID (o formulário de publicar valida assim)", () => {
    const ids = (call("GET", "/categories").body as { categories: Array<{ id: string }> }).categories.map((c) => c.id);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it.each(NEW_SLUGS)("%s tem anúncios de exemplo publicados, só dela, com valor e fotos", (slug) => {
    const jobs = listBy(slug);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    for (const job of jobs) {
      expect(job.category.slug).toBe(slug);
      expect(job.proposedPriceCents).toBeGreaterThan(0);
      expect(job.photoCount ?? 0).toBeGreaterThan(0);
      const detail = jobDetailSchema.parse(call("GET", `/jobs/${job.id}`).body);
      expect(detail.description.length).toBeGreaterThan(40);
      // Fotos de exemplo são só espaços reservados: nenhuma imagem real nem URL externa.
      expect(detail.images ?? []).toEqual([]);
    }
  });

  it("as categorias originais continuam com seus anúncios", () => {
    for (const slug of ORIGINAL) expect(listBy(slug).length).toBeGreaterThan(0);
  });

  it("os anúncios novos aparecem na lista geral e a busca os encontra", () => {
    const all = jobsResponseSchema.parse(call("GET", "/jobs?limit=50").body).jobs;
    expect(new Set(all.map((job) => job.id)).size).toBe(all.length);
    for (const slug of NEW_SLUGS) expect(all.some((job) => job.category.slug === slug)).toBe(true);
    const found = jobsResponseSchema.parse(call("GET", `/jobs?q=${encodeURIComponent("logotipo")}`).body).jobs;
    expect(found.map((job) => job.category.slug)).toContain("design-e-criacao-digital");
  });
});

describe("papéis públicos dos perfis (demonstração)", () => {
  const rolesOf = (id: string) => publicProfileResponseSchema.parse(call("GET", `/profiles/${id}`).body).profile.roles;

  it("Mariana é Contratante, Roberto é Profissional e Lucas tem os dois", () => {
    expect(rolesOf("demo-profile-mariana")).toEqual(["CLIENT"]);
    expect(rolesOf("demo-profile-roberto")).toEqual(["PROFESSIONAL"]);
    expect(rolesOf("demo-profile-lucas")).toEqual(["PROFESSIONAL", "CLIENT"]);
  });

  it("estado antigo salvo no navegador (sem campos novos) continua carregando e os papéis seguem corretos", async () => {
    testStorage.setItem("freelah:demo:state:v1", JSON.stringify({ loggedIn: true, hireStep: 2 }));
    vi.resetModules();
    const reloaded = await import("./server");
    const profile = publicProfileResponseSchema.parse(reloaded.handleDemoRequest("GET", "/profiles/demo-profile-roberto").body).profile;
    expect(profile.roles).toEqual(["PROFESSIONAL"]);
    const categories = reloaded.handleDemoRequest("GET", "/categories").body as { categories: unknown[] };
    expect(categories.categories).toHaveLength(8);
  });
});

describe("conversas e perfis de exemplo", () => {
  const list = () => (call("GET", "/me/conversations").body as { conversations: Array<{ id: string; other: { name: string; profileId?: string }; job: { title: string }; lastMessage: { content: string } | null }> }).conversations;

  it("há 5 conversas, cada uma com a pessoa certa, o serviço certo e o perfil abrindo", () => {
    const conversations = list();
    expect(conversations).toHaveLength(5);
    expect(new Set(conversations.map((item) => item.id)).size).toBe(5);
    expect(conversations.map((item) => [item.other.name, item.job.title])).toEqual([
      ["Mariana Costa", "Pintura de sala residencial"],
      ["Roberto Andrade", "Troca de chuveiro e tomadas da cozinha"],
      ["Carlos Almeida", "Instalação de ventilador de teto"],
      ["Fernanda Lima", "Reparo de torneira e vazamento na cozinha"],
      ["Paulo Henrique", "Troca de revestimento de banheiro"],
    ]);
    for (const item of conversations) expect(call("GET", `/profiles/${item.other.profileId}`).status).toBe(200);
    // as de exemplo já chegam com mensagens (os dois roteiros começam vazios e avançam pelos controles)
    for (const item of conversations.slice(2)) expect(item.lastMessage?.content.length).toBeGreaterThan(10);
  });

  it("há pelo menos 5 perfis, todos com nome e papéis", () => {
    const ids = ["demo-profile-mariana", "demo-profile-lucas", "demo-profile-roberto", "demo-profile-carlos", "demo-profile-fernanda", "demo-profile-paulo"];
    for (const id of ids) {
      const profile = publicProfileResponseSchema.parse(call("GET", `/profiles/${id}`).body).profile;
      expect(profile.name.length).toBeGreaterThan(3);
      expect(profile.roles.length).toBeGreaterThan(0);
    }
  });

  it.each(["demo-conversation-ventilador", "demo-conversation-torneira", "demo-conversation-banheiro"])("%s abre, mostra as mensagens em ordem e não deixa enviar", (id) => {
    const detail = (call("GET", `/me/conversations/${id}`).body as { conversation: { canSend: boolean; viewerIsOwner: boolean } }).conversation;
    expect(detail.canSend).toBe(false);
    expect(detail.viewerIsOwner).toBe(false);
    const messages = (call("GET", `/me/conversations/${id}/messages`).body as { messages: Array<{ id: string; createdAt: string }> }).messages;
    expect(messages).toHaveLength(5);
    expect(messages.map((message) => message.createdAt)).toEqual([...messages.map((message) => message.createdAt)].sort());
    const after = (call("GET", `/me/conversations/${id}/messages?after=${messages[2]!.id}`).body as { messages: unknown[] }).messages;
    expect(after).toHaveLength(2);
    expect(handleDemoRequest("POST", `/me/conversations/${id}/messages`, JSON.stringify({ content: "oi" })).status).toBeGreaterThanOrEqual(400);
  });

  it("valor fixo (ventilador, torneira) não aceita proposta; valor negociável (banheiro) aceita e o preço público não muda", () => {
    for (const id of ["demo-conversation-ventilador", "demo-conversation-torneira"]) {
      const state = call("GET", `/me/conversations/${id}/proposals`).body as { canPropose: boolean; proposeBlockedReason: string };
      expect(state.canPropose).toBe(false);
      expect(state.proposeBlockedReason).toMatch(/valor fixo/);
    }
    const id = "demo-conversation-banheiro";
    const before = call("GET", "/jobs/demo-job-banheiro").body as { proposedPriceCents: number };
    expect((call("GET", `/me/conversations/${id}/proposals`).body as { canPropose: boolean }).canPropose).toBe(true);
    const sent = handleDemoRequest("POST", `/me/conversations/${id}/proposals`, JSON.stringify({ amountCents: 165000 }));
    expect(sent.status).toBe(201);
    expect(call("GET", "/jobs/demo-job-banheiro").body).toMatchObject({ proposedPriceCents: before.proposedPriceCents, negotiable: true });
    // uma proposta não aparece nas outras conversas
    expect((call("GET", "/me/conversations/demo-conversation-eletrica/proposals").body as { proposals: unknown[] }).proposals).toEqual([]);
  });

  it("o interesse de cada exemplo abre a conversa dele", () => {
    const interests = (call("GET", "/me/interests").body as { interests: Array<{ id: string; job: { title: string } }> }).interests;
    const open = (interestId: string) => (handleDemoRequest("POST", `/me/interests/${interestId}/conversation`).body as { conversation?: { id: string } }).conversation?.id;
    expect(open("demo-interest-ventilador")).toBe("demo-conversation-ventilador");
    expect(open("demo-interest-torneira")).toBe("demo-conversation-torneira");
    expect(open("demo-interest-banheiro")).toBe("demo-conversation-banheiro");
    expect(interests.some((item) => item.job.title.includes("revestimento"))).toBe(true);
  });
});
