import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDemoRequest } from "./server";
import { advanceHire, getState, inviteHire, reset, setLoggedIn } from "./store";
import { testStorage } from "./test/local-storage";

// Propostas de valor no chat (PRD 18.5) no servidor simulado: as mesmas regras da API.

const call = (method: string, path: string, body?: unknown) =>
  handleDemoRequest(method, path, body === undefined ? undefined : JSON.stringify(body));

const HIRE_CONV = "demo-conversation-eletrica";
const FIXED_CONV = "demo-conversation-pintura";

type Prop = {
  id: string;
  status: string;
  fromMe: boolean;
  amountCents: number;
  canAccept: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  closedReason: string | null;
};
type PropList = { proposals: Prop[]; canPropose: boolean; proposeBlockedReason: string | null };

const listProposals = (conversation = HIRE_CONV) => call("GET", `/me/conversations/${conversation}/proposals`).body as PropList;
const propose = (amountCents: unknown, conversation = HIRE_CONV) =>
  call("POST", `/me/conversations/${conversation}/proposals`, { amountCents });
const decide = (id: string, action: string) => call("POST", `/me/proposals/${id}/${action}`);
const toStep = (step: number) => {
  while (getState().hireStep < step) advanceHire();
};
const publicJob = () => call("GET", "/jobs/demo-job-eletrica").body as { proposedPriceCents: number | null; negotiable: boolean; status: string };

/**
 * Uma proposta RECEBIDA pela pessoa da demonstração (autora é a outra pessoa). O roteiro de Roberto não envia
 * mais proposta nenhuma; as regras de quem decide continuam valendo para quem recebe, então o teste simula uma.
 */
function incoming(amountCents = 16500, conversation = HIRE_CONV): string {
  const created = (propose(amountCents, conversation).body as { proposal: Prop }).proposal;
  const stored = getState().proposals.find((proposal) => proposal.id === created.id)!;
  stored.fromMe = false;
  return created.id;
}

beforeEach(() => {
  reset();
  setLoggedIn(true);
});

