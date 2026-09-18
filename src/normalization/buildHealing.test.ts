import { describe, expect, it } from "vitest";

import {
  buildHealing,
  calculateCobertura,
  calculateDesperdicio,
  calculateQuinhao,
} from "./buildHealing";

describe("calculateDesperdicio", () => {
  it("mede a cura que caiu em quem já estava cheio", () => {
    expect(calculateDesperdicio({ effective: 700, overheal: 300 })).toBe(30);
  });

  it("devolve undefined pra quem não lançou cura nenhuma", () => {
    expect(calculateDesperdicio({ effective: 0, overheal: 0 })).toBeUndefined();
  });
});

describe("calculateCobertura", () => {
  // A conta se auto-equilibra: se o raide apanha mais, sobem numerador e
  // denominador juntos, e o healer não é premiado por um time que erra.
  it("mede a fatia do dano do raide que o healer cobriu", () => {
    expect(calculateCobertura(250, 1000)).toBe(25);
  });

  it("devolve undefined quando o raide não tomou dano", () => {
    expect(calculateCobertura(250, 0)).toBeUndefined();
  });
});

describe("calculateQuinhao", () => {
  // Números reais do log de 15/09: cobertura de 25,3 / 21,1 / 18,5.
  const noite = [25.3, 21.1, 18.5];

  it("diz quanto o healer puxou do que caberia a ele", () => {
    expect(calculateQuinhao(25.3, noite)).toBe(116.9);
    expect(calculateQuinhao(18.5, noite)).toBe(85.5);
  });

  // Com dois healers cada um precisa cobrir muito mais; uma meta fixa de
  // cobertura quebraria exatamente aqui.
  it("se ajusta ao número de healers da noite", () => {
    expect(calculateQuinhao(32, [32, 32])).toBe(100);
    expect(calculateQuinhao(32, [32, 32, 32, 32])).toBe(100);
  });

  it("devolve undefined sem healer nenhum", () => {
    expect(calculateQuinhao(25, [])).toBeUndefined();
  });
});

describe("buildHealing", () => {
  const noite = [25, 25];

  it("junta quinhão e aproveitamento numa nota", () => {
    // Quinhão 100, desperdício 30 => aproveitamento 70 => nota 85.
    const r = buildHealing({ effective: 250, overheal: 107.14 }, 1000, noite);
    expect(r?.healing.share).toBe(100);
    expect(r?.healing.overheal).toBe(30);
    expect(r?.healing.score).toBe(85);
  });

  // Cobrir o dobro do seu quinhão não é o dobro de mérito: em geral quer
  // dizer que o outro healer faltou, não que este foi duas vezes melhor.
  it("limita o quinhão em 100 na nota", () => {
    const r = buildHealing({ effective: 500, overheal: 0 }, 1000, [50, 10]);
    expect(r?.healing.share).toBeGreaterThan(100);
    expect(r?.healing.score).toBe(100);
  });

  it("guarda a cobertura crua, que é o número explicável", () => {
    const r = buildHealing({ effective: 250, overheal: 100 }, 1000, noite);
    expect(r?.healing.coverage).toBe(25);
  });

  it("não produz nota pra quem não curou", () => {
    expect(buildHealing({ effective: 0, overheal: 0 }, 1000, noite)).toBeUndefined();
  });
});
