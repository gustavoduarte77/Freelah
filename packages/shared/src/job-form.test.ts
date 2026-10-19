import { describe, expect, it } from "vitest";
import { JOB_PRICE_MAX_CENTS, type OwnJob } from "./jobs-write";
import {
  DATE_FORMAT_MESSAGE,
  PRICE_FORMAT_MESSAGE,
  PRICE_REQUIRED_MESSAGE,
  PRICE_ZERO_MESSAGE,
  centsToPriceInput,
  maskPriceInput,
  parsePriceInput,
  TIME_FORMAT_MESSAGE,
  buildCreateJobRequest,
  buildUpdateJobRequest,
  centsToReaisInput,
  jobToFormValues,
  computeDeadline,
  describeDeadline,
  emptyJobForm,
  firstErrorField,
  formatBrDate,
  formatBrasiliaDateTime,
  maskDateInput,
  maskStateInput,
  maskTimeInput,
  mapServerFields,
  parseBrDate,
  suggestDeadlineDate,
  type JobFormValues,
} from "./job-form";

// 12/10/2026 12:00 em Brasília.
const NOW = new Date("2026-10-12T15:00:00Z");
const CATEGORY = "01990000-0000-7000-8000-0000000000aa";

const valid: JobFormValues = {
  title: "Pintura de sala",
  description: "Preciso pintar uma sala de 20 m².",
  additionalInfo: "",
  categoryId: CATEGORY,
  city: "Cataguases",
  state: "mg",
  scheduledDate: "20/10/2026",
  startTime: "08:00",
  price: "200",
  negotiable: true,
  toNegotiate: false,
  deadlineDate: "19/10/2026",
};

describe("máscaras", () => {
  it("data: insere as barras enquanto digita e ignora o que não é dígito", () => {
    expect(maskDateInput("2")).toBe("2");
    expect(maskDateInput("201")).toBe("20/1");
    expect(maskDateInput("2010")).toBe("20/10");
    expect(maskDateInput("20102")).toBe("20/10/2");
    expect(maskDateInput("20102026")).toBe("20/10/2026");
    expect(maskDateInput("20/10/2026999")).toBe("20/10/2026");
    expect(maskDateInput("ab2c0")).toBe("20");
    expect(maskDateInput("")).toBe("");
  });

  it("data: apagar uma barra não trava a digitação", () => {
    expect(maskDateInput("20/1")).toBe("20/1");
    expect(maskDateInput("20")).toBe("20");
    expect(maskDateInput(maskDateInput("20/10/2026").slice(0, -1))).toBe("20/10/202");
  });

  it("horário: insere os dois pontos", () => {
    expect(maskTimeInput("0")).toBe("0");
    expect(maskTimeInput("08")).toBe("08");
    expect(maskTimeInput("083")).toBe("08:3");
    expect(maskTimeInput("0830")).toBe("08:30");
    expect(maskTimeInput("08:305")).toBe("08:30");
  });

  it("UF: duas letras maiúsculas", () => {
    expect(maskStateInput("mg")).toBe("MG");
    expect(maskStateInput("m1g2x")).toBe("MG");
    expect(maskStateInput("")).toBe("");
  });
});

describe("datas", () => {
  it("parseBrDate converte e recusa datas que não existem", () => {
    expect(parseBrDate("20/10/2026")).toBe("2026-10-20");
    expect(parseBrDate(" 29/02/2028 ")).toBe("2028-02-29");
    expect(parseBrDate("29/02/2026")).toBeNull();
    expect(parseBrDate("31/04/2026")).toBeNull();
    expect(parseBrDate("00/10/2026")).toBeNull();
    expect(parseBrDate("20/13/2026")).toBeNull();
    expect(parseBrDate("2/10/2026")).toBeNull();
    expect(parseBrDate("2026-10-20")).toBeNull();
    expect(parseBrDate("")).toBeNull();
  });

  it("formatBrDate", () => {
    expect(formatBrDate("2026-10-20")).toBe("20/10/2026");
    expect(formatBrDate("lixo")).toBe("lixo");
  });

  it("formatBrasiliaDateTime usa o horário de Brasília, inclusive na virada do dia em UTC", () => {
    expect(formatBrasiliaDateTime(new Date("2026-10-20T02:59:00Z"))).toBe("19/10/2026 às 23:59");
    expect(formatBrasiliaDateTime(new Date("2026-10-20T11:00:00Z"))).toBe("20/10/2026 às 08:00");
    expect(formatBrasiliaDateTime(new Date("2026-10-20T03:00:00Z"))).toBe("20/10/2026 às 00:00");
  });
});

