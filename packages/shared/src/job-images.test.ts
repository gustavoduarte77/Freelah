import { describe, expect, it } from "vitest";
import { jobDetailSchema, jobSummarySchema } from "./jobs";
import { MAX_IMAGE_CHARS, MAX_JOB_IMAGES, makeCover, validateJobImages } from "./job-images";

const photo = (tag = "AAAA") => `data:image/jpeg;base64,${tag}`;

describe("validateJobImages", () => {
  it("aceita nenhuma foto e até o máximo", () => {
    expect(validateJobImages([])).toEqual({ ok: true, images: [] });
    const five = Array.from({ length: MAX_JOB_IMAGES }, (_, i) => photo(`A${i}AA`));
    expect(validateJobImages(five)).toEqual({ ok: true, images: five });
  });

  it("recusa mais do que o máximo", () => {
    const six = Array.from({ length: MAX_JOB_IMAGES + 1 }, () => photo());
    expect(validateJobImages(six)).toMatchObject({ ok: false });
  });

  it("recusa o que não é lista, nem data URL JPEG", () => {
    expect(validateJobImages("x")).toMatchObject({ ok: false });
    expect(validateJobImages([123])).toMatchObject({ ok: false });
    expect(validateJobImages(["https://example.com/a.jpg"])).toMatchObject({ ok: false });
    expect(validateJobImages(["data:image/svg+xml;base64,AAAA"])).toMatchObject({ ok: false });
    expect(validateJobImages([`data:image/jpeg;base64,<script>`])).toMatchObject({ ok: false });
  });

  it("recusa foto acima do tamanho máximo", () => {
    const big = `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS)}`;
    expect(validateJobImages([big])).toMatchObject({ ok: false });
  });
});

describe("makeCover", () => {
  it("leva a foto escolhida para o começo, sem perder nem repetir as outras", () => {
    expect(makeCover(["a", "b", "c", "d"], 2)).toEqual(["c", "a", "b", "d"]);
  });

  it("não muda nada se já é a capa ou o índice não existe", () => {
    expect(makeCover(["a", "b"], 0)).toEqual(["a", "b"]);
    expect(makeCover(["a", "b"], 5)).toEqual(["a", "b"]);
    expect(makeCover(["a", "b"], -1)).toEqual(["a", "b"]);
  });
});

describe("contratos com fotos (compatíveis com a API que ainda não as envia)", () => {
  const base = {
    id: "1",
    title: "Título",
    excerpt: "Resumo",
    category: { slug: "x", name: "X" },
    city: "Cataguases",
    state: "MG",
    scheduledDate: "2030-01-01",
    startTime: "08:00",
    proposedPriceCents: 1000,
    negotiable: false,
    status: "PUBLISHED",
    isDemo: false,
    publishedAt: "2030-01-01T00:00:00.000Z",
  };

  it("resumo sem o campo continua válido (sem fotos); com o campo mantém o número", () => {
    expect(jobSummarySchema.parse(base).photoCount).toBeUndefined();
    expect(jobSummarySchema.parse({ ...base, photoCount: 3 }).photoCount).toBe(3);
  });

  it("detalhe sem o campo vem sem fotos; com o campo mantém a ordem", () => {
    const detail = {
      ...base,
      description: "Descrição",
      additionalInfo: null,
      expiresAt: "2030-01-01T00:00:00.000Z",
      owner: { name: "A", city: "B", isDemo: false },
      acceptingInterests: true,
      statusMessage: null,
    };
    expect(jobDetailSchema.parse(detail).images).toBeUndefined();
    expect(jobDetailSchema.parse({ ...detail, images: [photo("AAAA"), photo("BBBB")] }).images).toEqual([photo("AAAA"), photo("BBBB")]);
  });
});
