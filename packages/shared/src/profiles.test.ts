import { describe, expect, it } from "vitest";
import { conversationSchema } from "./chat";
import { formatRating, publicProfileResponseSchema } from "./profiles";

describe("formatRating", () => {
  it("usa uma casa decimal com vírgula", () => {
    expect(formatRating(14 / 3)).toBe("4,7");
    expect(formatRating(5)).toBe("5,0");
  });
});

const profile = {
  id: "p1",
  name: "Mariana Costa",
  city: "Cataguases",
  state: "MG",
  avatarUrl: null,
  bio: "Moro em Cataguases.",
  services: [],
};

describe("publicProfileResponseSchema", () => {
  it("aceita um perfil sem foto, sem apresentação e sem serviços", () => {
    const parsed = publicProfileResponseSchema.safeParse({ profile: { ...profile, bio: null } });
    expect(parsed.success).toBe(true);
  });

  it("descarta dados privados que venham por engano", () => {
    const parsed = publicProfileResponseSchema.parse({ profile: { ...profile, phone: "32999999999", email: "x@y.com" } });
    expect(parsed.profile).not.toHaveProperty("phone");
    expect(parsed.profile).not.toHaveProperty("email");
  });

  it("perfil sem avaliações nem ocupação (como os já existentes) recebe os padrões", () => {
    const parsed = publicProfileResponseSchema.parse({ profile });
    expect(parsed.profile.headline).toBeNull();
    expect(parsed.profile.rating).toBeNull();
    expect(parsed.profile.reviews).toEqual([]);
    expect(parsed.profile.isDemo).toBe(false);
  });

  it("aceita avaliações de 1 a 5 e rejeita notas fora disso", () => {
    const review = { author: "Helena M.", rating: 5, comment: "Ótimo.", createdAt: "2026-10-01T12:00:00.000Z" };
    const withReview = (rating: number) => ({ profile: { ...profile, rating: { average: rating, count: 1 }, reviews: [{ ...review, rating }] } });
    const parsed = publicProfileResponseSchema.parse(withReview(5));
    expect(parsed.profile.reviews[0]?.serviceTitle).toBeNull();
    expect(publicProfileResponseSchema.safeParse(withReview(0)).success).toBe(false);
    expect(publicProfileResponseSchema.safeParse(withReview(6)).success).toBe(false);
  });

  it("rejeita um perfil sem nome", () => {
    const { name: _name, ...rest } = profile;
    expect(publicProfileResponseSchema.safeParse({ profile: rest }).success).toBe(false);
  });
});

describe("conversationSchema.other.profileId", () => {
  const conversation = {
    id: "c1",
    job: { id: "j1", title: "Pintura", status: "PUBLISHED", proposedPriceCents: 100, scheduledDate: "2026-10-20", startTime: "09:00", city: "C", state: "MG" },
    canSend: true,
    blockedReason: null,
  };

  it("é opcional: a resposta da API real (só com o nome) continua válida", () => {
    const parsed = conversationSchema.parse({ ...conversation, other: { name: "Mariana" } });
    expect(parsed.other.profileId).toBeUndefined();
  });

  it("é mantido quando o servidor informa o perfil", () => {
    const parsed = conversationSchema.parse({ ...conversation, other: { name: "Mariana", profileId: "p1" } });
    expect(parsed.other.profileId).toBe("p1");
  });
});