describe("computeDeadline", () => {
  const base = { scheduledDate: "20/10/2026", startTime: "08:00", now: NOW };

  it("é 23:59 de Brasília do dia escolhido", () => {
    const result = computeDeadline({ ...base, deadlineDate: "19/10/2026" });
    expect("instant" in result && result.instant.toISOString()).toBe("2026-10-20T02:59:00.000Z");
    expect("cappedBy" in result && result.cappedBy).toBeNull();
    if ("instant" in result) expect(describeDeadline(result)).toBe("19/10/2026 às 23:59");
  });

  it("no dia do serviço, é limitado ao início do serviço", () => {
    const result = computeDeadline({ ...base, deadlineDate: "20/10/2026" });
    if (!("instant" in result)) throw new Error("esperava prazo");
    expect(result.instant.toISOString()).toBe("2026-10-20T11:00:00.000Z");
    expect(result.cappedBy).toBe("service");
    expect(describeDeadline(result)).toBe("20/10/2026 às 08:00 (limitado ao início do serviço)");
  });

  it("depois do dia do serviço, também é limitado ao início do serviço", () => {
    const result = computeDeadline({ ...base, deadlineDate: "25/10/2026" });
    expect("instant" in result && result.instant.toISOString()).toBe("2026-10-20T11:00:00.000Z");
  });

  it("no último dia permitido, é limitado a 60 dias a partir de agora", () => {
    const result = computeDeadline({ deadlineDate: "11/12/2026", scheduledDate: "01/03/2027", startTime: "08:00", now: NOW });
    if (!("instant" in result)) throw new Error("esperava prazo");
    expect(result.instant.toISOString()).toBe("2026-12-11T15:00:00.000Z");
    expect(result.cappedBy).toBe("limit");
    expect(describeDeadline(result)).toBe("11/12/2026 às 12:00 (limite de 60 dias)");
  });

  it("um dia depois do limite de 60 dias é erro, com a data limite na mensagem", () => {
    const result = computeDeadline({ deadlineDate: "12/12/2026", scheduledDate: "01/03/2027", startTime: "08:00", now: NOW });
    expect(result).toEqual({ error: expect.stringContaining("até 11/12/2026") });
  });

  it("nunca passa do serviço nem do limite, em nenhuma combinação", () => {
    const days = ["12/10/2026", "13/10/2026", "20/10/2026", "21/10/2026", "01/12/2026", "11/12/2026"];
    for (const scheduledDate of ["13/10/2026", "20/10/2026", "01/12/2026", "01/03/2027"]) {
      for (const deadlineDate of days) {
        const result = computeDeadline({ deadlineDate, scheduledDate, startTime: "08:00", now: NOW });
        if (!("instant" in result)) continue;
        const service = new Date(`${parseBrDate(scheduledDate)}T11:00:00Z`);
        expect(result.instant.getTime(), `${deadlineDate} / ${scheduledDate}`).toBeLessThanOrEqual(service.getTime());
        expect(result.instant.getTime()).toBeLessThanOrEqual(NOW.getTime() + 60 * 86_400_000);
      }
    }
  });

  it("vazio e formato inválido dão mensagens específicas", () => {
    expect(computeDeadline({ ...base, deadlineDate: "" })).toEqual({ error: expect.stringContaining("até que dia") });
    expect(computeDeadline({ ...base, deadlineDate: "31/02/2026" })).toEqual({ error: expect.stringContaining("DD/MM/AAAA") });
    expect(computeDeadline({ ...base, deadlineDate: "amanhã" })).toEqual({ error: expect.stringContaining("DD/MM/AAAA") });
  });

  it("sem data de serviço válida, não limita pelo serviço", () => {
    const result = computeDeadline({ deadlineDate: "19/10/2026", scheduledDate: "", startTime: "", now: NOW });
    expect("instant" in result && result.instant.toISOString()).toBe("2026-10-20T02:59:00.000Z");
  });
});

