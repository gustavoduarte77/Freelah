import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildCreateJobRequest,
  createMyJobsApi,
  createSubmissionController,
  emptyJobForm,
  formatBrDate,
  mapServerFields,
  suggestDeadlineDate,
  type JobFormValues,
  type MyJobsFetch,
} from "@freelah/shared";
import { createApp } from "./app";
import { createAuth } from "./auth";
import type { PrismaClient } from "./db";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./test-support";

// Contrato entre o formulário do app (lógica compartilhada) e a API real: tudo o que o formulário
// monta precisa ser aceito, e os erros da API precisam voltar para os campos certos. Usa a API
// de verdade, por HTTP, com o mesmo cliente e o mesmo controlador de envio que o app usa.

const ORIGIN = "http://localhost:8081";
const config = {
  NODE_ENV: "test" as const,
  CORS_ORIGINS: [ORIGIN],
  BETTER_AUTH_SECRET: "segredo-so-para-testes-com-mais-de-32-caracteres",
  BETTER_AUTH_URL: "http://localhost:3333",
  TRUSTED_ORIGINS: [ORIGIN, "freelah://"],
};
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "DD/MM/AAAA" no horário de Brasília de um instante. */
const brDay = (ms: number) => formatBrDate(new Date(ms - 3 * HOUR).toISOString().slice(0, 10));
const brTime = (ms: number) => new Date(ms - 3 * HOUR).toISOString().slice(11, 16);

