-- Convite formal de contratação: o contratante convida (invitedAt) e o trabalhador aceita ou recusa.
-- Recusar só preenche inviteDeclinedAt; aceitar usa o fluxo de contratação já existente.
ALTER TABLE "Interest" ADD COLUMN "invitedAt" TIMESTAMP(3), ADD COLUMN "inviteDeclinedAt" TIMESTAMP(3);