describe("suggestDeadlineDate", () => {
  it("sugere o dia anterior ao serviço", () => {
    expect(suggestDeadlineDate("20/10/2026", NOW)).toBe("19/10/2026");
    expect(suggestDeadlineDate("01/11/2026", NOW)).toBe("31/10/2026");
    expect(suggestDeadlineDate("01/01/2027", new Date("2026-12-20T15:00:00Z"))).toBe("31/12/2026");
  });

  it("não sugere um dia que já passou: no mínimo hoje", () => {
    expect(suggestDeadlineDate("12/10/2026", NOW)).toBe("12/10/2026");
    expect(suggestDeadlineDate("13/10/2026", NOW)).toBe("12/10/2026");
  });

  it("não sugere além do limite de 60 dias", () => {
    expect(suggestDeadlineDate("01/03/2027", NOW)).toBe("11/12/2026");
  });

  it("sem data de serviço válida, não sugere nada", () => {
    expect(suggestDeadlineDate("", NOW)).toBe("");
    expect(suggestDeadlineDate("20/10", NOW)).toBe("");
    expect(suggestDeadlineDate("31/02/2026", NOW)).toBe("");
  });

  it("a sugestão sempre vira um prazo válido", () => {
    for (const scheduledDate of ["12/10/2026", "13/10/2026", "20/10/2026", "01/12/2026", "01/03/2027"]) {
      const suggestion = suggestDeadlineDate(scheduledDate, NOW);
      expect("instant" in computeDeadline({ deadlineDate: suggestion, scheduledDate, startTime: "18:00", now: NOW }), scheduledDate).toBe(true);
    }
  });
});

