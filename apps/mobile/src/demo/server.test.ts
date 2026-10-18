import { buildCreateJobRequest, conversationListItemSchema, emptyJobForm, type JobFormValues } from "@freelah/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishPhotos } from "../features/publish/photos";
import { handleDemoRequest } from "./server";
import { getState, reset, setLoggedIn } from "./store";
import { testStorage } from "./test/local-storage";

const call = (method: string, path: string, body?: unknown) =>
  handleDemoRequest(method, path, body === undefined ? undefined : JSON.stringify(body));

const br = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

/** Uma categoria como o formulário a recebe: do próprio GET /categories do servidor simulado. */
const firstCategoryId = () => (call("GET", "/categories").body as { categories: Array<{ id: string }> }).categories[0]!.id;

function filledForm(overrides: Partial<JobFormValues> = {}): JobFormValues {
  return {
    ...emptyJobForm({ city: "Cataguases" }),
    title: "Montagem de estante de aço",
    description: "Montar uma estante de aço de cinco prateleiras na sala, com as ferramentas já em casa.",
    categoryId: firstCategoryId(),
    state: "MG",
    scheduledDate: br(10),
    startTime: "09:00",
    price: "150",
    deadlineDate: br(9),
    ...overrides,
  };
}

function buildRequest(overrides: Partial<JobFormValues> = {}) {
  const built = buildCreateJobRequest(filledForm(overrides), new Date());
  if (!built.ok) throw new Error(`formulário recusado: ${JSON.stringify(built.errors)}`);
  return built.request;
}

type Own = { id: string; status: string; canPublish: boolean; title: string };
const ownJobs = () => (call("GET", "/me/jobs").body as { jobs: Own[] }).jobs;
const publicIds = () => (call("GET", "/jobs?limit=50").body as { jobs: Array<{ id: string }> }).jobs.map((job) => job.id);

beforeEach(() => {
  reset();
  setLoggedIn(true);
});

describe("publicar no Modo Demonstração", () => {
  it("as categorias do servidor simulado passam na validação do formulário (UUID)", () => {
    const built = buildCreateJobRequest(filledForm(), new Date());
    expect(built.ok).toBe(true);
  });

  it("publica na criação: aparece em Explorar, no detalhe e em Minhas oportunidades", () => {
    const response = call("POST", "/me/jobs", { ...buildRequest(), publish: true });
    expect(response.status).toBe(201);
    const job = (response.body as { job: Own }).job;
    expect(job).toMatchObject({ title: "Montagem de estante de aço", status: "PUBLISHED", canPublish: false });

    expect(publicIds()).toContain(job.id);
    expect(call("GET", `/jobs/${job.id}`).status).toBe(200);
    expect(ownJobs().map((own) => own.id)).toContain(job.id);
    expect(call("GET", `/jobs/${job.id}/viewer`).body).toEqual({ isOwner: true, interest: null });
  });

  it("rascunho só aparece para a dona e vira público ao publicar", () => {
    const created = (call("POST", "/me/jobs", buildRequest()).body as { job: Own }).job;
    expect(created).toMatchObject({ status: "DRAFT", canPublish: true });

    expect(publicIds()).not.toContain(created.id);
    expect(call("GET", `/jobs/${created.id}`).status).toBe(404);
    expect(ownJobs().find((own) => own.id === created.id)?.status).toBe("DRAFT");

    const published = call("POST", `/me/jobs/${created.id}/publish`);
    expect(published.status).toBe(200);
    expect((published.body as { job: Own }).job.status).toBe("PUBLISHED");
    expect(publicIds()).toContain(created.id);
    expect(call("GET", `/jobs/${created.id}`).status).toBe(200);
  });

  it("não publica duas vezes, nem uma oportunidade do roteiro, nem um id inexistente", () => {
    const created = (call("POST", "/me/jobs", { ...buildRequest(), publish: true }).body as { job: Own }).job;
    expect(call("POST", `/me/jobs/${created.id}/publish`).status).toBe(409);
    expect(call("POST", "/me/jobs/demo-job-violao/publish").status).toBe(409);
    expect(call("POST", "/me/jobs/nao-existe/publish").status).toBe(404);
  });

  it("recusa dados inválidos com mensagens por campo e não grava nada", () => {
    const before = getState().createdJobs.length;
    const response = call("POST", "/me/jobs", { ...buildRequest(), categoryId: "demo-cat-manutencao", title: "x" });
    expect(response.status).toBe(400);
    const body = response.body as { error: string; fields: Record<string, string> };
    expect(body.error).toBe("validation_error");
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(["title", "categoryId"]));

    const unknownCategory = call("POST", "/me/jobs", { ...buildRequest(), categoryId: "00000000-0000-4000-8000-000000000000" });
    expect(unknownCategory.status).toBe(400);
    expect((unknownCategory.body as { fields: Record<string, string> }).fields).toHaveProperty("categoryId");

    const past = call("POST", "/me/jobs", { ...buildRequest(), scheduledDate: "2020-01-01" });
    expect(past.status).toBe(400);
    expect(getState().createdJobs.length).toBe(before);
  });

  it("exige estar logado", () => {
    setLoggedIn(false);
    expect(call("POST", "/me/jobs", buildRequest()).status).toBe(401);
  });

  it("mantém as oportunidades do roteiro e some com as criadas ao reiniciar", () => {
    const seeded = ownJobs().map((own) => own.id);
    expect(seeded).toEqual(expect.arrayContaining(["demo-job-guarda-roupa", "demo-job-violao", "demo-job-eletrica"]));
    const created = (call("POST", "/me/jobs", { ...buildRequest(), publish: true }).body as { job: Own }).job;
    expect(ownJobs()[0]?.id).toBe(created.id);
    reset();
    setLoggedIn(true);
    expect(ownJobs().map((own) => own.id)).toEqual(seeded);
    expect(call("GET", `/jobs/${created.id}`).status).toBe(404);
  });
});

