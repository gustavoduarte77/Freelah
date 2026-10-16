import { createPrisma } from "../src/db";
import { databaseName, isLocalDatabaseUrl } from "../scripts/db-safety";
import { MVP_CATEGORIES } from "./categories";
import {
  DEMO_HIRED_INTEREST_ID,
  DEMO_OWNERS,
  DEMO_WORKER,
  buildDemoJobs,
} from "./demo-data";

// Dados de demonstração (isDemo = true) apenas no banco LOCAL. Idempotente: pode rodar de novo
// para renovar as datas. Recusa qualquer banco remoto (o Neon nunca recebe este seed).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (apps/api/.env).");
if (!isLocalDatabaseUrl(url)) {
  throw new Error(
    "Seed de demonstração recusado: DATABASE_URL não aponta para um banco local (localhost/127.0.0.1).",
  );
}

const prisma = createPrisma(url);
const now = new Date();

try {
  const categoryIds = new Map<string, string>();
  for (const category of MVP_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, active: true },
      create: category,
    });
    categoryIds.set(category.slug, row.id);
  }

  for (const person of [...DEMO_OWNERS, DEMO_WORKER]) {
    const data = {
      name: person.name,
      email: person.email,
      phone: person.phone,
      city: person.city,
      isDemo: true,
    };
    await prisma.user.upsert({
      where: { id: person.id },
      update: data,
      create: { id: person.id, ...data, adultConfirmedAt: now },
    });
  }

  let created = 0;
  for (const job of buildDemoJobs(now)) {
    const categoryId = categoryIds.get(job.category);
    if (!categoryId) throw new Error(`Categoria desconhecida: ${job.category}`);
    const { category: _category, hiredWorkerId, ...fields } = job;
    const data = { ...fields, categoryId, isDemo: true, cancelledAt: job.status === "CANCELLED" ? now : null };

    const exists = await prisma.job.findUnique({ where: { id: job.id }, select: { id: true } });
    if (hiredWorkerId) {
      // O banco exige trabalhador selecionado para "contratada": cria a vaga, o interesse e liga.
      await prisma.job.upsert({
        where: { id: job.id },
        update: { ...data, status: "PUBLISHED", selectedInterestId: null, hiredAt: null },
        create: { ...data, status: "PUBLISHED" },
      });
      await prisma.interest.upsert({
        where: { id: DEMO_HIRED_INTEREST_ID },
        update: { status: "ACCEPTED" },
        create: {
          id: DEMO_HIRED_INTEREST_ID,
          jobId: job.id,
          workerId: hiredWorkerId,
          status: "ACCEPTED",
        },
      });
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "HIRED", selectedInterestId: DEMO_HIRED_INTEREST_ID, hiredAt: now },
      });
    } else {
      await prisma.job.upsert({ where: { id: job.id }, update: data, create: data });
    }
    if (!exists) created += 1;
  }

  const visible = await prisma.job.count({
    where: { isDemo: true, status: { in: ["PUBLISHED", "NEGOTIATING"] }, expiresAt: { gt: now } },
  });
  console.log(
    `Seed de demonstração no banco local "${databaseName(url)}": ${created} oportunidades novas, ` +
      `${visible} visíveis na exploração (as demais ficam escondidas de propósito).`,
  );
} finally {
  await prisma.$disconnect();
}