describe("buildCreateJobRequest", () => {
  it("monta o corpo da API com valor em centavos, data ISO e prazo em UTC", () => {
    const result = buildCreateJobRequest(valid, NOW);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.request).toEqual({
      title: "Pintura de sala",
      description: "Preciso pintar uma sala de 20 m².",
      additionalInfo: null,
      categoryId: CATEGORY,
      city: "Cataguases",
      state: "MG",
      scheduledDate: "2026-10-20",
      startTime: "08:00",
      proposedPriceCents: 20000,
      negotiable: true,
      expiresAt: "2026-10-20T02:59:00.000Z",
    });
    expect(result.deadline.cappedBy).toBeNull();
    expect(result.service.toISOString()).toBe("2026-10-20T11:00:00.000Z");
  });

  it("aceita os formatos de valor digitados à mão e o da máscara", () => {
    for (const [price, cents] of [["200", 20000], ["200,00", 20000], ["R$ 200", 20000], ["1234,56", 123456], ["10.5", 1050], ["1.234,56", 123456], ["999.999,99", 99_999_999]] as const) {
      const result = buildCreateJobRequest({ ...valid, price }, NOW);
      expect(result.ok && result.request.proposedPriceCents, price).toBe(cents);
    }
  });

  it("valor zero não é um preço: pede um valor maior que zero", () => {
    for (const price of ["0", "0,00", "R$ 0,00"]) {
      const result = buildCreateJobRequest({ ...valid, price }, NOW);
      if (result.ok) throw new Error(`esperava erro para ${price}`);
      expect(result.errors.price, price).toBe(PRICE_ZERO_MESSAGE);
    }
  });

  it("devolve todos os erros de um formulário vazio de uma vez, com as mensagens específicas", () => {
    const result = buildCreateJobRequest(emptyJobForm(), NOW);
    if (result.ok) throw new Error("esperava erros");
    expect(Object.keys(result.errors).sort()).toEqual(
      ["categoryId", "city", "deadlineDate", "description", "price", "scheduledDate", "startTime", "state", "title"].sort(),
    );
    expect(result.errors.price).toBe(PRICE_REQUIRED_MESSAGE);
    expect(result.errors.scheduledDate).toBe("Informe a data do serviço.");
    expect(result.errors.deadlineDate).toMatch(/até que dia/);
    expect(result.errors.title).toBeDefined();
  });

  it("valor, data e horário inválidos têm mensagens claras", () => {
    const result = buildCreateJobRequest({ ...valid, price: "abc", scheduledDate: "31/02/2026", startTime: "24:00" }, NOW);
    if (result.ok) throw new Error("esperava erros");
    expect(result.errors.price).toBe(PRICE_FORMAT_MESSAGE);
    expect(result.errors.scheduledDate).toBe(DATE_FORMAT_MESSAGE);
    expect(result.errors.startTime).toBe(TIME_FORMAT_MESSAGE);
    expect(buildCreateJobRequest({ ...valid, price: "-5" }, NOW).ok).toBe(false);
  });

  it("serviço no passado e prazo no passado vão para os campos certos", () => {
    const past = buildCreateJobRequest({ ...valid, scheduledDate: "11/10/2026", deadlineDate: "11/10/2026" }, NOW);
    if (past.ok) throw new Error("esperava erros");
    expect(past.errors.scheduledDate).toMatch(/futuro/);
    expect(past.errors.deadlineDate).toMatch(/futuro/);
  });

  it("mostra os erros de calendário mesmo quando outro campo também está errado", () => {
    const result = buildCreateJobRequest({ ...valid, price: "abc", title: "", scheduledDate: "11/10/2026", deadlineDate: "11/10/2026" }, NOW);
    if (result.ok) throw new Error("esperava erros");
    expect(result.errors.price).toBe(PRICE_FORMAT_MESSAGE);
    expect(result.errors.title).toBeDefined();
    expect(result.errors.scheduledDate).toMatch(/futuro/);
    expect(result.errors.deadlineDate).toMatch(/futuro/);
  });

  it("um prazo depois do serviço não é erro: é limitado ao início do serviço", () => {
    const result = buildCreateJobRequest({ ...valid, deadlineDate: "25/10/2026" }, NOW);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.request.expiresAt).toBe("2026-10-20T11:00:00.000Z");
    expect(result.deadline.cappedBy).toBe("service");
  });

  it("um prazo além de 60 dias é erro de prazo", () => {
    const result = buildCreateJobRequest({ ...valid, scheduledDate: "01/03/2027", deadlineDate: "12/12/2026" }, NOW);
    if (result.ok) throw new Error("esperava erro");
    expect(result.errors.deadlineDate).toMatch(/60 dias/);
  });

  it("aplica as regras de texto da API", () => {
    const short = buildCreateJobRequest({ ...valid, title: "ab", description: "curta", state: "XX" }, NOW);
    if (short.ok) throw new Error("esperava erros");
    expect(short.errors.title).toMatch(/pelo menos/);
    expect(short.errors.description).toMatch(/pelo menos/);
    expect(short.errors.state).toMatch(/estado/);
    expect(buildCreateJobRequest({ ...valid, additionalInfo: "x".repeat(1001) }, NOW).ok).toBe(false);
  });

  it("normaliza espaços e UF no corpo enviado", () => {
    const result = buildCreateJobRequest({ ...valid, title: "  Pintura   de   sala ", city: " Cataguases ", state: " mg " }, NOW);
    if (!result.ok) throw new Error("esperava sucesso");
    expect(result.request.title).toBe("Pintura de sala");
    expect(result.request.city).toBe("Cataguases");
    expect(result.request.state).toBe("MG");
  });

  it("nunca lança, mesmo com valores estranhos", () => {
    const weird: JobFormValues = { ...valid, title: "\u0000", price: "9".repeat(50), scheduledDate: "99/99/9999", deadlineDate: "//" };
    expect(() => buildCreateJobRequest(weird, NOW)).not.toThrow();
    expect(buildCreateJobRequest(weird, NOW).ok).toBe(false);
  });
});