describe("conversas e perfis no Modo Demonstração", () => {
  it("a lista de conversas aponta o perfil público de cada pessoa (base do botão Conversar)", () => {
    const { conversations } = call("GET", "/me/conversations").body as { conversations: unknown[] };
    const parsed = conversations.map((item) => conversationListItemSchema.parse(item));
    const profileIds = parsed.map((item) => item.other.profileId);
    expect(profileIds).toEqual(["demo-profile-mariana", "demo-profile-roberto"]);
    for (const id of profileIds) expect(call("GET", `/profiles/${id}`).status).toBe(200);
  });
});

// --- Fotos das oportunidades ---------------------------------------------------

const jpeg = (seed: string, size = 400) => `data:image/jpeg;base64,${seed.repeat(Math.ceil(size / seed.length)).slice(0, size)}`;
type Detail = { images?: string[]; photoCount?: number };
const imageKeys = () => [...Array(testStorage.length).keys()].map((i) => testStorage.key(i)).filter((key) => key?.includes(":images:"));
const detailOf = (id: string) => call("GET", `/jobs/${id}`).body as Detail;
const createWithPhotos = (images: string[], extra: Record<string, unknown> = { publish: true }) => {
  publishPhotos.replace(images);
  return call("POST", "/me/jobs", { ...buildRequest(), ...extra });
};

