import { describe, expect, it } from "vitest";
import { JOB_PRICE_MAX_CENTS } from "./jobs-write";
import {
  AGREEMENT_FINAL_MESSAGE,
  NEGOTIATION_COMPLETED_MESSAGE,
  NEGOTIATION_HIRED_MESSAGE,
  NOT_NEGOTIABLE_MESSAGE,
  PENDING_EXISTS_MESSAGE,
  createProposalSchema,
  negotiationClosedReason,
  proposalActions,
  proposalEligibility,
  proposalSchema,
  proposalsResponseSchema,
  type NegotiationContext,
} from "./proposals";

const open: NegotiationContext = { jobStatus: "NEGOTIATING", interestStatus: "PENDING", negotiable: true, conversationBlockedReason: null };

describe("createProposalSchema", () => {
  it("aceita só um valor inteiro positivo dentro do limite", () => {
    expect(createProposalSchema.safeParse({ amountCents: 15000 }).success).toBe(true);
    expect(createProposalSchema.safeParse({ amountCents: 1 }).success).toBe(true);
    expect(createProposalSchema.safeParse({ amountCents: JOB_PRICE_MAX_CENTS }).success).toBe(true);
  });

  it("recusa zero, negativo, decimal, texto, ausente, NaN e acima do limite", () => {
    for (const amountCents of [0, -1, 10.5, "150", undefined, null, Number.NaN, JOB_PRICE_MAX_CENTS + 1]) {
      expect(createProposalSchema.safeParse({ amountCents }).success, String(amountCents)).toBe(false);
    }
  });

  it("não aceita observação nem qualquer campo a mais (autor e destinatário vêm da sessão)", () => {
    for (const extra of [{ note: "oi" }, { authorId: "x" }, { recipientId: "y" }, { status: "ACCEPTED" }]) {
      expect(createProposalSchema.safeParse({ amountCents: 100, ...extra }).success).toBe(false);
    }
  });
});

describe("negotiationClosedReason", () => {
  it("fica aberta numa conversa ativa", () => {
    expect(negotiationClosedReason(open)).toBeNull();
    expect(negotiationClosedReason({ ...open, jobStatus: "PUBLISHED" })).toBeNull();
  });

  it("fecha com contratação, conclusão e com o motivo de bloqueio da conversa", () => {
    expect(negotiationClosedReason({ ...open, jobStatus: "HIRED" })).toBe(NEGOTIATION_HIRED_MESSAGE);
    expect(negotiationClosedReason({ ...open, interestStatus: "ACCEPTED" })).toBe(NEGOTIATION_HIRED_MESSAGE);
    expect(negotiationClosedReason({ ...open, jobStatus: "COMPLETED" })).toBe(NEGOTIATION_COMPLETED_MESSAGE);
    expect(negotiationClosedReason({ ...open, conversationBlockedReason: "O contratante cancelou." })).toBe("O contratante cancelou.");
  });
});

describe("proposalEligibility", () => {
  it("permite propor em oportunidade negociável sem proposta pendente nem aceita", () => {
    expect(proposalEligibility(open, [])).toEqual({ canPropose: true, reason: null });
    expect(proposalEligibility(open, [{ status: "DECLINED" }, { status: "WITHDRAWN" }])).toEqual({ canPropose: true, reason: null });
  });

  it("recusa em oportunidade de valor fixo", () => {
    expect(proposalEligibility({ ...open, negotiable: false }, [])).toEqual({ canPropose: false, reason: NOT_NEGOTIABLE_MESSAGE });
  });

  it("só uma pendente por vez", () => {
    expect(proposalEligibility(open, [{ status: "PENDING" }])).toEqual({ canPropose: false, reason: PENDING_EXISTS_MESSAGE });
  });

  it("depois de aceita o acordo é final", () => {
    expect(proposalEligibility(open, [{ status: "DECLINED" }, { status: "ACCEPTED" }])).toEqual({
      canPropose: false,
      reason: AGREEMENT_FINAL_MESSAGE,
    });
  });

  it("não permite com a negociação fechada (cancelada, expirada, contratada, concluída), mesmo negociável", () => {
    for (const closed of [
      { ...open, jobStatus: "HIRED" },
      { ...open, jobStatus: "COMPLETED" },
      { ...open, conversationBlockedReason: "O prazo desta oportunidade terminou." },
    ]) {
      expect(proposalEligibility(closed, []).canPropose).toBe(false);
    }
  });
});

describe("proposalActions", () => {
  it("só a outra pessoa aceita e recusa, só a autora retira, e só enquanto pendente e aberta", () => {
    expect(proposalActions("PENDING", false, null)).toEqual({ canAccept: true, canDecline: true, canWithdraw: false });
    expect(proposalActions("PENDING", true, null)).toEqual({ canAccept: false, canDecline: false, canWithdraw: true });
    for (const status of ["ACCEPTED", "DECLINED", "WITHDRAWN"] as const) {
      for (const author of [true, false]) {
        expect(proposalActions(status, author, null), `${status}/${author}`).toEqual({ canAccept: false, canDecline: false, canWithdraw: false });
      }
    }
  });

  it("negociação fechada: nada pode ser decidido", () => {
    expect(proposalActions("PENDING", false, "fechada")).toEqual({ canAccept: false, canDecline: false, canWithdraw: false });
    expect(proposalActions("PENDING", true, "fechada")).toEqual({ canAccept: false, canDecline: false, canWithdraw: false });
  });
});

describe("contratos de resposta", () => {
  const proposal = {
    id: "p1",
    conversationId: "c1",
    amountCents: 16500,
    status: "PENDING",
    fromMe: false,
    authorName: "Roberto",
    createdAt: "2026-10-18T10:00:00.000Z",
    decidedAt: null,
    canAccept: true,
    canDecline: true,
    canWithdraw: false,
    closedReason: null,
  };

  it("valida a proposta e a lista", () => {
    expect(proposalSchema.safeParse(proposal).success).toBe(true);
    expect(proposalsResponseSchema.safeParse({ proposals: [proposal], canPropose: false, proposeBlockedReason: PENDING_EXISTS_MESSAGE }).success).toBe(true);
  });

  it("recusa valor zero ou estado desconhecido", () => {
    expect(proposalSchema.safeParse({ ...proposal, amountCents: 0 }).success).toBe(false);
    expect(proposalSchema.safeParse({ ...proposal, status: "EXPIRED" }).success).toBe(false);
  });
});
