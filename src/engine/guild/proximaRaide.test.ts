import { describe, expect, it } from "vitest";

import { diaDaSemanaPorExtenso, hojeNoCore, proximaNoiteDeRaide } from "./proximaRaide";

/** Meio-dia em Brasília, longe de qualquer virada de dia. */
const meioDia = (data: string) => new Date(`${data}T15:00:00.000Z`);

describe("proximaNoiteDeRaide", () => {
  it("segunda aponta pra terça", () => {
    // 2026-10-19 é segunda.
    expect(proximaNoiteDeRaide(meioDia("2026-10-19"))).toBe("2026-10-20");
  });

  it("terça aponta pra ela mesma — a raide ainda não começou", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-20"))).toBe("2026-10-20");
  });

  it("quarta aponta pra quinta", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-21"))).toBe("2026-10-22");
  });

  it("quinta aponta pra ela mesma", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-22"))).toBe("2026-10-22");
  });

  it("sexta atravessa o fim de semana e cai na terça", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-23"))).toBe("2026-10-27");
  });

  it("domingo aponta pra terça", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-25"))).toBe("2026-10-27");
  });

  it("a exceção escrita à mão vence o cálculo", () => {
    // Quarta, 21/10: acontece, e é assim que se declara.
    expect(proximaNoiteDeRaide(meioDia("2026-10-19"), "2026-10-21")).toBe("2026-10-21");
  });

  it("exceção no passado é ignorada — é o campo esquecido", () => {
    // O caso real: o cabeçalho anunciou 01/09 até meados de outubro.
    expect(proximaNoiteDeRaide(meioDia("2026-10-15"), "2026-09-01")).toBe("2026-10-15");
  });

  it("exceção de hoje ainda vale", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-21"), "2026-10-21")).toBe("2026-10-21");
  });

  it("lixo no campo da exceção não derruba a conta", () => {
    expect(proximaNoiteDeRaide(meioDia("2026-10-19"), "")).toBe("2026-10-20");
    expect(proximaNoiteDeRaide(meioDia("2026-10-19"), "amanhã")).toBe("2026-10-20");
    expect(proximaNoiteDeRaide(meioDia("2026-10-19"), null)).toBe("2026-10-20");
  });
});

describe("hojeNoCore", () => {
  it("usa o fuso de Brasília, não o do servidor", () => {
    // 02:24 UTC de quinta ainda é quarta às 23:24 em Brasília — o mesmo
    // deslocamento que fazia as datas de kill saírem um dia à frente.
    expect(hojeNoCore(new Date("2026-10-22T02:24:00.000Z"))).toBe("2026-10-21");
  });

  it("e por isso a próxima raide, às 23h de quarta, ainda é a quinta", () => {
    expect(proximaNoiteDeRaide(new Date("2026-10-22T02:24:00.000Z"))).toBe("2026-10-22");
  });
});

describe("diaDaSemanaPorExtenso", () => {
  it("nomeia o dia", () => {
    expect(diaDaSemanaPorExtenso("2026-10-20")).toBe("terça");
    expect(diaDaSemanaPorExtenso("2026-10-21")).toBe("quarta");
    expect(diaDaSemanaPorExtenso("2026-10-22")).toBe("quinta");
  });
});