describe("fotos das oportunidades", () => {
  beforeEach(() => {
    publishPhotos.clear();
    testStorage.limitChars = null;
  });

  it("guarda as fotos na ordem (capa primeiro) e mostra no detalhe e na lista", () => {
    const photos = [jpeg("AAAA"), jpeg("BBBB"), jpeg("CCCC")];
    const created = (createWithPhotos(photos).body as { job: Own }).job;
    expect(detailOf(created.id).images).toEqual(photos);
    expect(detailOf(created.id).photoCount).toBe(3);
    const listed = (call("GET", "/jobs?limit=50").body as { jobs: Array<{ id: string; photoCount?: number }> }).jobs;
    expect(listed.find((job) => job.id === created.id)?.photoCount).toBe(3);
  });

  it("a capa escolhida vai para o começo e é a que o detalhe mostra primeiro", () => {
    const [a, b, c] = [jpeg("AAAA"), jpeg("BBBB"), jpeg("CCCC")] as [string, string, string];
    publishPhotos.replace([a, b, c]);
    publishPhotos.setCover(2);
    expect(publishPhotos.getState().images).toEqual([c, a, b]);
    const created = (call("POST", "/me/jobs", { ...buildRequest(), publish: true }).body as { job: Own }).job;
    expect(detailOf(created.id).images?.[0]).toBe(c);
  });

  it("sem fotos a oportunidade continua válida, sem imagens", () => {
    const created = (createWithPhotos([]).body as { job: Own }).job;
    expect(detailOf(created.id).images).toEqual([]);
    expect(detailOf(created.id).photoCount).toBe(0);
  });

  it("rascunho com fotos mantém as fotos ao ser publicado", () => {
    const photos = [jpeg("AAAA"), jpeg("BBBB")];
    const draft = (createWithPhotos(photos, {}).body as { job: Own }).job;
    expect(draft.status).toBe("DRAFT");
    call("POST", `/me/jobs/${draft.id}/publish`);
    expect(detailOf(draft.id).images).toEqual(photos);
  });

  it("as oportunidades fictícias indicam fotos pelo número, sem imagens", () => {
    const pintura = detailOf("demo-job-pintura");
    expect(pintura.photoCount).toBeGreaterThan(0);
    expect(pintura.images).toEqual([]);
    expect(detailOf("demo-job-limpeza-obra").photoCount).toBe(0);
  });

  it("as fotos sobrevivem a recarregar a página (estado e fotos relidos do armazenamento)", async () => {
    const photos = [jpeg("AAAA"), jpeg("BBBB")];
    const created = (createWithPhotos(photos).body as { job: Own }).job;
    vi.resetModules();
    const reloaded = await import("./server");
    const call2 = (path: string) => reloaded.handleDemoRequest("GET", path).body as Detail & { jobs?: Own[] };
    expect(call2(`/jobs/${created.id}`).images).toEqual(photos);
    expect(call2("/me/jobs").jobs?.map((job) => job.id)).toContain(created.id);
  });

  it("sem espaço no armazenamento não cria nada e explica o motivo", () => {
    testStorage.limitChars = 600;
    const before = getState().createdJobs.length;
    const response = createWithPhotos([jpeg("AAAA", 5000)]);
    expect(response.status).toBe(409);
    const body = response.body as { error: string; message: string };
    expect(body.error).toBe("images_not_saved");
    expect(body.message).toMatch(/espaço/);
    expect(getState().createdJobs.length).toBe(before);
    expect(imageKeys()).toEqual([]);
  });

  it("respeita o orçamento total de fotos: a que não cabe é recusada, as anteriores seguem salvas", () => {
    const big = Array.from({ length: 5 }, (_, i) => jpeg(`${"ABCDE"[i]}AAA`, 190_000));
    const first = (createWithPhotos(big).body as { job: Own }).job;
    const second = (createWithPhotos(big).body as { job: Own }).job;
    expect(detailOf(first.id).images).toHaveLength(5);
    expect(detailOf(second.id).images).toHaveLength(5);
    const third = createWithPhotos(big);
    expect(third.status).toBe(409);
    expect(detailOf(first.id).images).toHaveLength(5);
  });

  it("recusa fotos inválidas (formato ou quantidade) sem criar a oportunidade", () => {
    const before = getState().createdJobs.length;
    const wrongFormat = createWithPhotos(["https://exemplo.com/a.jpg"]);
    expect(wrongFormat.status).toBe(400);
    expect((wrongFormat.body as { fields: Record<string, string> }).fields).toHaveProperty("images");
    const tooMany = createWithPhotos(Array.from({ length: 6 }, () => jpeg("AAAA")));
    expect(tooMany.status).toBe(400);
    expect(getState().createdJobs.length).toBe(before);
  });

  it("Reiniciar apaga as fotos guardadas", () => {
    createWithPhotos([jpeg("AAAA")]);
    expect(imageKeys()).toHaveLength(1);
    reset();
    expect(imageKeys()).toEqual([]);
  });
});
