import { describe, expect, it } from "vitest";
import {
  PROFILE_BIO_MAX,
  PROFILE_HEADLINE_MAX,
  PROFILE_ROLE_REQUIRED_MESSAGE,
  buildUpdateProfileRequest,
  preferencesFromRoles,
  profileToFormValues,
  toggleProfileRole,
  updateProfileSchema,
  type ProfileFormValues,
} from "./profile-edit";
import { publicProfileSchema, groupProfileHistory } from "./profiles";

const values = (overrides: Partial<ProfileFormValues> = {}): ProfileFormValues => ({
  roles: ["PROFESSIONAL"],
  headline: "Eletricista residencial",
  bio: "Faço instalações e reparos.",
  city: "Cataguases",
  ...overrides,
});

describe("buildUpdateProfileRequest", () => {
  it("aceita um perfil válido e tira os espaços das pontas", () => {
    const result = buildUpdateProfileRequest(values({ headline: "  Pintor  ", city: " Leopoldina " }));
    expect(result).toEqual({ ok: true, request: { roles: ["PROFESSIONAL"], headline: "Pintor", bio: "Faço instalações e reparos.", city: "Leopoldina" } });
  });

  it("ocupação e apresentação são opcionais: vazias viram null", () => {
    const result = buildUpdateProfileRequest(values({ headline: "   ", bio: "" }));
    expect(result.ok && result.request.headline).toBeNull();
    expect(result.ok && result.request.bio).toBeNull();
  });

  it("exige ao menos um papel", () => {
    const result = buildUpdateProfileRequest(values({ roles: [] }));
    expect(result).toEqual({ ok: false, errors: { roles: PROFILE_ROLE_REQUIRED_MESSAGE } });
  });

  it("aceita os dois papéis", () => {
    const result = buildUpdateProfileRequest(values({ roles: ["PROFESSIONAL", "CLIENT"] }));
    expect(result.ok && result.request.roles).toEqual(["PROFESSIONAL", "CLIENT"]);
  });

  it("exige cidade e respeita os limites de tamanho", () => {
    const empty = buildUpdateProfileRequest(values({ city: " " }));
    expect(empty.ok).toBe(false);
    expect(!empty.ok && empty.errors.city).toBeTruthy();
    const longHeadline = buildUpdateProfileRequest(values({ headline: "x".repeat(PROFILE_HEADLINE_MAX + 1) }));
    expect(!longHeadline.ok && longHeadline.errors.headline).toContain(String(PROFILE_HEADLINE_MAX));
    const longBio = buildUpdateProfileRequest(values({ bio: "x".repeat(PROFILE_BIO_MAX + 1) }));
    expect(!longBio.ok && longBio.errors.bio).toContain(String(PROFILE_BIO_MAX));
    expect(buildUpdateProfileRequest(values({ bio: "x".repeat(PROFILE_BIO_MAX) })).ok).toBe(true);
  });

  it("rejeita caracteres de controle", () => {
    expect(buildUpdateProfileRequest(values({ bio: "texto\u0007" })).ok).toBe(false);
    expect(buildUpdateProfileRequest(values({ bio: "linha 1\nlinha 2" })).ok).toBe(true);
  });
});

describe("updateProfileSchema (contrato da API)", () => {
  it("é estrito: e-mail, telefone, id e preferências não entram", () => {
    for (const extra of [{ email: "a@b.com" }, { phone: "32999990000" }, { id: "x" }, { wantsWork: true }, { avatarUrl: "x" }]) {
      expect(updateProfileSchema.safeParse({ roles: ["CLIENT"], headline: null, bio: null, city: "Muriaé", ...extra }).success).toBe(false);
    }
  });

  it("rejeita papéis desconhecidos ou repetidos", () => {
    const base = { headline: null, bio: null, city: "Muriaé" };
    expect(updateProfileSchema.safeParse({ ...base, roles: ["ADMIN"] }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ ...base, roles: ["CLIENT", "CLIENT"] }).success).toBe(false);
  });
});

