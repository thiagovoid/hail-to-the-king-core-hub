import { describe, expect, it } from "vitest";
import {
  averagePreparation,
  calculatePreparation,
  type PreparationChecklist,
  type WclCombatantInfo,
} from "./preparation";

const CHECKLIST: PreparationChecklist = {
  recommendedEnchantCount: 7,
  expectedGems: 3,
  consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
};

const VAZIO: PreparationChecklist = {
  recommendedEnchantCount: 0,
  expectedGems: 0,
  consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
};

/** Gear no formato que a WCL devolve de verdade (conferido no log de 15/09). */
function gear(encantados: number, gemas: number): WclCombatantInfo {
  const itens = [];
  for (let i = 0; i < 7; i += 1) {
    itens.push({ id: 271465 + i, slot: i, ...(i < encantados ? { permanentEnchant: 8017 } : {}) });
  }
  itens[0] = { ...itens[0], gems: Array.from({ length: gemas }, () => ({ id: 240983 })) };
  return { gear: itens };
}

const ratioDe = (resultado: ReturnType<typeof calculatePreparation>, chave: string) =>
  resultado.checks.find((check) => check.key === chave)?.ratio;

describe("calculatePreparation — presença, não BIS", () => {
  it("dá crédito proporcional em vez de zerar por um encanto faltando", () => {
    const resultado = calculatePreparation(gear(6, 3), CHECKLIST);

    expect(ratioDe(resultado, "enchants")).toBeCloseTo(6 / 7);
    // 6/7 dos encantos + gemas completas
    expect(resultado.score).toBe(93);
  });

  it("não exige a gema recomendada — qualquer gema conta", () => {
    const outraGema: WclCombatantInfo = {
      gear: [{ id: 1, slot: 0, permanentEnchant: 1, gems: [{ id: 999 }, { id: 888 }, { id: 777 }] }],
    };

    const resultado = calculatePreparation(outraGema, CHECKLIST);

    expect(ratioDe(resultado, "gems")).toBe(1);
  });

  it("não exige o encanto recomendado — qualquer encanto conta", () => {
    const resultado = calculatePreparation(gear(7, 3), CHECKLIST);

    expect(ratioDe(resultado, "enchants")).toBe(1);
    expect(resultado.score).toBe(100);
  });

  it("não passa de 100 quem tem mais gemas que o mínimo de joia", () => {
    const resultado = calculatePreparation(gear(7, 8), CHECKLIST);

    expect(ratioDe(resultado, "gems")).toBe(1);
    expect(resultado.score).toBe(100);
  });

  it("item de slot vazio não conta como encanto faltando", () => {
    const comVazio: WclCombatantInfo = {
      gear: [
        { id: 0, slot: 3 },
        { id: 1, slot: 0, permanentEnchant: 1 },
      ],
    };

    const resultado = calculatePreparation(comVazio, { ...CHECKLIST, recommendedEnchantCount: 1 });

    expect(ratioDe(resultado, "enchants")).toBe(1);
  });

  it("quem não encantou nada fica com zero nessa checagem, mas não na nota toda", () => {
    const resultado = calculatePreparation(gear(0, 3), CHECKLIST);

    expect(ratioDe(resultado, "enchants")).toBe(0);
    expect(resultado.score).toBe(50);
  });

  it("checagem não configurada fica de fora da conta, não conta como falha", () => {
    const soGemas: PreparationChecklist = { ...VAZIO, expectedGems: 3 };

    const resultado = calculatePreparation(gear(0, 3), soGemas);

    expect(resultado.score).toBe(100);
    expect(resultado.checks.find((c) => c.key === "enchants")?.status).toBe("unconfigured");
  });

  it("devolve score undefined quando nada é avaliável — nota ausente, não zero", () => {
    expect(calculatePreparation(gear(7, 3), VAZIO).score).toBeUndefined();
    expect(calculatePreparation(undefined, CHECKLIST).score).toBeUndefined();
  });
});

describe("averagePreparation", () => {
  it("tira média só dos fights que tinham dado", () => {
    expect(averagePreparation([100, undefined, 50])).toBe(75);
  });

  it("devolve undefined quando nenhum fight tinha dado", () => {
    expect(averagePreparation([undefined, undefined])).toBeUndefined();
    expect(averagePreparation([])).toBeUndefined();
  });
});
