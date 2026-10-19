-- Perfil público: ocupação e apresentação (PRD 22). Só acrescenta duas colunas opcionais em "User":
-- nenhum dado existente é alterado ou apagado, e as contas atuais ficam com os dois campos vazios.
-- Os papéis (Profissional / Contratante) não ganham coluna: vêm de "UserPreference".

-- AlterTable
ALTER TABLE "User" ADD COLUMN "headline" TEXT,
ADD COLUMN "bio" TEXT;

-- Limites de tamanho garantidos pelo banco (o Prisma não expressa CHECK): ocupação até 80 e apresentação até 600.
ALTER TABLE "User"
  ADD CONSTRAINT "User_headline_len_chk" CHECK ("headline" IS NULL OR char_length("headline") <= 80),
  ADD CONSTRAINT "User_bio_len_chk" CHECK ("bio" IS NULL OR char_length("bio") <= 600);
