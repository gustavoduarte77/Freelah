import { describe, expect, it } from "vitest";
import { maskDateInput, maskPriceInput, maskTimeInput } from "./job-form";
import { applyMask } from "./masked-input";

const date = (raw: string, caret: number) => applyMask(raw, caret, maskDateInput);
const time = (raw: string, caret: number) => applyMask(raw, caret, maskTimeInput);
const price = (raw: string, caret: number) => applyMask(raw, caret, maskPriceInput, { anchor: "end" });

describe("cursor em campos de data", () => {
  it("digitar no fim mantém o cursor no fim, inclusive depois do separador", () => {
    expect(date("2", 1)).toEqual({ text: "2", caret: 1 });
    expect(date("201", 3)).toEqual({ text: "20/1", caret: 4 });
    expect(date("2010", 4)).toEqual({ text: "20/10", caret: 5 });
    expect(date("20/10/202", 9)).toEqual({ text: "20/10/202", caret: 9 });
  });

  it("inserir um dígito no meio mantém o cursor depois do dígito inserido", () => {
    // "20/10/2026" com um 5 digitado depois de "20/1"
    expect(date("20/150/2026", 5)).toEqual({ text: "20/15/0202", caret: 5 });
  });

  it("inserir no começo", () => {
    expect(date("520/10/2026", 1)).toEqual({ text: "52/01/0202", caret: 1 });
  });

  it("apagar um dígito no meio mantém o cursor onde estava", () => {
    // "20/10/2026" sem o "1": o cursor estava logo depois da barra e continua depois dela
    expect(date("20/0/2026", 3)).toEqual({ text: "20/02/026", caret: 3 });
    // a próxima tecla cai no lugar certo
    expect(date("205/02/026", 3)).toEqual({ text: "20/50/2026", caret: 4 });
  });

  it("substituir uma seleção", () => {
    // "10" selecionado e trocado por "3"
    expect(date("20/3/2026", 4)).toEqual({ text: "20/32/026", caret: 4 });
  });

  it("apagar um separador apaga o dígito vizinho em vez de prender o cursor", () => {
    // Backspace logo depois de "20/": a máscara recolocaria a barra, então apaga o "0"
    expect(applyMask("2010/2026", 2, maskDateInput, { previous: "20/10/2026", deleting: "backward" })).toEqual({
      text: "21/02/026",
      caret: 1,
    });
    // Delete logo antes da barra apaga o dígito seguinte
    expect(applyMask("2010/2026", 2, maskDateInput, { previous: "20/10/2026", deleting: "forward" })).toEqual({
      text: "20/02/026",
      caret: 2,
    });
    // Sem indicar que foi uma exclusão (colar, por exemplo), nada é apagado além do que a pessoa fez
    expect(applyMask("20102026", 8, maskDateInput, { previous: "20/10/2026" })).toEqual({ text: "20/10/2026", caret: 10 });
    // Exclusão de um dígito segue o caminho normal
    expect(applyMask("20/0/2026", 3, maskDateInput, { previous: "20/10/2026", deleting: "backward" })).toEqual({
      text: "20/02/026",
      caret: 3,
    });
  });

  it("colar e limpar", () => {
    expect(date("25122026", 8)).toEqual({ text: "25/12/2026", caret: 10 });
    expect(date("25/12/2026abc", 13)).toEqual({ text: "25/12/2026", caret: 10 });
    expect(date("", 0)).toEqual({ text: "", caret: 0 });
  });

  it("não quebra com cursor fora do intervalo", () => {
    expect(date("20", 99).caret).toBe(2);
    expect(date("20", -3).caret).toBe(0);
    expect(date("20", Number.NaN).caret).toBe(0);
  });
});

describe("cursor em campos de horário", () => {
  it("apagar e inserir no meio", () => {
    expect(time("0:30", 1)).toEqual({ text: "03:0", caret: 1 });
    // "08:30" sem o "3": o cursor estava depois dos dois pontos
    expect(time("08:0", 3)).toEqual({ text: "08:0", caret: 3 });
    // Backspace sobre os dois pontos apaga o "8"
    expect(applyMask("0830", 2, maskTimeInput, { previous: "08:30", deleting: "backward" })).toEqual({ text: "03:0", caret: 1 });
    expect(time("0850", 3)).toEqual({ text: "08:50", caret: 4 });
    expect(time("0830", 4)).toEqual({ text: "08:30", caret: 5 });
  });
});

describe("cursor em campos de valor (da direita para a esquerda)", () => {
  it("cada dígito entra à direita e o cursor fica no fim", () => {
    expect(price("2", 1)).toEqual({ text: "0,02", caret: 4 });
    expect(price("0,020", 5)).toEqual({ text: "0,20", caret: 4 });
    expect(price("0,202", 5)).toEqual({ text: "2,02", caret: 4 });
    expect(price("20000", 5)).toEqual({ text: "200,00", caret: 6 });
  });

  it("inserir e apagar no meio mantém os dígitos à direita do cursor", () => {
    expect(price("192,34", 2)).toEqual({ text: "192,34", caret: 2 });
    expect(price("1.34,56", 2)).toEqual({ text: "134,56", caret: 1 });
  });

  it("apagar o separador decimal apaga o dígito à esquerda dele", () => {
    // "1.239,45", Backspace logo depois da vírgula: apaga o 9
    expect(applyMask("1.23945", 5, maskPriceInput, { anchor: "end", previous: "1.239,45", deleting: "backward" })).toEqual({
      text: "123,45",
      caret: 4,
    });
    // Backspace logo depois do ponto de milhar apaga o 1
    expect(applyMask("1239,45", 1, maskPriceInput, { anchor: "end", previous: "1.239,45", deleting: "backward" })).toEqual({
      text: "239,45",
      caret: 0,
    });
  });

  it("apagar tudo volta a sem preço, sem cursor perdido", () => {
    expect(price("0,0", 3)).toEqual({ text: "", caret: 0 });
    expect(price("", 0)).toEqual({ text: "", caret: 0 });
  });

  it("colar ignora tudo que não é dígito e respeita o teto de 8 dígitos", () => {
    expect(price("R$ 1.234,56abc", 14)).toEqual({ text: "1.234,56", caret: 8 });
    expect(price("999.999,999", 11)).toEqual({ text: "999.999,99", caret: 10 });
  });
});
