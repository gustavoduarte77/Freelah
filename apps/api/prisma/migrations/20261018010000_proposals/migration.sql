-- Proposta de valor dentro de uma conversa (PRD 18.5).
-- Independente das migrações anteriores: só cria o tipo e a tabela nova. Não altera "Job": a proposta
-- (e a aceitação dela) nunca muda o valor publicado nem contrata.

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proposal_conversationId_createdAt_idx" ON "Proposal"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_authorId_idx" ON "Proposal"("authorId");

-- CreateIndex
CREATE INDEX "Proposal_recipientId_idx" ON "Proposal"("recipientId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras de integridade que o Prisma não expressa (o Prisma ignora CHECK e índices parciais ao comparar o schema).
-- ---------------------------------------------------------------------------

-- Valor positivo e dentro do limite do produto (R$ 999.999,99); autora e destinatária são pessoas diferentes;
-- a decisão é coerente com o estado: pendente não tem data de decisão, as demais têm.
ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_amount_range_chk" CHECK ("amountCents" > 0 AND "amountCents" <= 99999999),
  ADD CONSTRAINT "Proposal_parties_differ_chk" CHECK ("authorId" <> "recipientId"),
  ADD CONSTRAINT "Proposal_decision_consistency_chk" CHECK (
    CASE WHEN "status" = 'PENDING' THEN "decidedAt" IS NULL ELSE "decidedAt" IS NOT NULL END
  );

-- No máximo UMA proposta pendente e UMA aceita por conversa, garantidas pelo banco (duas criações
-- simultâneas: só uma vence). Recusadas e retiradas ficam no histórico sem limite.
CREATE UNIQUE INDEX "Proposal_one_pending_per_conversation_idx" ON "Proposal"("conversationId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "Proposal_one_accepted_per_conversation_idx" ON "Proposal"("conversationId") WHERE "status" = 'ACCEPTED';