describe("papéis", () => {
  it("toggleProfileRole liga e desliga mantendo a ordem fixa", () => {
    expect(toggleProfileRole(["CLIENT"], "PROFESSIONAL")).toEqual(["PROFESSIONAL", "CLIENT"]);
    expect(toggleProfileRole(["PROFESSIONAL", "CLIENT"], "PROFESSIONAL")).toEqual(["CLIENT"]);
    expect(toggleProfileRole([], "CLIENT")).toEqual(["CLIENT"]);
  });

  it("preferencesFromRoles liga encontrar trabalho e contratar alguém", () => {
    expect(preferencesFromRoles(["PROFESSIONAL"])).toEqual({ wantsWork: true, wantsToHire: false });
    expect(preferencesFromRoles(["CLIENT"])).toEqual({ wantsWork: false, wantsToHire: true });
    expect(preferencesFromRoles(["PROFESSIONAL", "CLIENT"])).toEqual({ wantsWork: true, wantsToHire: true });
  });

  it("profileToFormValues usa texto vazio para o que não existe", () => {
    const profile = publicProfileSchema.parse({ id: "1", name: "A", city: "B", state: null, avatarUrl: null, bio: null, services: [] });
    expect(profileToFormValues(profile)).toEqual({ roles: [], headline: "", bio: "", city: "B" });
  });
});

describe("groupProfileHistory", () => {
  const service = (id: string, completedAt: string) => ({ id, title: `Serviço ${id}`, description: "Descrição do serviço concluído.", completedAt, photoCount: 2 });
  const review = (author: string, serviceId: string | null, serviceTitle: string | null = null) => ({
    author,
    rating: 5,
    comment: "Ótimo.",
    serviceTitle,
    serviceId,
    createdAt: "2026-10-01T12:00:00.000Z",
  });

  it("agrupa a avaliação com o serviço pelo identificador, não pelo nome nem pelo título", () => {
    const grouped = groupProfileHistory({
      completedServices: [service("s1", "2026-09-01T00:00:00Z"), service("s2", "2026-09-10T00:00:00Z")],
      // O título da avaliação coincide com o s2, mas o identificador é do s1: vale o identificador.
      reviews: [review("Helena", "s1", "Serviço s2")],
    });
    expect(grouped.items.map((item) => [item.service.id, item.review?.author ?? null])).toEqual([
      ["s2", null],
      ["s1", "Helena"],
    ]);
    expect(grouped.standaloneReviews).toEqual([]);
  });

  it("publicação sem avaliação e avaliação sem publicação existem independentes", () => {
    const grouped = groupProfileHistory({
      completedServices: [service("s1", "2026-09-01T00:00:00Z")],
      reviews: [review("Ana", null, "Troca de tomadas"), review("Paulo", "inexistente")],
    });
    expect(grouped.items).toEqual([{ service: expect.objectContaining({ id: "s1" }), review: null }]);
    expect(grouped.standaloneReviews.map((item) => item.author)).toEqual(["Ana", "Paulo"]);
  });

  it("duas avaliações do mesmo serviço: a primeira agrupa, a outra fica à parte", () => {
    const grouped = groupProfileHistory({
      completedServices: [service("s1", "2026-09-01T00:00:00Z")],
      reviews: [review("A", "s1"), review("B", "s1")],
    });
    expect(grouped.items[0]?.review?.author).toBe("A");
    expect(grouped.standaloneReviews.map((item) => item.author)).toEqual(["B"]);
  });

  it("perfis antigos, sem serviços concluídos nem serviceId, continuam válidos", () => {
    const profile = publicProfileSchema.parse({
      id: "1",
      name: "A",
      city: "B",
      state: null,
      avatarUrl: null,
      bio: null,
      services: [],
      reviews: [{ author: "X", rating: 4, comment: "ok", createdAt: "2026-01-01T00:00:00Z" }],
    });
    expect(profile.completedServices).toEqual([]);
    expect(profile.reviews[0]?.serviceId).toBeNull();
    expect(groupProfileHistory(profile).standaloneReviews).toHaveLength(1);
  });
});
