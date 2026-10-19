-- Valor opcional: "A negociar" é uma oportunidade SEM valor definido (NULL), nunca zero.
-- Os preços que já existem são mantidos como estão (nenhuma linha é alterada).
ALTER TABLE "Job" ALTER COLUMN "proposedPriceCents" DROP NOT NULL;

-- Sem valor, a oportunidade é obrigatoriamente negociável (o CHECK de valor não negativo continua valendo;
-- NULL passa nele). Nenhuma linha existente tem valor NULL, então a regra já nasce válida.
ALTER TABLE "Job"
  ADD CONSTRAINT "Job_no_price_requires_negotiable_chk" CHECK ("proposedPriceCents" IS NOT NULL OR "negotiable");

-- Observação: a regra "valor maior que zero" é aplicada pela API (esquema compartilhado). Ela não entra aqui
-- como CHECK porque linhas antigas com valor 0, se existirem, deixariam de poder ser atualizadas (cancelar,
-- expirar). Para listá-las antes de decidir o tratamento:
--   SELECT id, title, status FROM "Job" WHERE "proposedPriceCents" = 0;