describe("propostas de valor na demonstração", () => {
  it("o roteiro de Roberto não tem proposta: a conversa segue sem propostas até o convite, e Lucas pode propor", () => {
    for (let step = 1; step <= 5; step += 1) {
      toStep(step);
      const { proposals, canPropose } = listProposals();
      expect(proposals, `etapa ${step}`).toEqual([]);
      expect(canPropose, `etapa ${step}`).toBe(true);
    }
    expect(getState().proposals).toEqual([]);
  });

  it("aceitar registra o acordo, mas não muda o preço público, o 'negociável' nem contrata", () => {
    const before = publicJob();
    expect(before).toMatchObject({ proposedPriceCents: 18000, negotiable: true, status: "PUBLISHED" });
    const id = incoming();
    const accepted = decide(id, "accept");
    expect(accepted.status).toBe(200);
    expect((accepted.body as { proposal: Prop }).proposal).toMatchObject({ status: "ACCEPTED", canAccept: false, canDecline: false, canWithdraw: false });
    expect(publicJob()).toEqual(before);
    expect(getState().hireInvited).toBe(false); // nenhuma contratação
    // o acordo é final: nova proposta é recusada
    expect(propose(15000).status).toBe(409);
    expect(listProposals().canPropose).toBe(false);
  });

  it("recusar mantém a conversa e libera uma nova proposta", () => {
    const id = incoming();
    expect((decide(id, "decline").body as { proposal: Prop }).proposal.status).toBe("DECLINED");
    expect(listProposals().canPropose).toBe(true);
    const created = propose(17000);
    expect(created.status).toBe(201);
    expect((created.body as { proposal: Prop }).proposal).toMatchObject({ status: "PENDING", fromMe: true, amountCents: 17000, canWithdraw: true, canAccept: false });
    expect(listProposals().proposals.map((item) => item.status)).toEqual(["DECLINED", "PENDING"]);
  });

  it("uma pendente por vez; retirar só pela autora e libera outra; quem propôs não decide a própria", () => {
    const first = (propose(16000).body as { proposal: Prop }).proposal;
    expect(propose(15000).status).toBe(409);
    expect(decide(first.id, "accept").status).toBe(403);
    expect(decide(first.id, "decline").status).toBe(403);
    expect(listProposals().proposals[0]).toMatchObject({ status: "PENDING" });
    expect(decide(first.id, "withdraw").status).toBe(200);
    expect(listProposals().proposals[0]).toMatchObject({ status: "WITHDRAWN" });
    expect(propose(15500).status).toBe(201);
  });

  it("a destinatária não retira, e uma proposta já decidida não muda mais", () => {
    const id = incoming();
    expect(decide(id, "withdraw").status).toBe(403);
    expect(decide(id, "accept").status).toBe(200);
    for (const action of ["accept", "decline"]) expect(decide(id, action).status, action).toBe(409);
    expect(decide(id, "withdraw").status).toBe(403); // continua não sendo dela
    expect(listProposals().proposals[0]).toMatchObject({ status: "ACCEPTED" });
  });

  it("anúncio de valor fixo não aceita propostas", () => {
    const list = listProposals(FIXED_CONV);
    expect(list.canPropose).toBe(false);
    expect(list.proposeBlockedReason).toMatch(/valor fixo/);
    expect(propose(20000, FIXED_CONV).status).toBe(409);
    expect(listProposals(FIXED_CONV).proposals).toEqual([]);
  });

  it("recusa valores inválidos e campos a mais, sem criar nada", () => {
    for (const bad of [0, -1, 10.5, 100_000_000, "150", null, undefined]) {
      expect(propose(bad).status, String(bad)).toBe(400);
    }
    expect(call("POST", `/me/conversations/${HIRE_CONV}/proposals`, { amountCents: 15000, note: "oi" }).status).toBe(400);
    expect(listProposals().proposals).toEqual([]);
  });

  it("conversa ou proposta inexistente: 404; sem login: 401", () => {
    expect(call("GET", "/me/conversations/outra/proposals").status).toBe(404);
    expect(propose(15000, "outra").status).toBe(404);
    expect(decide("nao-existe", "accept").status).toBe(404);
    setLoggedIn(false);
    expect(call("GET", `/me/conversations/${HIRE_CONV}/proposals`).status).toBe(401);
    expect(decide("x", "accept").status).toBe(401);
  });

  it("contratada a oportunidade, a negociação fecha: pendente não pode mais ser decidida e ninguém propõe", () => {
    const pending = { id: incoming() };
    toStep(5);
    expect(inviteHire()).toBe(true);
    advanceHire(); // Roberto aceita o convite: contratação
    const list = listProposals();
    expect(list.canPropose).toBe(false);
    expect(list.proposals[0]).toMatchObject({ status: "PENDING", canAccept: false, canDecline: false, canWithdraw: false });
    expect(list.proposals[0]!.closedReason).toMatch(/contratada/);
    expect(decide(pending.id, "accept").status).toBe(409);
    expect(propose(15000).status).toBe(409);
    // nada foi gravado como decidido
    expect(getState().proposals.find((proposal) => proposal.id === pending.id)?.status).toBe("PENDING");
  });

  it("negociações são independentes entre as conversas", () => {
    expect(propose(16000).status).toBe(201);
    expect(listProposals(FIXED_CONV).proposals).toEqual([]);
    expect(listProposals().proposals).toHaveLength(1);
  });

  it("as propostas e as decisões sobrevivem a recarregar a página", async () => {
    const scripted = { id: incoming() };
    decide(scripted.id, "decline");
    const mine = (propose(17000).body as { proposal: Prop }).proposal;
    vi.resetModules();
    const reloaded = await import("./server");
    const body = reloaded.handleDemoRequest("GET", `/me/conversations/${HIRE_CONV}/proposals`).body as PropList;
    expect(body.proposals.map((item) => [item.id, item.status])).toEqual([
      [scripted.id, "DECLINED"],
      [mine.id, "PENDING"],
    ]);
    expect(body.canPropose).toBe(false);
  });

  it("estado salvo inválido ou duplicado é descartado ao carregar (uma pendente por conversa)", async () => {
    incoming();
    const saved = JSON.parse(testStorage.getItem("freelah:demo:state:v1")!) as { proposals: Array<Record<string, unknown>> };
    const base = saved.proposals[0]!;
    saved.proposals.push(
      { ...base, id: "duplicada-pendente", scripted: false },
      { ...base, id: "valor-zero", amountCents: 0, status: "DECLINED" },
      { ...base, id: "conversa-estranha", conversationId: "outra", status: "DECLINED" },
      { ...base, id: "estado-estranho", status: "EXPIRED" },
    );
    testStorage.setItem("freelah:demo:state:v1", JSON.stringify(saved));
    vi.resetModules();
    const store = await import("./store");
    expect(store.getState().proposals.map((proposal) => proposal.id)).toEqual([base.id]);
  });

  it("Reiniciar apaga as propostas", () => {
    toStep(3);
    propose(16000);
    reset();
    setLoggedIn(true);
    expect(getState().proposals).toEqual([]);
    expect(listProposals().proposals).toEqual([]);
  });
});

describe("proposta que existia no roteiro de Roberto", () => {
  it("estado antigo salvo com a proposta do roteiro (scripted) é limpo ao carregar", async () => {
    toStep(3);
    const saved = JSON.parse(testStorage.getItem("freelah:demo:state:v1")!) as { proposals: Array<Record<string, unknown>> };
    saved.proposals.push({
      id: "demo-proposal-roberto-0",
      conversationId: HIRE_CONV,
      fromMe: false,
      amountCents: 16500,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      scripted: true,
    });
    testStorage.setItem("freelah:demo:state:v1", JSON.stringify(saved));
    vi.resetModules();
    const store = await import("./store");
    expect(store.getState().proposals).toEqual([]);
  });
});