describe.skipIf(!testDatabaseUrl)("formulário de publicação x API real (integração)", () => {
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl: string;
  let categoryId: string;
  let cookie = "";
  let userId = "";
  let counter = 0;

  beforeAll(async () => {
    prisma = connectTestDatabase();
    const app = createApp(config, createAuth(config, prisma), prisma);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    categoryId = (await prisma.category.create({ data: { slug: "construcao-civil", name: "Construção Civil" } })).id;
    counter += 1;
    const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        name: `Pessoa ${counter}`,
        email: `pessoa${counter}@exemplo.com`,
        password: "senha-segura-123",
        phone: "32999990000",
        city: "Cataguases",
        adultConfirmed: true,
      }),
    });
    expect(res.status).toBe(200);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    userId = ((await res.json()) as { user: { id: string } }).user.id;
  });

  /** O mesmo contrato do `fetch` do app, com ou sem o cookie de sessão. */
  const authedFetch =
    (withCookie = true): MyJobsFetch =>
    (url, init) =>
      fetch(url, {
        method: init.method,
        headers: { ...init.headers, Origin: ORIGIN, ...(withCookie ? { Cookie: cookie } : {}) },
        ...(init.body === undefined ? {} : { body: init.body }),
      });

  const api = (fetchImpl = authedFetch()) => createMyJobsApi({ baseUrl, fetch: fetchImpl });

  function form(over: Partial<JobFormValues> = {}, serviceInMs = 10 * DAY): JobFormValues {
    const service = Date.now() + serviceInMs;
    const scheduledDate = brDay(service);
    return {
      ...emptyJobForm({ city: "Cataguases" }),
      title: "Pintura de sala",
      description: "Preciso pintar uma sala de aproximadamente 20 m².",
      categoryId,
      state: "mg",
      scheduledDate,
      startTime: "08:00",
      price: "200",
      negotiable: true,
      deadlineDate: suggestDeadlineDate(scheduledDate, new Date()),
      ...over,
    };
  }

  function built(values: JobFormValues) {
    const result = buildCreateJobRequest(values, new Date());
    if (!result.ok) throw new Error(`formulário recusado pelo próprio app: ${JSON.stringify(result.errors)}`);
    return result;
  }

  describe("tudo o que o formulário monta é aceito pela API", () => {
    it("rascunho e publicação, com prazo sugerido", async () => {
      const draft = await api().create(built(form()).request);
      expect(draft).toMatchObject({ status: "DRAFT", title: "Pintura de sala", state: "MG", proposedPriceCents: 20000, negotiable: true, isDemo: false });
      const published = await api().create(built(form({ title: "Capina de quintal" })).request, { publish: true });
      expect(published.status).toBe("PUBLISHED");
    });

    it("prazo no dia do serviço: limitado ao início do serviço e aceito", async () => {
      const values = form({}, 5 * DAY);
      values.deadlineDate = values.scheduledDate;
      const result = built(values);
      expect(result.deadline.cappedBy).toBe("service");
      const job = await api().create(result.request, { publish: true });
      expect(new Date(job.expiresAt).toISOString()).toBe(result.service.toISOString());
    });

    it("prazo depois do dia do serviço: também limitado e aceito", async () => {
      const values = form({}, 5 * DAY);
      values.deadlineDate = brDay(Date.now() + 9 * DAY);
      expect(built(values).deadline.cappedBy).toBe("service");
      expect((await api().create(built(values).request, { publish: true })).status).toBe("PUBLISHED");
    });

    it("último dia permitido, com serviço distante: limitado a 60 dias e aceito", async () => {
      const values = form({}, 100 * DAY);
      values.deadlineDate = suggestDeadlineDate(brDay(Date.now() + 100 * DAY), new Date());
      const result = built(values);
      expect(result.deadline.cappedBy).toBe("limit");
      expect((await api().create(result.request, { publish: true })).status).toBe("PUBLISHED");
    });

    it("serviço daqui a poucas horas, com prazo hoje", async () => {
      const soon = Date.now() + 3 * HOUR;
      const values = form({ scheduledDate: brDay(soon), startTime: brTime(soon), deadlineDate: brDay(Date.now()) });
      const result = built(values);
      const job = await api().create(result.request, { publish: true });
      expect(new Date(job.expiresAt).getTime()).toBeLessThanOrEqual(soon);
      expect(new Date(job.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("valor mínimo (1 centavo), informações adicionais e valor com vírgula", async () => {
      const cheap = await api().create(built(form({ price: "0,01", additionalInfo: "Levar o material." })).request);
      expect(cheap).toMatchObject({ proposedPriceCents: 1, additionalInfo: "Levar o material." });
      const cents = await api().create(built(form({ price: "1234,56" })).request);
      expect(cents.proposedPriceCents).toBe(123456);
    });

    it("textos com espaços extras e acentos chegam normalizados e preservados", async () => {
      const job = await api().create(built(form({ title: "  Instalação   elétrica  ", city: " São João del-Rei " })).request);
      expect(job).toMatchObject({ title: "Instalação elétrica", city: "São João del-Rei" });
    });
  });

  describe("erros da API voltam para os campos do formulário", () => {
    it("o que o app deixaria passar mas a API recusa (categoria inativa) volta no campo da categoria", async () => {
      await prisma.category.update({ where: { id: categoryId }, data: { active: false } });
      const controller = createSubmissionController({ api: api() });
      const state = await controller.submit(built(form()).request, "publish");
      expect(state.status).toBe("failed");
      if (state.status !== "failed") return;
      expect(state.error.kind).toBe("validation");
      expect(mapServerFields(state.error.fields).categoryId).toBeDefined();
      expect(await prisma.job.count()).toBe(0);
    });

    it("campo recusado pela API (UF, valor) volta no campo certo; o calendário vem em seguida (a API valida em duas etapas)", async () => {
      const good = built(form()).request;
      const controller = createSubmissionController({ api: api() });
      const shape = await controller.submit({ ...good, state: "XX", proposedPriceCents: -1 }, "draft");
      expect(shape.status).toBe("failed");
      if (shape.status !== "failed") return;
      const shapeErrors = mapServerFields(shape.error.fields);
      expect(shapeErrors.state).toBeDefined();
      expect(shapeErrors.price).toBeDefined();

      const calendar = await controller.submit({ ...good, expiresAt: new Date(Date.now() - DAY).toISOString() }, "draft");
      expect(calendar.status).toBe("failed");
      if (calendar.status !== "failed") return;
      expect(mapServerFields(calendar.error.fields).deadlineDate).toBeDefined();
      expect(await prisma.job.count()).toBe(0);
    });

    it("sem sessão é falha definitiva (401) e nada é salvo", async () => {
      const controller = createSubmissionController({ api: api(authedFetch(false)) });
      const state = await controller.submit(built(form()).request, "publish");
      expect(state.status).toBe("failed");
      expect(state.status === "failed" && state.error.kind).toBe("unauthorized");
      expect(await prisma.job.count()).toBe(0);
    });
  });

  describe("resposta perdida: o servidor gravou mas o app não soube", () => {
    /** Faz o pedido de verdade e depois finge que a conexão caiu antes da resposta chegar. */
    const lostResponse: MyJobsFetch = async (url, init) => {
      await authedFetch()(url, init);
      throw new TypeError("Failed to fetch");
    };

    it("fica 'não confirmado', a oportunidade existe, e nada é reenviado sem confirmação", async () => {
      const request = built(form()).request;
      const controller = createSubmissionController({ api: api(lostResponse) });

      const first = await controller.submit(request, "publish");
      expect(first.status).toBe("unconfirmed");
      expect(await prisma.job.count()).toBe(1); // foi gravada, mesmo sem o app saber

      // "Tentar de novo" comum não reenvia: não há segundo registro.
      await controller.submit(request, "publish");
      await controller.submit(request, "publish", { confirmRetry: false });
      expect(await prisma.job.count()).toBe(1);

      // A pessoa confere a lista (leitura) e a oportunidade está lá.
      const mine = await api().list();
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ title: "Pintura de sala", status: "PUBLISHED" });
    });

    it("o reenvio confirmado de fato cria outra: por isso o aviso de duplicada existe", async () => {
      const request = built(form()).request;
      const controller = createSubmissionController({ api: api(lostResponse) });
      await controller.submit(request, "publish");
      await controller.submit(request, "publish", { confirmRetry: true });
      expect(await prisma.job.count()).toBe(2);
    });

    it("falha antes de chegar ao servidor também é 'não confirmado', mas nada foi gravado", async () => {
      const neverArrived: MyJobsFetch = async () => {
        throw new TypeError("Failed to fetch");
      };
      const controller = createSubmissionController({ api: api(neverArrived) });
      expect((await controller.submit(built(form()).request, "draft")).status).toBe("unconfirmed");
      expect(await prisma.job.count()).toBe(0);
    });

    it("a API devolvendo 500 depois de gravar também fica 'não confirmado'", async () => {
      const failAfterWrite: MyJobsFetch = async (url, init) => {
        await authedFetch()(url, init);
        return { ok: false, status: 500, json: async () => ({ error: "internal_error" }) };
      };
      const controller = createSubmissionController({ api: api(failAfterWrite) });
      expect((await controller.submit(built(form()).request, "publish")).status).toBe("unconfirmed");
      expect(await prisma.job.count()).toBe(1);
    });
  });

  describe("leitura e publicação de rascunho pelo mesmo cliente", () => {
    it("lista, abre e publica um rascunho", async () => {
      const draft = await api().create(built(form()).request);
      expect((await api().list()).map((j) => j.id)).toEqual([draft.id]);
      expect((await api().get(draft.id)).status).toBe("DRAFT");
      expect((await api().publish(draft.id)).status).toBe("PUBLISHED");
      const again = await api().publish(draft.id).catch((e: unknown) => e);
      expect(again).toMatchObject({ kind: "invalid_state", outcomeUnknown: false });
    });

    /** 100 oportunidades mais novas que as existentes: empurram tudo o que veio antes para fora de GET /me/jobs. */
    async function fillListLimit() {
      const now = Date.now();
      await prisma.job.createMany({
        data: Array.from({ length: 100 }, (_, i) => ({
          title: `Mais nova ${i}`,
          description: "Criada só para encher a lista do dono.",
          categoryId,
          ownerId: userId,
          city: "Muriaé",
          state: "MG",
          scheduledDate: new Date("2030-01-10T00:00:00.000Z"),
          startTime: "08:00",
          proposedPriceCents: 1000,
          expiresAt: new Date(now + 30 * DAY),
          status: "DRAFT" as const,
          createdAt: new Date(now + (i + 1) * 1000),
        })),
      });
    }

    it("oportunidade fora das 100 mais novas: some de GET /me/jobs, mas a leitura por id a encontra", async () => {
      const draft = await api().create(built(form({ title: "Rascunho antigo" })).request);
      await fillListLimit();
      const list = await api().list();
      expect(list).toHaveLength(100);
      expect(list.some((j) => j.id === draft.id)).toBe(false);
      const direct = await api().get(draft.id);
      expect(direct).toMatchObject({ id: draft.id, title: "Rascunho antigo", status: "DRAFT", canPublish: true });
    });

    it("resposta perdida ao publicar um rascunho fora da lista limitada: a conferência por id mostra a realidade", async () => {
      const draft = await api().create(built(form({ title: "Rascunho antigo" })).request);
      await fillListLimit();
      const lostResponse: MyJobsFetch = async (url, init) => {
        await authedFetch()(url, init);
        throw new TypeError("Failed to fetch");
      };
      await expect(api(lostResponse).publish(draft.id)).rejects.toMatchObject({ kind: "network", outcomeUnknown: true });
      expect((await api().list()).some((j) => j.id === draft.id)).toBe(false); // a lista limitada não ajuda
      const checked = await api().get(draft.id);
      expect(checked.status).toBe("PUBLISHED");
      expect(checked.publishedAt).not.toBeNull();
    });

    it("conferir um rascunho que continua rascunho devolve DRAFT (a publicação nunca chegou)", async () => {
      const draft = await api().create(built(form()).request);
      const neverArrived: MyJobsFetch = async () => {
        throw new TypeError("Failed to fetch");
      };
      await expect(api(neverArrived).publish(draft.id)).rejects.toMatchObject({ outcomeUnknown: true });
      expect((await api().get(draft.id)).status).toBe("DRAFT");
    });

    it("conferir por id: 401 sem sessão, 404 inexistente, e falha de rede sem afirmar nada", async () => {
      const draft = await api().create(built(form()).request);
      await expect(api(authedFetch(false)).get(draft.id)).rejects.toMatchObject({ kind: "unauthorized", outcomeUnknown: false });
      await expect(api().get("01990000-0000-7000-8000-0000000000ff")).rejects.toMatchObject({ kind: "not_found" });
      await expect(api().get("nao-e-um-id")).rejects.toMatchObject({ kind: "not_found" });
      const down: MyJobsFetch = async () => {
        throw new TypeError("Failed to fetch");
      };
      await expect(api(down).get(draft.id)).rejects.toMatchObject({ kind: "network", outcomeUnknown: false });
    });

    it("a oportunidade de outra pessoa não é lida nem publicada", async () => {
      const draft = await api().create(built(form()).request);
      counter += 1;
      const other = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ name: "Outra", email: `outra${counter}@exemplo.com`, password: "senha-segura-123", phone: "32988880000", city: "Muriaé", adultConfirmed: true }),
      });
      const otherCookie = other.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const otherApi = createMyJobsApi({
        baseUrl,
        fetch: (url, init) => fetch(url, { method: init.method, headers: { ...init.headers, Origin: ORIGIN, Cookie: otherCookie }, ...(init.body === undefined ? {} : { body: init.body }) }),
      });
      await expect(otherApi.get(draft.id)).rejects.toMatchObject({ kind: "not_found" });
      await expect(otherApi.publish(draft.id)).rejects.toMatchObject({ kind: "not_found" });
      expect(await otherApi.list()).toEqual([]);
    });
  });
});
