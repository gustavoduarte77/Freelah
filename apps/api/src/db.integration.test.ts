import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "./db";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./test-support";

// Roda só com apps/api/.env.test (banco de testes local, já migrado). Sem ele, é pulado.

describe.skipIf(!testDatabaseUrl)("integridade do banco (integração)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = connectTestDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  let counter = 0;
  async function makeUser() {
    counter += 1;
    return prisma.user.create({
      data: {
        id: `user-${counter}`,
        name: `Pessoa ${counter}`,
        email: `pessoa${counter}@teste.local`,
        phone: "32999990000",
        city: "Cataguases",
        adultConfirmedAt: new Date(),
      },
    });
  }

  async function makeJob(ownerId: string, status: "PUBLISHED" | "DRAFT" = "PUBLISHED") {
    const category = await prisma.category.upsert({
      where: { slug: "construcao-civil" },
      update: {},
      create: { slug: "construcao-civil", name: "Construção Civil" },
    });
    return prisma.job.create({
      data: {
        title: "Pintura de sala",
        description: "Pintar uma sala de 20 m².",
        categoryId: category.id,
        ownerId,
        city: "Cataguases",
        state: "MG",
        scheduledDate: new Date("2026-12-12"),
        startTime: "08:00",
        proposedPriceCents: 20000,
        negotiable: true,
        expiresAt: new Date("2026-12-10T00:00:00Z"),
        status,
      },
    });
  }

  it("rejeita preferências com as duas opções desativadas", async () => {
    const user = await makeUser();
    await expect(
      prisma.userPreference.create({
        data: { userId: user.id, wantsWork: false, wantsToHire: false },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.userPreference.create({
        data: { userId: user.id, wantsWork: true, wantsToHire: false },
      }),
    ).resolves.toBeTruthy();
  });

  it("sem valor (A negociar) exige negociável, e valor NULL é aceito", async () => {
    const owner = await makeUser();
    const job = await makeJob(owner.id);
    await expect(
      prisma.job.update({ where: { id: job.id }, data: { proposedPriceCents: null, negotiable: false } }),
    ).rejects.toThrow();
    await expect(
      prisma.job.update({ where: { id: job.id }, data: { proposedPriceCents: null, negotiable: true } }),
    ).resolves.toMatchObject({ proposedPriceCents: null, negotiable: true });
  });

  it("rejeita valor negativo e horário inválido", async () => {
    const owner = await makeUser();
    const job = await makeJob(owner.id);
    await expect(
      prisma.job.update({ where: { id: job.id }, data: { proposedPriceCents: -1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.job.update({ where: { id: job.id }, data: { startTime: "25:99" } }),
    ).rejects.toThrow();
  });

  it("rejeita interesse duplicado, inclusive em requisições simultâneas", async () => {
    const owner = await makeUser();
    const worker = await makeUser();
    const job = await makeJob(owner.id);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        prisma.interest.create({ data: { jobId: job.id, workerId: worker.id } }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.interest.count({ where: { jobId: job.id } })).toBe(1);
  });

  it("seleciona só um trabalhador mesmo com seleções simultâneas", async () => {
    const owner = await makeUser();
    const job = await makeJob(owner.id);
    const workers = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const interests = await Promise.all(
      workers.map((w) => prisma.interest.create({ data: { jobId: job.id, workerId: w.id } })),
    );

    const attempts = await Promise.all(
      interests.map((interest) =>
        prisma.job.updateMany({
          where: { id: job.id, status: { in: ["PUBLISHED", "NEGOTIATING"] } },
          data: { status: "HIRED", selectedInterestId: interest.id, hiredAt: new Date() },
        }),
      ),
    );

    expect(attempts.reduce((sum, r) => sum + r.count, 0)).toBe(1);
    const saved = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(saved.status).toBe("HIRED");
    expect(interests.map((i) => i.id)).toContain(saved.selectedInterestId);
  });

  it("não permite contratação incoerente com o estado", async () => {
    const owner = await makeUser();
    const worker = await makeUser();
    const job = await makeJob(owner.id);
    const interest = await prisma.interest.create({
      data: { jobId: job.id, workerId: worker.id },
    });

    await expect(
      prisma.job.update({ where: { id: job.id }, data: { status: "HIRED" } }),
    ).rejects.toThrow();
    await expect(
      prisma.job.update({
        where: { id: job.id },
        data: { status: "COMPLETED", selectedInterestId: interest.id, hiredAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.job.update({
        where: { id: job.id },
        data: { selectedInterestId: interest.id },
      }),
    ).rejects.toThrow();
  });

  it("não permite o mesmo interesse selecionado em duas oportunidades", async () => {
    const owner = await makeUser();
    const worker = await makeUser();
    const jobA = await makeJob(owner.id);
    const jobB = await makeJob(owner.id);
    const interest = await prisma.interest.create({
      data: { jobId: jobA.id, workerId: worker.id },
    });
    const hire = { status: "HIRED" as const, selectedInterestId: interest.id, hiredAt: new Date() };
    await prisma.job.update({ where: { id: jobA.id }, data: hire });
    await expect(prisma.job.update({ where: { id: jobB.id }, data: hire })).rejects.toThrow();
  });

  it("mantém uma conversa por interesse e rejeita participante repetido", async () => {
    const owner = await makeUser();
    const worker = await makeUser();
    const job = await makeJob(owner.id);
    const interest = await prisma.interest.create({
      data: { jobId: job.id, workerId: worker.id },
    });
    const conversation = await prisma.conversation.create({
      data: { jobId: job.id, interestId: interest.id },
    });
    await expect(
      prisma.conversation.create({ data: { jobId: job.id, interestId: interest.id } }),
    ).rejects.toThrow();
    await prisma.conversationParticipant.create({
      data: { conversationId: conversation.id, userId: owner.id },
    });
    await expect(
      prisma.conversationParticipant.create({
        data: { conversationId: conversation.id, userId: owner.id },
      }),
    ).rejects.toThrow();
  });

  it("rejeita bloqueio duplicado, auto-bloqueio e denúncia sem alvo", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await prisma.userBlock.create({ data: { blockerId: a.id, blockedUserId: b.id } });
    await expect(
      prisma.userBlock.create({ data: { blockerId: a.id, blockedUserId: b.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.userBlock.create({ data: { blockerId: a.id, blockedUserId: a.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.report.create({ data: { reporterId: a.id, reason: "SPAM" } }),
    ).rejects.toThrow();
    await expect(
      prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, reason: "SPAM" } }),
    ).resolves.toBeTruthy();
  });

  it("rejeita e-mail duplicado", async () => {
    const existing = await makeUser();
    await expect(
      prisma.user.create({
        data: {
          id: "dup",
          name: "Duplicado",
          email: existing.email,
          phone: "1",
          city: "X",
          adultConfirmedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