describe("mapServerFields e firstErrorField", () => {
  it("converte os nomes dos campos da API para os do formulário", () => {
    expect(
      mapServerFields({ proposedPriceCents: "valor", expiresAt: "prazo", title: "título", startTime: "hora", _: "extra", foo: "outro" }),
    ).toEqual({ price: "valor", deadlineDate: "prazo", title: "título", startTime: "hora", _: "extra" });
  });

  it("campos que não existem no formulário vão para a mensagem geral", () => {
    // "Sem valor e valor fixo" é corrigido no campo de valor; o resto vai para a mensagem geral
    expect(mapServerFields({ negotiable: "x", publish: "y" })).toEqual({ price: "x", _: "y" });
  });

  it("firstErrorField segue a ordem do formulário", () => {
    expect(firstErrorField({ price: "a", title: "b", deadlineDate: "c" })).toBe("title");
    expect(firstErrorField({ deadlineDate: "c", scheduledDate: "d" })).toBe("scheduledDate");
    expect(firstErrorField({ _: "geral" })).toBeNull();
    expect(firstErrorField({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

// Serviço 20/10/2026 08:00 (Brasília), prazo 19/10/2026 23:59 (Brasília) = 20/10 02:59 UTC.
const OWN: OwnJob = {
  id: "j1",
  title: "Pintura de sala",
  description: "Preciso pintar uma sala de 20 m².",
  additionalInfo: null,
  category: { id: CATEGORY, slug: "construcao-civil", name: "Construção Civil" },
  city: "Cataguases",
  state: "MG",
  scheduledDate: "2026-10-20",
  startTime: "08:00",
  proposedPriceCents: 20000,
  negotiable: true,
  status: "PUBLISHED",
  isDemo: false,
  expiresAt: "2026-10-20T02:59:00.000Z",
  publishedAt: "2026-10-12T14:00:00.000Z",
  cancelledAt: null,
  createdAt: "2026-10-12T14:00:00.000Z",
  updatedAt: "2026-10-12T14:00:00.000Z",
  interestCount: 0,
  canComplete: false,
  hiredWorkerName: null,
  canEdit: true,
  canPublish: false,
  canCancel: true,
};

describe("centsToReaisInput", () => {
  it("formata em reais como a pessoa digita e volta igual ao ler", () => {
    expect(centsToReaisInput(20000)).toBe("200,00");
    expect(centsToReaisInput(5)).toBe("0,05");
    expect(centsToReaisInput(123456)).toBe("1234,56");
    for (const cents of [5, 99, 100, 20000, 123456, 9_999_999]) {
      const text = centsToReaisInput(cents);
      const result = buildCreateJobRequest({ ...valid, price: text }, NOW);
      expect(result.ok, text).toBe(true);
      if (result.ok) expect(result.request.proposedPriceCents).toBe(cents);
    }
  });
});

describe("A negociar no formulário", () => {
  it("envia valor null e negociável verdadeiro, sem exigir o campo de valor", () => {
    for (const price of ["", "abc", "0", "200"]) {
      const result = buildCreateJobRequest({ ...valid, price, negotiable: false, toNegotiate: true }, NOW);
      expect(result.ok, price).toBe(true);
      if (result.ok) {
        expect(result.request.proposedPriceCents, price).toBeNull();
        expect(result.request.negotiable, price).toBe(true);
      }
    }
  });

  it("desligado, o valor volta a ser obrigatório e maior que zero", () => {
    const empty = buildCreateJobRequest({ ...valid, price: "", toNegotiate: false }, NOW);
    if (empty.ok) throw new Error("esperava erro");
    expect(empty.errors.price).toBe(PRICE_REQUIRED_MESSAGE);
    const zero = buildCreateJobRequest({ ...valid, price: "0,00", toNegotiate: false }, NOW);
    if (zero.ok) throw new Error("esperava erro");
    expect(zero.errors.price).toBe(PRICE_ZERO_MESSAGE);
  });

  it("nunca monta um corpo com valor zero nem com 'A negociar' e valor numérico", () => {
    for (const toNegotiate of [true, false]) {
      for (const price of ["", "0", "0,00", "150,00"]) {
        const result = buildCreateJobRequest({ ...valid, price, toNegotiate }, NOW);
        if (!result.ok) continue;
        const cents = result.request.proposedPriceCents;
        expect(cents === null || cents > 0, `${toNegotiate}/${price}`).toBe(true);
        if (toNegotiate) expect(cents).toBeNull();
      }
    }
  });

  it("edição: marcar 'A negociar' envia valor null e negociável; desmarcar exige um valor", () => {
    const fixed = { ...OWN, negotiable: false } as OwnJob;
    const toNull = buildUpdateJobRequest({ ...jobToFormValues(fixed), toNegotiate: true }, fixed, NOW);
    expect(toNull).toMatchObject({ ok: true, changes: { proposedPriceCents: null, negotiable: true } });
    // já negociável: só o valor muda
    const already = buildUpdateJobRequest({ ...jobToFormValues(OWN), toNegotiate: true }, OWN, NOW);
    expect(already).toMatchObject({ ok: true, changes: { proposedPriceCents: null } });
    const negotiableOwn = { ...OWN, proposedPriceCents: null, negotiable: true } as OwnJob;
    const unchanged = buildUpdateJobRequest(jobToFormValues(negotiableOwn), negotiableOwn, NOW);
    expect(unchanged).toMatchObject({ ok: true, changes: {} });
    const off = buildUpdateJobRequest({ ...jobToFormValues(negotiableOwn), toNegotiate: false }, negotiableOwn, NOW);
    if (off.ok) throw new Error("esperava erro");
    expect(off.errors.price).toBe(PRICE_REQUIRED_MESSAGE);
    const priced = buildUpdateJobRequest({ ...jobToFormValues(negotiableOwn), toNegotiate: false, price: "300,00" }, negotiableOwn, NOW);
    expect(priced).toMatchObject({ ok: true, changes: { proposedPriceCents: 30000 } });
  });
});

describe("máscara de valor", () => {
  it("os dígitos entram à direita, em centavos", () => {
    expect(["2", "20", "200", "2000", "20000"].map((d) => maskPriceInput(d))).toEqual(["0,02", "0,20", "2,00", "20,00", "200,00"]);
    expect(maskPriceInput("123456")).toBe("1.234,56");
    expect(maskPriceInput("99999999")).toBe("999.999,99");
  });

  it("sem dígitos, ou só zeros, é sem preço (campo vazio)", () => {
    expect(maskPriceInput("")).toBe("");
    expect(maskPriceInput("0")).toBe("");
    expect(maskPriceInput("0,00")).toBe("");
    expect(maskPriceInput("abc")).toBe("");
  });

  it("ignora o que não é dígito, inclusive ao colar, e respeita o teto da API", () => {
    expect(maskPriceInput("R$ 1.234,56 reais")).toBe("1.234,56");
    expect(maskPriceInput("-5")).toBe("0,05");
    expect(maskPriceInput("999.999,999")).toBe("999.999,99");
    expect(parsePriceInput(maskPriceInput("9".repeat(30)))).toBe(JOB_PRICE_MAX_CENTS);
  });

  it("é idempotente (reaplicar a máscara não muda o texto)", () => {
    for (const text of ["", "0,02", "2,00", "1.234,56", "999.999,99"]) expect(maskPriceInput(text)).toBe(text);
  });

  it("converte o texto da máscara em centavos e volta (edição), sem aceitar zero como preço", () => {
    for (const cents of [1, 5, 99, 100, 20000, 123456, 99_999_999]) {
      const text = centsToPriceInput(cents);
      expect(parsePriceInput(text), text).toBe(cents);
      expect(maskPriceInput(text)).toBe(text);
    }
    expect(centsToPriceInput(0)).toBe("");
    expect(centsToPriceInput(-3)).toBe("");
  });

  it("nunca produz um valor que a API recuse", () => {
    for (const raw of ["1", "99999999", "999999999999", "5".repeat(40)]) {
      const cents = parsePriceInput(maskPriceInput(raw));
      expect(cents).not.toBeNull();
      expect(cents!).toBeGreaterThan(0);
      expect(cents!).toBeLessThanOrEqual(JOB_PRICE_MAX_CENTS);
    }
  });

  it("o formulário continua pedindo o valor quando o campo está vazio", () => {
    const result = buildCreateJobRequest({ ...valid, price: maskPriceInput("") }, NOW);
    if (result.ok) throw new Error("esperava erro");
    expect(result.errors.price).toBe(PRICE_REQUIRED_MESSAGE);
  });
});

describe("jobToFormValues", () => {
  it("preenche o formulário com os dados atuais, no horário de Brasília", () => {
    expect(jobToFormValues(OWN)).toEqual({
      title: "Pintura de sala",
      description: "Preciso pintar uma sala de 20 m².",
      additionalInfo: "",
      categoryId: CATEGORY,
      city: "Cataguases",
      state: "MG",
      scheduledDate: "20/10/2026",
      startTime: "08:00",
      price: "200,00",
      negotiable: true,
      toNegotiate: false,
      deadlineDate: "19/10/2026",
    });
  });

  it("oportunidade sem valor abre com 'A negociar' ligado e o campo de valor vazio", () => {
    const values = jobToFormValues({ ...OWN, proposedPriceCents: null, negotiable: true });
    expect(values).toMatchObject({ price: "", toNegotiate: true, negotiable: true });
  });

  it("dado antigo com valor zero não vira 'A negociar' sozinho: o campo fica vazio e pede um valor", () => {
    const values = jobToFormValues({ ...OWN, proposedPriceCents: 0 });
    expect(values).toMatchObject({ price: "", toNegotiate: false });
    const built = buildCreateJobRequest(values, NOW);
    if (built.ok) throw new Error("esperava erro");
    expect(built.errors.price).toBe(PRICE_REQUIRED_MESSAGE);
  });

  it("informações adicionais existentes aparecem no campo", () => {
    expect(jobToFormValues({ ...OWN, additionalInfo: "Levar rolo." }).additionalInfo).toBe("Levar rolo.");
  });
});

describe("buildUpdateJobRequest", () => {
  it("sem mexer em nada, o formulário aberto não gera mudanças (nem reenvia o prazo)", () => {
    const result = buildUpdateJobRequest(jobToFormValues(OWN), OWN, NOW);
    expect(result).toEqual({ ok: true, changes: {}, changedFields: [] });
  });

  it("envia só o que mudou: título e valor", () => {
    const values = { ...jobToFormValues(OWN), title: "  Pintura   de quarto ", price: "250" };
    const result = buildUpdateJobRequest(values, OWN, NOW);
    expect(result).toEqual({
      ok: true,
      changes: { title: "Pintura de quarto", proposedPriceCents: 25000 },
      changedFields: ["title", "proposedPriceCents"],
    });
  });

  it("informações adicionais: preencher e limpar", () => {
    const filled = buildUpdateJobRequest({ ...jobToFormValues(OWN), additionalInfo: " Levar rolo " }, OWN, NOW);
    expect(filled).toMatchObject({ ok: true, changes: { additionalInfo: "Levar rolo" } });
    const withInfo = { ...OWN, additionalInfo: "Levar rolo" };
    const cleared = buildUpdateJobRequest({ ...jobToFormValues(withInfo), additionalInfo: "  " }, withInfo, NOW);
    expect(cleared).toMatchObject({ ok: true, changes: { additionalInfo: null } });
  });

  it("negociável desligado entra nas mudanças", () => {
    const result = buildUpdateJobRequest({ ...jobToFormValues(OWN), negotiable: false }, OWN, NOW);
    expect(result).toMatchObject({ ok: true, changes: { negotiable: false } });
  });

  it("mudar o prazo envia o prazo, com 23:59 de Brasília", () => {
    const result = buildUpdateJobRequest({ ...jobToFormValues(OWN), deadlineDate: "18/10/2026" }, OWN, NOW);
    expect(result).toMatchObject({ ok: true, changes: { expiresAt: "2026-10-19T02:59:00.000Z" } });
  });

  it("mudar só a data do serviço envia a data e não reenvia um prazo que não mudou", () => {
    const result = buildUpdateJobRequest({ ...jobToFormValues(OWN), scheduledDate: "25/10/2026" }, OWN, NOW);
    expect(result).toMatchObject({ ok: true, changes: { scheduledDate: "2026-10-25" } });
    if (result.ok) expect(result.changes).not.toHaveProperty("expiresAt");
  });

  it("rascunho antigo com data e prazo vencidos: recusa, e corrigir data e prazo libera", () => {
    const stale: OwnJob = {
      ...OWN,
      status: "DRAFT",
      scheduledDate: "2026-09-01",
      expiresAt: "2026-08-31T02:59:00.000Z",
      canPublish: true,
    };
    const blocked = buildUpdateJobRequest(jobToFormValues(stale), stale, NOW);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.errors.scheduledDate).toBeDefined();
      expect(blocked.errors.deadlineDate).toBeDefined();
    }
    const fixed = buildUpdateJobRequest(
      { ...jobToFormValues(stale), scheduledDate: "20/10/2026", deadlineDate: "19/10/2026" },
      stale,
      NOW,
    );
    expect(fixed).toMatchObject({
      ok: true,
      changes: { scheduledDate: "2026-10-20", expiresAt: "2026-10-20T02:59:00.000Z" },
    });
  });

  it("dados inválidos: devolve as mensagens por campo e nada para enviar", () => {
    const result = buildUpdateJobRequest({ ...jobToFormValues(OWN), title: "x", price: "abc", state: "ZZ" }, OWN, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["price", "state", "title"]);
  });
});
