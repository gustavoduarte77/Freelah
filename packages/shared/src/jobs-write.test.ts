import { describe, expect, it } from "vitest";
import {
  JOB_DEADLINE_MAX_DAYS,
  JOB_PRICE_MAX_CENTS,
  canCancelJob,
  canEditJob,
  canPublishJob,
  createJobSchema,
  jobFieldErrors,
  ownJobEffectiveStatus,
  serviceInstant,
  updateJobSchema,
  validateJobSchedule,
} from "./jobs-write";

const CATEGORY = "01990000-0000-7000-8000-0000000000aa";
const valid = {
  title: "Pintura de sala",
  description: "Preciso pintar uma sala de 20 m².",
  categoryId: CATEGORY,
  city: "Cataguases",
  state: "MG",
  scheduledDate: "2026-10-20",
  startTime: "08:00",
  proposedPriceCents: 20000,
  negotiable: true,
  expiresAt: "2026-10-19T23:59:00-03:00",
};
const NOW = new Date("2026-10-12T15:00:00Z");

const errorsOf = (input: unknown) => {
  const result = createJobSchema.safeParse(input);
  return result.success ? {} : jobFieldErrors(result.error);
};

describe("createJobSchema", () => {
  it("aceita uma oportunidade completa e normaliza os textos", () => {
    const result = createJobSchema.safeParse({
      ...valid,
      title: "  Pintura   de sala  ",
      state: " mg ",
      additionalInfo: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Pintura de sala");
      expect(result.data.state).toBe("MG");
      expect(result.data.additionalInfo).toBeNull();
      expect(result.data.publish).toBeUndefined();
    }
  });

  it("aceita os campos opcionais ausentes", () => {
    const { negotiable: _n, ...withoutNegotiable } = valid;
    expect(createJobSchema.safeParse(withoutNegotiable).success).toBe(true);
  });

  it.each(["title", "description", "categoryId", "city", "state", "scheduledDate", "startTime", "proposedPriceCents", "expiresAt"])(
    "exige o campo %s",
    (field) => {
      const input: Record<string, unknown> = { ...valid };
      delete input[field];
      expect(Object.keys(errorsOf(input))).toContain(field);
    },
  );

  it("rejeita campos desconhecidos, inclusive dono, estado e demonstração", () => {
    for (const extra of [{ ownerId: "x" }, { status: "PUBLISHED" }, { isDemo: true }, { publishedAt: "2026-01-01" }]) {
      const errors = errorsOf({ ...valid, ...extra });
      expect(errors._).toMatch(/Campo não permitido/);
    }
  });

  it("rejeita título e descrição vazios ou curtos demais", () => {
    expect(errorsOf({ ...valid, title: "   " }).title).toBe("Informe o título.");
    expect(errorsOf({ ...valid, title: "ab" }).title).toMatch(/pelo menos/);
    expect(errorsOf({ ...valid, description: "curta" }).description).toMatch(/pelo menos/);
    expect(errorsOf({ ...valid, title: "x".repeat(101) }).title).toMatch(/no máximo/);
    expect(errorsOf({ ...valid, description: "x".repeat(2001) }).description).toMatch(/no máximo/);
  });

  it("rejeita caracteres de controle mas aceita quebra de linha na descrição", () => {
    expect(errorsOf({ ...valid, title: "Pintura\u0000" }).title).toBeDefined();
    expect(errorsOf({ ...valid, description: "Linha um.\nLinha dois." }).description).toBeUndefined();
  });

  it("valida valor: inteiro, não negativo e dentro do limite", () => {
    expect(errorsOf({ ...valid, proposedPriceCents: -1 }).proposedPriceCents).toMatch(/negativo/);
    expect(errorsOf({ ...valid, proposedPriceCents: 10.5 }).proposedPriceCents).toMatch(/inteiros/);
    expect(errorsOf({ ...valid, proposedPriceCents: "200" }).proposedPriceCents).toBeDefined();
    expect(errorsOf({ ...valid, proposedPriceCents: JOB_PRICE_MAX_CENTS + 1 }).proposedPriceCents).toMatch(/maior/);
    expect(errorsOf({ ...valid, proposedPriceCents: 0 }).proposedPriceCents).toBeUndefined();
  });

  it("valida estado, categoria, data e horário", () => {
    expect(errorsOf({ ...valid, state: "XX" }).state).toMatch(/estado/);
    expect(errorsOf({ ...valid, categoryId: "cataguases" }).categoryId).toBeDefined();
    expect(errorsOf({ ...valid, scheduledDate: "20/10/2026" }).scheduledDate).toBeDefined();
    expect(errorsOf({ ...valid, startTime: "24:00" }).startTime).toBeDefined();
    expect(errorsOf({ ...valid, startTime: "8:00" }).startTime).toBeDefined();
    expect(errorsOf({ ...valid, expiresAt: "amanhã" }).expiresAt).toBeDefined();
    expect(errorsOf({ ...valid, expiresAt: "2026-10-19T23:59:00" }).expiresAt).toBeDefined();
  });

  it("não aceita negotiable nem publish que não sejam booleanos", () => {
    expect(errorsOf({ ...valid, negotiable: "sim" }).negotiable).toBeDefined();
    expect(errorsOf({ ...valid, publish: "true" }).publish).toBeDefined();
  });

  it("rejeita corpo que não é objeto", () => {
    for (const body of [null, [], "texto", 5, undefined]) {
      expect(createJobSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("updateJobSchema", () => {
  it("aceita só os campos enviados e não inventa os outros", () => {
    const result = updateJobSchema.safeParse({ title: "Novo título" });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toEqual(["title"]);
  });

  it("não preenche negotiable sozinho", () => {
    const result = updateJobSchema.safeParse({ city: "Muriaé" });
    expect(result.success && "negotiable" in result.data).toBe(false);
  });

  it("recusa corpo vazio, campo desconhecido e publish", () => {
    expect(updateJobSchema.safeParse({}).success).toBe(false);
    expect(updateJobSchema.safeParse({ ownerId: "x" }).success).toBe(false);
    expect(updateJobSchema.safeParse({ status: "CANCELLED" }).success).toBe(false);
    expect(updateJobSchema.safeParse({ publish: true }).success).toBe(false);
  });

  it("aplica as mesmas regras de campo", () => {
    expect(updateJobSchema.safeParse({ proposedPriceCents: -5 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ additionalInfo: null }).success).toBe(true);
  });
});

describe("serviceInstant (horário de Brasília)", () => {
  it("converte 08:00 de Brasília para 11:00 UTC", () => {
    expect(serviceInstant("2026-10-20", "08:00")?.toISOString()).toBe("2026-10-20T11:00:00.000Z");
  });

  it("vira o dia quando passa da meia-noite em UTC", () => {
    expect(serviceInstant("2026-10-20", "22:30")?.toISOString()).toBe("2026-10-21T01:30:00.000Z");
  });

  it("recusa datas que não existem", () => {
    expect(serviceInstant("2026-02-30", "08:00")).toBeNull();
    expect(serviceInstant("2026-13-01", "08:00")).toBeNull();
    expect(serviceInstant("2025-02-29", "08:00")).toBeNull();
    expect(serviceInstant("2028-02-29", "08:00")).not.toBeNull();
    expect(serviceInstant("2026-10-20", "25:00")).toBeNull();
  });
});

describe("validateJobSchedule", () => {
  const ok = { scheduledDate: "2026-10-20", startTime: "08:00", expiresAt: "2026-10-19T23:59:00-03:00" };

  it("aceita um calendário coerente", () => {
    expect(validateJobSchedule(ok, NOW, true)).toEqual({});
  });

  it("rejeita serviço no passado (no fuso de Brasília)", () => {
    // 12/10 12:00 em Brasília = 15:00 UTC (NOW). Serviço às 11:59 do mesmo dia já passou.
    const past = validateJobSchedule(
      { scheduledDate: "2026-10-12", startTime: "11:59", expiresAt: "2026-10-12T11:00:00-03:00" },
      NOW,
      true,
    );
    expect(past.scheduledDate).toMatch(/futuro/);
    const later = validateJobSchedule(
      { scheduledDate: "2026-10-12", startTime: "18:00", expiresAt: "2026-10-12T17:00:00-03:00" },
      NOW,
      true,
    );
    expect(later).toEqual({});
  });

  it("às 22h de Brasília ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC", () => {
    const night = new Date("2026-10-13T01:00:00Z"); // 12/10 22:00 em Brasília
    expect(
      validateJobSchedule(
        { scheduledDate: "2026-10-12", startTime: "23:00", expiresAt: "2026-10-12T22:30:00-03:00" },
        night,
        true,
      ),
    ).toEqual({});
  });

  it("rejeita prazo depois do serviço, no passado ou além de 60 dias", () => {
    expect(validateJobSchedule({ ...ok, expiresAt: "2026-10-20T08:01:00-03:00" }, NOW, true).expiresAt).toMatch(/depois da data/);
    expect(validateJobSchedule({ ...ok, expiresAt: "2026-10-12T11:59:00-03:00" }, NOW, true).expiresAt).toMatch(/futuro/);
    const far = { scheduledDate: "2027-03-01", startTime: "08:00" };
    expect(validateJobSchedule({ ...far, expiresAt: "2027-02-01T00:00:00-03:00" }, NOW, true).expiresAt).toMatch(/60 dias/);
  });

  it("aceita o prazo no limite exato de 60 dias e do serviço", () => {
    const limit = new Date(NOW.getTime() + JOB_DEADLINE_MAX_DAYS * 86_400_000).toISOString();
    expect(
      validateJobSchedule({ scheduledDate: "2027-03-01", startTime: "08:00", expiresAt: limit }, NOW, true),
    ).toEqual({});
    expect(
      validateJobSchedule({ scheduledDate: "2026-10-20", startTime: "08:00", expiresAt: "2026-10-20T08:00:00-03:00" }, NOW, true),
    ).toEqual({});
  });

  it("rejeita data inexistente", () => {
    expect(validateJobSchedule({ ...ok, scheduledDate: "2026-02-30" }, NOW, true).scheduledDate).toBeDefined();
  });

  it("sem checagem relativa, só exige coerência entre prazo e serviço", () => {
    const old = { scheduledDate: "2026-01-10", startTime: "08:00", expiresAt: "2026-01-09T10:00:00-03:00" };
    expect(validateJobSchedule(old, NOW, false)).toEqual({});
    expect(validateJobSchedule({ ...old, expiresAt: "2026-01-11T10:00:00-03:00" }, NOW, false).expiresAt).toBeDefined();
    expect(validateJobSchedule(old, NOW, true).scheduledDate).toBeDefined();
  });
});

describe("estados", () => {
  it("define o que o dono pode fazer em cada estado", () => {
    const table = {
      DRAFT: [true, true, true],
      PUBLISHED: [true, false, true],
      NEGOTIATING: [true, false, true],
      HIRED: [false, false, false],
      COMPLETED: [false, false, false],
      CANCELLED: [false, false, false],
      EXPIRED: [false, false, false],
    } as const;
    for (const [status, [edit, publish, cancel]] of Object.entries(table)) {
      const s = status as keyof typeof table;
      expect([canEditJob(s), canPublishJob(s), canCancelJob(s)], status).toEqual([edit, publish, cancel]);
    }
  });

  it("trata aberta com prazo vencido como expirada, mas nunca o rascunho", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(ownJobEffectiveStatus("PUBLISHED", past, NOW)).toBe("EXPIRED");
    expect(ownJobEffectiveStatus("NEGOTIATING", past, NOW)).toBe("EXPIRED");
    expect(ownJobEffectiveStatus("DRAFT", past, NOW)).toBe("DRAFT");
    expect(ownJobEffectiveStatus("CANCELLED", past, NOW)).toBe("CANCELLED");
    expect(ownJobEffectiveStatus("HIRED", past, NOW)).toBe("HIRED");
  });
});
