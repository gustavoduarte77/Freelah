import { describe, expect, it } from "vitest";
import { foldSearchText, searchProfessionals, type ProfessionalEntry } from "./professional-search";
import { publicProfileSchema } from "./profiles";

const profile = (fields: Record<string, unknown>) =>
  publicProfileSchema.parse({ city: "Cataguases", state: "MG", avatarUrl: null, bio: null, ...fields });

const roberto: ProfessionalEntry = {
  profile: profile({ id: "r", name: "Roberto Andrade", headline: "Eletricista residencial", services: ["Instalação de chuveiros", "Troca de tomadas"] }),
  categories: ["servicos-de-manutencao"],
};
const lucas: ProfessionalEntry = {
  profile: profile({ id: "l", name: "Lucas Oliveira", services: ["Pintura residencial"] }),
  categories: ["construcao-civil", "servicos-de-manutencao"],
};
const mariana: ProfessionalEntry = { profile: profile({ id: "m", name: "Mariana Costa", services: [] }), categories: [] };
const all = [roberto, lucas, mariana];
const ids = (entries: ProfessionalEntry[]) => entries.map((entry) => entry.profile.id);

describe("foldSearchText", () => {
  it("ignora acentos, maiúsculas e espaços nas pontas", () => {
    expect(foldSearchText("  Elétrica ")).toBe("eletrica");
  });
});

describe("searchProfessionals", () => {
  it("sem busca nem categoria lista só quem oferece serviços, na ordem recebida", () => {
    expect(ids(searchProfessionals(all, "", null))).toEqual(["r", "l"]);
  });

  it("busca por nome, ocupação e serviço, sem acento", () => {
    expect(ids(searchProfessionals(all, "roberto", null))).toEqual(["r"]);
    expect(ids(searchProfessionals(all, "eletricista", null))).toEqual(["r"]);
    expect(ids(searchProfessionals(all, "instalacao chuveiro", null))).toEqual(["r"]);
    expect(ids(searchProfessionals(all, "PINTURA", null))).toEqual(["l"]);
    expect(ids(searchProfessionals(all, "residencial", null))).toEqual(["r", "l"]);
  });

  it("todas as palavras precisam aparecer", () => {
    expect(ids(searchProfessionals(all, "roberto pintura", null))).toEqual([]);
  });

  it("filtra por categoria e combina com a busca", () => {
    expect(ids(searchProfessionals(all, "", "construcao-civil"))).toEqual(["l"]);
    expect(ids(searchProfessionals(all, "", "servicos-de-manutencao"))).toEqual(["r", "l"]);
    expect(ids(searchProfessionals(all, "tomadas", "construcao-civil"))).toEqual([]);
  });

  it("quem só contrata nunca aparece, nem buscando pelo nome", () => {
    expect(ids(searchProfessionals(all, "mariana", null))).toEqual([]);
  });
});
