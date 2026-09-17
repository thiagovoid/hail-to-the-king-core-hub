import { describe, expect, it } from "vitest";
import {
  averagePreparation,
  calculatePreparation,
  type PreparationChecklist,
  type WclCombatantInfo,
} from "./preparation";

const FULL_CHECKLIST: PreparationChecklist = {
  enchantedSlots: [4, 6, 14],
  recommendedGemIds: [9001, 9002, 9003],
  consumables: { flask: [1001], food: [1002], rune: [1003], oil: [1004], potion: [1005] },
};

const EMPTY_CHECKLIST: PreparationChecklist = {
  enchantedSlots: [],
  recommendedGemIds: [],
  consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
};

function combatant(overrides: Partial<WclCombatantInfo> = {}): WclCombatantInfo {
  return {
    gear: [
      { id: 1 }, // 0
      { id: 2 }, // 1
      { id: 3 }, // 2
      { id: 4 }, // 3
      { id: 5, permanentEnchant: 7001, gems: [{ id: 9001 }] }, // 4 peito
      { id: 6 }, // 5
      { id: 7, permanentEnchant: 7002, gems: [{ id: 9002 }] }, // 6 pernas
      { id: 8 }, // 7
      { id: 9 }, // 8
      { id: 10 }, // 9
      { id: 11 }, // 10
      { id: 12 }, // 11
      { id: 13 }, // 12
      { id: 14 }, // 13
      { id: 15, permanentEnchant: 7003, gems: [{ id: 9003 }] }, // 14 costas
    ],
    auras: [{ ability: 1001 }, { ability: 1002 }, { ability: 1003 }, { ability: 1004 }, { ability: 1005 }],
    ...overrides,
  };
}

const statusOf = (result: ReturnType<typeof calculatePreparation>, key: string) =>
  result.checks.find((check) => check.key === key)?.status;

describe("calculatePreparation", () => {
  it("dá 100 quando tudo do checklist está cumprido", () => {
    const result = calculatePreparation(combatant(), FULL_CHECKLIST);

    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.status === "ok")).toBe(true);
  });

  it("conta a proporção de checagens cumpridas", () => {
    // sem flask e sem poção → 5 de 7
    const result = calculatePreparation(
      combatant({ auras: [{ ability: 1002 }, { ability: 1003 }, { ability: 1004 }] }),
      FULL_CHECKLIST
    );

    expect(statusOf(result, "flask")).toBe("missing");
    expect(statusOf(result, "potion")).toBe("missing");
    expect(result.score).toBe(Math.round((5 / 7) * 100));
  });

  it("reprova gema fora da recomendação e reporta quantas batem", () => {
    const result = calculatePreparation(
      combatant({
        gear: [
          { id: 5, permanentEnchant: 7001, gems: [{ id: 9001 }] },
          { id: 7, permanentEnchant: 7002, gems: [{ id: 8888 }] }, // gema errada
        ],
      }),
      FULL_CHECKLIST
    );
    const gems = result.checks.find((check) => check.key === "gems");

    expect(gems?.status).toBe("missing");
    expect(gems?.detail).toBe("1 de 2 gemas são as recomendadas");
  });

  it("reprova quem está sem gema nenhuma", () => {
    const result = calculatePreparation(combatant({ gear: [{ id: 5, permanentEnchant: 7001 }] }), FULL_CHECKLIST);
    const gems = result.checks.find((check) => check.key === "gems");

    expect(gems?.status).toBe("missing");
    expect(gems?.detail).toBe("nenhuma gema equipada");
  });

  it("não conta slot vazio como encanto faltando (off-hand de arma de duas mãos)", () => {
    const gear = combatant().gear!.slice();
    gear[14] = { id: 0 }; // costas ausente do log

    const result = calculatePreparation(combatant({ gear }), FULL_CHECKLIST);

    expect(statusOf(result, "enchants")).toBe("ok");
  });

  it("checagem não configurada fica de fora da conta, não conta como falha", () => {
    const checklist: PreparationChecklist = {
      ...EMPTY_CHECKLIST,
      consumables: { ...EMPTY_CHECKLIST.consumables, flask: [1001] },
    };

    const result = calculatePreparation(combatant(), checklist);

    // só flask é avaliável, e está presente → 100
    expect(result.score).toBe(100);
    expect(statusOf(result, "gems")).toBe("unconfigured");
    expect(statusOf(result, "enchants")).toBe("unconfigured");
  });

  it("devolve score undefined quando nada é avaliável — nota ausente, não zero", () => {
    expect(calculatePreparation(combatant(), EMPTY_CHECKLIST).score).toBeUndefined();
    expect(calculatePreparation(undefined, FULL_CHECKLIST).score).toBeUndefined();
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
