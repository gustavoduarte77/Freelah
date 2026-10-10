import { createPrisma } from "../src/db";
import { MVP_CATEGORIES } from "./categories";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não definida. Configure apps/api/.env antes de rodar o seed.");
}

const prisma = createPrisma(url);

try {
  for (const category of MVP_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, active: true },
      create: category,
    });
  }
  console.log(`Seed concluído: ${MVP_CATEGORIES.length} categorias.`);
} finally {
  await prisma.$disconnect();
}
