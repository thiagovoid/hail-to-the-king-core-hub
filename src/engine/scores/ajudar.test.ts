import { describe, expect, it } from "vitest";

import { notaDeAjudar, TETO_DE_APROVEITAMENTO, TETO_PADRAO } from "./ajudar";

const magia = (spellId: number, efficiency: number) => ({
  spellId,
  name: `magia ${spellId}`,
  casts: 1,
  efficiency,
  categoria: "controlar" as const,
});

/** Kick (Pummel, teto 1,2) e Power Infusion (teto 95,3). */
const PUMMEL = 6552;
const POWER_INFUSION = 10060;

describe("notaDeAjudar", () => {
  it("é null sem utilidade medida — ausente, não zero", () => {
    expect(notaDeAjudar(undefined)).toBeNull();
    expect(notaDeAjudar([])).toBeNull();
  });

  /**
   * O ponto inteiro da dimensão. Na régua crua, 1,2% e 95,3% seriam notas
   * abissalmente diferentes; normalizados pelo teto de cada magia, os dois
   * tiraram 100 — porque os dois tiraram da ferramenta tudo que ela dá.
   */
  it("não pune quem tem cooldown curto", () => {
    const kick = notaDeAjudar([magia(PUMMEL, TETO_DE_APROVEITAMENTO.get(PUMMEL)!)]);
    const lust = notaDeAjudar([magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)!)]);

    expect(kick).toBe(100);
    expect(lust).toBe(100);
  });

  it("dá metade da nota a metade do teto", () => {
    expect(notaDeAjudar([magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)! / 2)])).toBe(50);
  });

  it("nunca passa de 100, mesmo batendo o teto", () => {
    expect(notaDeAjudar([magia(PUMMEL, 999)])).toBe(100);
  });

  it("faz média das magias que a pessoa tem", () => {
    const nota = notaDeAjudar([
      magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)!),
      magia(PUMMEL, 0),
    ]);

    expect(nota).toBe(50);
  });

  /** Magia nova entra numa régua plausível em vez de 100 de graça ou zero. */
  it("usa o teto padrão pra magia sem histórico", () => {
    expect(notaDeAjudar([magia(999_999, TETO_PADRAO)])).toBe(100);
    expect(notaDeAjudar([magia(999_999, TETO_PADRAO / 2)])).toBe(50);
  });

  /**
   * Os tetos saem do melhor já visto na temporada — se um deles fosse zero,
   * a divisão viraria Infinity na nota de alguém.
   */
  it("tem teto positivo em todas as magias da tabela", () => {
    for (const [spellId, teto] of TETO_DE_APROVEITAMENTO) {
      expect(teto, `magia ${spellId}`).toBeGreaterThan(0);
    }
  });
});
