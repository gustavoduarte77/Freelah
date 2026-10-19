import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JOB_PRICE_MAX_CENTS, proposalsResponseSchema, type Proposal } from "@freelah/shared";
import { createApp } from "./app";
import { createAuth } from "./auth";
import type { PrismaClient } from "./db";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./test-support";

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
type Agent = ReturnType<typeof request.agent>;
type Person = { agent: Agent; id: string };
const brasiliaDay = (ms: number) => new Date(ms - 3 * HOUR).toISOString().slice(0, 10);

describe.skipIf(!testDatabaseUrl)("propostas de valor no chat (integração)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let categoryId: string;
  let counter = 0;

  beforeAll(() => {
    prisma = connectTestDatabase();
    app = createApp(config, createAuth(config, prisma), prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    categoryId = (await prisma.category.create({ data: { slug: "construcao-civil", name: "Construção Civil" } })).id;
  });

  async function signUp(name: string): Promise<Person> {
    counter += 1;
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/sign-up/email").set("Origin", ORIGIN).send({
      name: `${name} ${counter}`,
      email: `pessoa${counter}@exemplo.com`,
      password: "senha-segura-123",
      phone: "32999990000",
      city: "Cataguases",
      adultConfirmed: true,
    });
    expect(res.status).toBe(200);
    return { agent, id: res.body.user.id as string };
  }
  const post = (agent: Agent, path: string, payload: unknown = {}) => agent.post(path).set("Origin", ORIGIN).send(payload as object);

  /** Dona + trabalhador(a) com interesse e conversa aberta, numa oportunidade publicada. */
  async function scenario(job: { negotiable?: boolean; proposedPriceCents?: number | null } = { negotiable: true }) {
    const owner = await signUp("Dona");
    const worker = await signUp("Trab");
    const service = Date.now() + 10 * DAY;
    const created = await post(owner.agent, "/me/jobs", {
      title: "Pintura de sala",
      description: "Preciso pintar uma sala de aproximadamente 20 m².",
      categoryId,
      city: "Cataguases",
      state: "MG",
      scheduledDate: brasiliaDay(service),
      startTime: "08:00",
      proposedPriceCents: job.proposedPriceCents === undefined ? 20000 : job.proposedPriceCents,
      negotiable: job.negotiable ?? true,
      expiresAt: new Date(service - DAY).toISOString(),
      publish: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const jobId = created.body.job.id as string;
    const joined = await joinConversation(worker, jobId);
    return { owner, worker, jobId, ...joined };
  }
  async function joinConversation(worker: Person, jobId: string) {
    const interest = (await post(worker.agent, `/jobs/${jobId}/interest`)).body.interest as { id: string };
    const opened = await post(worker.agent, `/me/interests/${interest.id}/conversation`);
    expect(opened.status).toBe(201);
    return { interestId: interest.id, conversationId: opened.body.conversation.id as string };
  }

  const list = (who: Person, conversationId: string) => who.agent.get(`/me/conversations/${conversationId}/proposals`);
  const propose = (who: Person, conversationId: string, amountCents: unknown) =>
    post(who.agent, `/me/conversations/${conversationId}/proposals`, { amountCents });
  const act = (who: Person, id: string, action: string) => post(who.agent, `/me/proposals/${id}/${action}`);
  const rowOf = (id: string) => prisma.proposal.findUniqueOrThrow({ where: { id } });
  const countOf = (conversationId: string) => prisma.proposal.count({ where: { conversationId } });
  const jobRow = (id: string) => prisma.job.findUniqueOrThrow({ where: { id } });
  const create = async (who: Person, conversationId: string, amountCents = 17000) => {
    const res = await propose(who, conversationId, amountCents);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.proposal as Proposal;
  };

  // =========================================================================
  it("exige sessão (401) em todas as rotas", async () => {
    const id = "01990000-0000-7000-8000-000000000001";
    for (const [method, path] of [
      ["get", `/me/conversations/${id}/proposals`],
      ["post", `/me/conversations/${id}/proposals`],
      ["post", `/me/proposals/${id}/accept`],
      ["post", `/me/proposals/${id}/decline`],
      ["post", `/me/proposals/${id}/withdraw`],
    ] as const) {
      expect((await request(app)[method](path).set("Origin", ORIGIN).send({})).status, `${method} ${path}`).toBe(401);
    }
  });

  describe("criar", () => {
    it("qualquer participante propõe; autora e destinatária vêm da conversa; o estado persistido está certo", async () => {
      const { owner, worker, conversationId } = await scenario();
      const byWorker = await create(worker, conversationId, 17000);
      expect(byWorker).toMatchObject({ amountCents: 17000, status: "PENDING", fromMe: true, canWithdraw: true, canAccept: false, canDecline: false, decidedAt: null });
      const row = await rowOf(byWorker.id);
      expect(row).toMatchObject({ conversationId, authorId: worker.id, recipientId: owner.id, amountCents: 17000, status: "PENDING", decidedAt: null });
      await act(worker, byWorker.id, "withdraw");
      const byOwner = await create(owner, conversationId, 16000);
      expect(await rowOf(byOwner.id)).toMatchObject({ authorId: owner.id, recipientId: worker.id });
    });

    it("recusa zero, negativo, decimal, texto, ausente e acima do limite, sem gravar nada", async () => {
      const { worker, conversationId } = await scenario();
      for (const bad of [0, -1, 10.5, "150", null, undefined, JOB_PRICE_MAX_CENTS + 1]) {
        const res = await propose(worker, conversationId, bad);
        expect(res.status, String(bad)).toBe(400);
        expect(res.body.fields).toHaveProperty("amountCents");
      }
      expect(await countOf(conversationId)).toBe(0);
    });

    it("não aceita campos a mais: autora, destinatária, estado e observação não vêm do cliente", async () => {
      const { worker, owner, conversationId } = await scenario();
      for (const extra of [{ authorId: owner.id }, { recipientId: worker.id }, { status: "ACCEPTED" }, { note: "oi" }]) {
        const res = await post(worker.agent, `/me/conversations/${conversationId}/proposals`, { amountCents: 17000, ...extra });
        expect(res.status).toBe(400);
      }
      expect(await countOf(conversationId)).toBe(0);
    });

    it("só em anúncio negociável: valor fixo é recusado; 'A negociar' e preço negociável são aceitos", async () => {
      const fixed = await scenario({ negotiable: false });
      const refused = await propose(fixed.worker, fixed.conversationId, 17000);
      expect(refused.status).toBe(409);
      expect(refused.body.error).toBe("proposal_not_allowed");
      expect(refused.body.message).toMatch(/valor fixo/);
      expect(await countOf(fixed.conversationId)).toBe(0);
      const fixedList = proposalsResponseSchema.parse((await list(fixed.worker, fixed.conversationId)).body);
      expect(fixedList).toMatchObject({ canPropose: false, proposals: [] });

      const open = await scenario({ negotiable: true, proposedPriceCents: null });
      await create(open.worker, open.conversationId);
      const priced = await scenario({ negotiable: true, proposedPriceCents: 20000 });
      await create(priced.owner, priced.conversationId);
    });

    it("uma só proposta pendente por conversa; pedidos simultâneos geram uma só", async () => {
      const { worker, owner, conversationId } = await scenario();
      await create(worker, conversationId);
      const second = await propose(owner, conversationId, 15000);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe("proposal_not_allowed");
      expect(await countOf(conversationId)).toBe(1);

      const other = await scenario();
      const results = await Promise.all([
        ...Array.from({ length: 4 }, () => propose(other.worker, other.conversationId, 17000)),
        ...Array.from({ length: 4 }, () => propose(other.owner, other.conversationId, 16000)),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(7);
      expect(await prisma.proposal.count({ where: { conversationId: other.conversationId, status: "PENDING" } })).toBe(1);
    });

    it("depois de recusa ou retirada, uma nova proposta é aceita; o histórico fica na ordem", async () => {
      const { owner, worker, conversationId } = await scenario();
      const first = await create(worker, conversationId, 17000);
      expect((await act(owner, first.id, "decline")).status).toBe(200);
      const second = await create(worker, conversationId, 16500);
      expect((await act(worker, second.id, "withdraw")).status).toBe(200);
      const third = await create(owner, conversationId, 16000);
      const history = proposalsResponseSchema.parse((await list(worker, conversationId)).body);
      expect(history.proposals.map((p) => [p.id, p.status])).toEqual([
        [first.id, "DECLINED"],
        [second.id, "WITHDRAWN"],
        [third.id, "PENDING"],
      ]);
      expect(history.canPropose).toBe(false);
    });
  });

  describe("quem pode ver e decidir", () => {
    it("terceiros não leem, propõem nem decidem (404), e nada muda", async () => {
      const { worker, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      const stranger = await signUp("Intruso");
      expect((await list(stranger, conversationId)).status).toBe(404);
      expect((await propose(stranger, conversationId, 15000)).status).toBe(404);
      for (const action of ["accept", "decline", "withdraw"]) expect((await act(stranger, proposal.id, action)).status, action).toBe(404);
      expect(await countOf(conversationId)).toBe(1);
      expect(await rowOf(proposal.id)).toMatchObject({ status: "PENDING", decidedAt: null });
    });

    it("quem participa de OUTRA conversa da mesma oportunidade também não vê esta", async () => {
      const { worker, jobId, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      const second = await signUp("Outro trabalhador");
      await joinConversation(second, jobId);
      expect((await list(second, conversationId)).status).toBe(404);
      expect((await act(second, proposal.id, "accept")).status).toBe(404);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });

    it("só a destinatária aceita e recusa; a autora recebe 403 e nada muda", async () => {
      const { owner, worker, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      for (const action of ["accept", "decline"]) {
        const res = await act(worker, proposal.id, action);
        expect(res.status, action).toBe(403);
        expect(res.body.error).toBe("forbidden");
      }
      expect(await rowOf(proposal.id)).toMatchObject({ status: "PENDING", decidedAt: null });
      const asRecipient = proposalsResponseSchema.parse((await list(owner, conversationId)).body).proposals[0]!;
      expect(asRecipient).toMatchObject({ fromMe: false, canAccept: true, canDecline: true, canWithdraw: false });
      const decline = await act(owner, proposal.id, "decline");
      expect(decline.status).toBe(200);
      expect(decline.body.proposal).toMatchObject({ status: "DECLINED", canAccept: false, canDecline: false, canWithdraw: false });
      const row = await rowOf(proposal.id);
      expect(row.status).toBe("DECLINED");
      expect(row.decidedAt).not.toBeNull();
    });

    it("só a autora retira; a destinatária recebe 403", async () => {
      const { owner, worker, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      expect((await act(owner, proposal.id, "withdraw")).status).toBe(403);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
      expect((await act(worker, proposal.id, "withdraw")).status).toBe(200);
      expect(await rowOf(proposal.id)).toMatchObject({ status: "WITHDRAWN" });
    });

    it("uma proposta já decidida não muda mais (409), e a aceita torna o acordo final", async () => {
      const { owner, worker, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      expect((await act(owner, proposal.id, "accept")).status).toBe(200);
      for (const [who, action] of [[owner, "accept"], [owner, "decline"], [worker, "withdraw"]] as const) {
        const res = await act(who, proposal.id, action);
        expect(res.status, action).toBe(409);
        expect(res.body.error).toBe("proposal_not_pending");
      }
      expect((await rowOf(proposal.id)).status).toBe("ACCEPTED");
      const again = await propose(worker, conversationId, 15000);
      expect(again.status).toBe(409);
      expect(again.body.message).toMatch(/final/);
      expect(await countOf(conversationId)).toBe(1);
    });

    it("rotas e ids inválidos: 404 sem efeito", async () => {
      const { worker, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      expect((await act(worker, proposal.id, "explodir")).status).toBe(404);
      expect((await act(worker, "nao-e-uuid", "accept")).status).toBe(404);
      expect((await list(worker, "nao-e-uuid")).status).toBe(404);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });
  });

  describe("decisões concorrentes", () => {
    it("aceitar e recusar ao mesmo tempo: só uma vence e o estado persistido bate com ela", async () => {
      for (let round = 0; round < 3; round += 1) {
        const { owner, worker, conversationId } = await scenario();
        const proposal = await create(worker, conversationId);
        const results = await Promise.all([act(owner, proposal.id, "accept"), act(owner, proposal.id, "decline"), act(owner, proposal.id, "accept"), act(owner, proposal.id, "decline")]);
        const wins = results.filter((r) => r.status === 200);
        expect(wins, JSON.stringify(results.map((r) => r.status))).toHaveLength(1);
        expect(results.filter((r) => r.status === 409)).toHaveLength(3);
        const final = (await rowOf(proposal.id)).status;
        expect(final).toBe(wins[0]!.body.proposal.status);
        expect(["ACCEPTED", "DECLINED"]).toContain(final);
      }
    });

    it("aceitar contra retirar: uma só vence", async () => {
      for (let round = 0; round < 3; round += 1) {
        const { owner, worker, conversationId } = await scenario();
        const proposal = await create(worker, conversationId);
        const results = await Promise.all([act(owner, proposal.id, "accept"), act(worker, proposal.id, "withdraw")]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        const row = await rowOf(proposal.id);
        expect(["ACCEPTED", "WITHDRAWN"]).toContain(row.status);
        expect(row.decidedAt).not.toBeNull();
      }
    });
  });

  describe("estado da oportunidade e da conversa", () => {
    it("cancelada: ninguém propõe nem decide, e a pendente aparece como encerrada sem ser alterada", async () => {
      const { owner, worker, jobId, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      expect((await post(owner.agent, `/me/jobs/${jobId}/cancel`)).status).toBe(200);
      expect((await propose(owner, conversationId, 15000)).status).toBe(409);
      for (const [who, action] of [[owner, "accept"], [owner, "decline"], [worker, "withdraw"]] as const) {
        const res = await act(who, proposal.id, action);
        expect(res.status, action).toBe(409);
        expect(res.body.error).toBe("negotiation_closed");
      }
      const view = proposalsResponseSchema.parse((await list(owner, conversationId)).body);
      expect(view.canPropose).toBe(false);
      expect(view.proposals[0]).toMatchObject({ status: "PENDING", canAccept: false, canDecline: false, canWithdraw: false });
      expect(view.proposals[0]!.closedReason).toMatch(/cancelou/);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });

    it("expirada: o mesmo", async () => {
      const { owner, worker, jobId, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      await prisma.job.update({ where: { id: jobId }, data: { expiresAt: new Date(Date.now() - HOUR) } });
      expect((await propose(owner, conversationId, 15000)).status).toBe(409);
      expect((await act(owner, proposal.id, "accept")).status).toBe(409);
      expect((await act(worker, proposal.id, "withdraw")).status).toBe(409);
      const view = proposalsResponseSchema.parse((await list(owner, conversationId)).body);
      expect(view.proposals[0]!.closedReason).toMatch(/prazo/);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });

    it("interesse retirado ou outra pessoa selecionada: a negociação fecha", async () => {
      const { owner, worker, jobId, interestId, conversationId } = await scenario();
      const proposal = await create(owner, conversationId);
      const second = await signUp("Segunda");
      const other = await joinConversation(second, jobId);
      // a dona seleciona a segunda pessoa: o interesse da primeira fica "Não selecionado"
      expect((await post(owner.agent, `/me/interests/${other.interestId}/invite`)).status).toBe(200);
      expect((await post(second.agent, `/me/interests/${other.interestId}/accept`)).status).toBe(200);
      expect((await prisma.interest.findUniqueOrThrow({ where: { id: interestId } })).status).toBe("REJECTED");
      expect((await act(worker, proposal.id, "accept")).status).toBe(409);
      expect((await propose(worker, conversationId, 15000)).status).toBe(409);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });

    it("contratada: a proposta pendente fecha, ninguém propõe, e nada é gravado como decidido", async () => {
      const { owner, worker, jobId, interestId, conversationId } = await scenario();
      const proposal = await create(worker, conversationId);
      expect((await post(owner.agent, `/me/interests/${interestId}/invite`)).status).toBe(200);
      expect((await post(worker.agent, `/me/interests/${interestId}/accept`)).status).toBe(200);
      expect((await jobRow(jobId)).status).toBe("HIRED");
      const res = await act(owner, proposal.id, "accept");
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("negotiation_closed");
      expect(res.body.message).toMatch(/contratada/);
      expect((await propose(owner, conversationId, 15000)).status).toBe(409);
      expect((await rowOf(proposal.id)).status).toBe("PENDING");
    });

    it("concluída: o mesmo", async () => {
      const { owner, worker, jobId, interestId, conversationId } = await scenario();
      await post(owner.agent, `/me/interests/${interestId}/invite`);
      await post(worker.agent, `/me/interests/${interestId}/accept`);
      expect((await post(owner.agent, `/me/jobs/${jobId}/complete`)).status).toBe(200);
      expect((await propose(worker, conversationId, 15000)).status).toBe(409);
      expect(await countOf(conversationId)).toBe(0);
    });
  });

  describe("a proposta não mexe no anúncio nem contrata", () => {
    it("aceitar mantém valor e 'negociável' públicos e NÃO contrata; a contratação segue pelo fluxo próprio", async () => {
      const { owner, worker, jobId, interestId, conversationId } = await scenario({ negotiable: true, proposedPriceCents: 20000 });
      const before = await jobRow(jobId);
      const publicBefore = (await request(app).get(`/jobs/${jobId}`)).body;
      const proposal = await create(worker, conversationId, 15000);
      expect((await act(owner, proposal.id, "accept")).status).toBe(200);

      const after = await jobRow(jobId);
      expect(after).toMatchObject({ proposedPriceCents: 20000, negotiable: true, status: before.status, hiredAt: null, selectedInterestId: null, completedAt: null });
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect((await prisma.interest.findUniqueOrThrow({ where: { id: interestId } })).status).toBe("PENDING");
      const publicAfter = (await request(app).get(`/jobs/${jobId}`)).body;
      expect(publicAfter).toEqual(publicBefore);
      expect(publicAfter.proposedPriceCents).toBe(20000);

      // contratar continua sendo um passo separado, sem depender da proposta aceita
      expect((await post(owner.agent, `/me/interests/${interestId}/invite`)).status).toBe(200);
      expect((await post(worker.agent, `/me/interests/${interestId}/accept`)).status).toBe(200);
      expect((await jobRow(jobId)).status).toBe("HIRED");
      expect((await jobRow(jobId)).proposedPriceCents).toBe(20000);
    });

    it("'A negociar' continua sem valor publicado depois de uma proposta aceita", async () => {
      const { owner, worker, jobId, conversationId } = await scenario({ negotiable: true, proposedPriceCents: null });
      const proposal = await create(worker, conversationId, 15000);
      await act(owner, proposal.id, "accept");
      expect(await jobRow(jobId)).toMatchObject({ proposedPriceCents: null, negotiable: true });
      expect((await request(app).get(`/jobs/${jobId}`)).body.proposedPriceCents).toBeNull();
    });

    it("nenhuma proposta aparece nas listagens públicas nem no detalhe do anúncio", async () => {
      const { worker, jobId, conversationId } = await scenario();
      await create(worker, conversationId, 15000);
      const detail = JSON.stringify((await request(app).get(`/jobs/${jobId}`)).body);
      const listing = JSON.stringify((await request(app).get("/jobs")).body);
      for (const text of [detail, listing]) {
        expect(text).not.toMatch(/proposal|amountCents|15000/);
      }
    });
  });

  describe("negociações independentes", () => {
    it("duas conversas da mesma oportunidade chegam a valores diferentes sem se afetar", async () => {
      const { owner, worker, jobId, conversationId } = await scenario();
      const second = await signUp("Segunda");
      const other = await joinConversation(second, jobId);
      const a = await create(worker, conversationId, 15000);
      const b = await create(second, other.conversationId, 18000);
      expect((await act(owner, a.id, "accept")).status).toBe(200);
      // a outra continua pendente, decidível e com o próprio valor
      expect(await rowOf(b.id)).toMatchObject({ status: "PENDING", amountCents: 18000 });
      const decline = await act(owner, b.id, "decline");
      expect(decline.status).toBe(200);
      expect(await rowOf(a.id)).toMatchObject({ status: "ACCEPTED", amountCents: 15000 });
      expect(await rowOf(b.id)).toMatchObject({ status: "DECLINED", amountCents: 18000 });
      // cada conversa só lista as próprias propostas
      const listA = proposalsResponseSchema.parse((await list(worker, conversationId)).body);
      const listB = proposalsResponseSchema.parse((await list(second, other.conversationId)).body);
      expect(listA.proposals.map((p) => p.amountCents)).toEqual([15000]);
      expect(listB.proposals.map((p) => p.amountCents)).toEqual([18000]);
      // o acordo final de uma não impede propor na outra
      expect(listA.canPropose).toBe(false);
      expect(listB.canPropose).toBe(true);
    });
  });

  describe("integridade no banco (mesmo sem a API)", () => {
    async function base() {
      const { owner, worker, conversationId } = await scenario();
      const data = { conversationId, authorId: worker.id, recipientId: owner.id, amountCents: 17000 };
      return { owner, worker, conversationId, data };
    }

    it("recusa valor zero, negativo e acima do limite", async () => {
      const { data } = await base();
      for (const amountCents of [0, -5, 100_000_000]) {
        await expect(prisma.proposal.create({ data: { ...data, amountCents } })).rejects.toThrow();
      }
      await expect(prisma.proposal.create({ data: { ...data, amountCents: 99_999_999 } })).resolves.toBeTruthy();
    });

    it("recusa autora igual à destinatária", async () => {
      const { data, worker } = await base();
      await expect(prisma.proposal.create({ data: { ...data, recipientId: worker.id } })).rejects.toThrow();
    });

    it("recusa decisão incoerente com o estado", async () => {
      const { data } = await base();
      await expect(prisma.proposal.create({ data: { ...data, status: "ACCEPTED" } })).rejects.toThrow();
      await expect(prisma.proposal.create({ data: { ...data, status: "PENDING", decidedAt: new Date() } })).rejects.toThrow();
      await expect(prisma.proposal.create({ data: { ...data, status: "DECLINED", decidedAt: new Date() } })).resolves.toBeTruthy();
    });

    it("recusa duas pendentes e duas aceitas na mesma conversa, mas aceita várias recusadas e retiradas", async () => {
      const { data } = await base();
      await prisma.proposal.create({ data });
      await expect(prisma.proposal.create({ data })).rejects.toThrow();
      const decided = (status: "DECLINED" | "WITHDRAWN" | "ACCEPTED") => ({ ...data, status, decidedAt: new Date() });
      await expect(prisma.proposal.create({ data: decided("DECLINED") })).resolves.toBeTruthy();
      await expect(prisma.proposal.create({ data: decided("DECLINED") })).resolves.toBeTruthy();
      await expect(prisma.proposal.create({ data: decided("WITHDRAWN") })).resolves.toBeTruthy();
      await expect(prisma.proposal.create({ data: decided("ACCEPTED") })).resolves.toBeTruthy();
      await expect(prisma.proposal.create({ data: decided("ACCEPTED") })).rejects.toThrow();
    });

    it("apagar a conversa apaga as propostas dela (e só dela)", async () => {
      const { data, conversationId } = await base();
      await prisma.proposal.create({ data });
      const other = await scenario();
      await prisma.proposal.create({ data: { conversationId: other.conversationId, authorId: other.worker.id, recipientId: other.owner.id, amountCents: 100 } });
      await prisma.conversation.delete({ where: { id: conversationId } });
      expect(await prisma.proposal.count()).toBe(1);
    });
  });
});
