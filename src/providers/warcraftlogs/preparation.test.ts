import { describe, expect, it } from "vitest";
import {
  averagePreparation,
  calculatePreparation,
  type PreparationChecklist,
  type WclCombatantInfo,
} from "./preparation";

// Slots conferidos no log real: 0 elmo, 1 colar, 2 ombros, 10/11 anéis, 15 arma.
const CHECKLIST: PreparationChecklist = {
  enchantedSlots: [0, 2, 15],
  gemSlots: [1, 10, 11],
  consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
};

const VAZIO: PreparationChecklist = {
  enchantedSlots: [],
  gemSlots: [],
  consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
};

/**
 * Gear como a WCL devolve de verdade: array **esparso**, indexado por posição
 * mas com o slot real no campo `slot`. Foi confundir os dois que gerou as
 * notas erradas.
 */
const gear = (itens: Array<{ slot: number; name: string; enchant?: boolean; gemas?: number }>): WclCombatantInfo => ({
  gear: itens.map((item) => ({
    id: 271465 + item.slot,
    slot: item.slot,
    name: item.name,
    ...(item.enchant ? { permanentEnchant: 8017 } : {}),
    ...(item.gemas ? { gems: Array.from({ length: item.gemas }, () => ({ id: 240983 })) } : {}),
  })),
});

const checkDe = (r: ReturnType<typeof calculatePreparation>, k: string) => r.checks.find((c) => c.key === k);

const COMPLETO = gear([
  { slot: 0, name: "Elmo", enchant: true },
  { slot: 2, name: "Ombreiras", enchant: true },
  { slot: 15, name: "Espada", enchant: true },
  { slot: 1, name: "Colar", gemas: 1 },
  { slot: 10, name: "Anel A", gemas: 1 },
  { slot: 11, name: "Anel B", gemas: 1 },
]);

describe("calculatePreparation", () => {
  it("usa o campo slot, não a posição no array — o array é esparso", () => {
    // A arma vem por último no array, mas com slot 15. Indexar por posição
    // apontaria pra peça errada, que foi o bug original.
    const resultado = calculatePreparation(COMPLETO, CHECKLIST);

    expect(checkDe(resultado, "enchants")?.ratio).toBe(1);
    expect(resultado.score).toBe(100);
  });

  it("nomeia em português o slot que falta, não o item (que vem no idioma do log)", () => {
    const semArma = gear([
      { slot: 0, name: "Elmo", enchant: true },
      { slot: 2, name: "Ombreiras", enchant: true },
      { slot: 15, name: "Espada" },
      { slot: 1, name: "Colar", gemas: 1 },
      { slot: 10, name: "Anel A", gemas: 1 },
      { slot: 11, name: "Anel B" },
    ]);

    const resultado = calculatePreparation(semArma, CHECKLIST);

    expect(checkDe(resultado, "enchants")?.missing).toEqual(["Arma"]);
    expect(checkDe(resultado, "gems")?.missing).toEqual(["Anel"]);
  });

  it("dá crédito proporcional em vez de zerar por uma peça", () => {
    const resultado = calculatePreparation(
      gear([
        { slot: 0, name: "Elmo", enchant: true },
        { slot: 2, name: "Ombreiras", enchant: true },
        { slot: 15, name: "Espada" },
        { slot: 1, name: "Colar", gemas: 1 },
        { slot: 10, name: "Anel A", gemas: 1 },
        { slot: 11, name: "Anel B", gemas: 1 },
      ]),
      CHECKLIST
    );

    // 2 de 3 encantos + gemas completas
    expect(checkDe(resultado, "enchants")?.ratio).toBeCloseTo(2 / 3);
    expect(resultado.score).toBe(83);
  });

  it("qualquer encanto e qualquer gema contam — não precisa ser o BIS", () => {
    const foraDoBis: WclCombatantInfo = {
      gear: [
        { id: 1, slot: 0, name: "Elmo", permanentEnchant: 99999 },
        { id: 2, slot: 2, name: "Ombreiras", permanentEnchant: 99998 },
        { id: 3, slot: 15, name: "Espada", permanentEnchant: 99997 },
        { id: 4, slot: 1, name: "Colar", gems: [{ id: 111 }] },
        { id: 5, slot: 10, name: "Anel A", gems: [{ id: 222 }] },
        { id: 6, slot: 11, name: "Anel B", gems: [{ id: 333 }] },
      ],
    };

    expect(calculatePreparation(foraDoBis, CHECKLIST).score).toBe(100);
  });

  it("slot vazio não conta como falta — não dá pra encantar o que não existe", () => {
    const semSecundaria = calculatePreparation(COMPLETO, { ...CHECKLIST, enchantedSlots: [0, 2, 15, 16] });

    expect(checkDe(semSecundaria, "enchants")?.ratio).toBe(1);
    expect(checkDe(semSecundaria, "enchants")?.detail).toBe("3 de 3 peças encantadas");
  });

  it("checagem não configurada fica de fora da conta, não conta como falha", () => {
    const soGemas = calculatePreparation(COMPLETO, { ...VAZIO, gemSlots: [1, 10, 11] });

    expect(soGemas.score).toBe(100);
    expect(checkDe(soGemas, "enchants")?.status).toBe("unconfigured");
  });

  it("devolve score undefined quando nada é avaliável — nota ausente, não zero", () => {
    expect(calculatePreparation(COMPLETO, VAZIO).score).toBeUndefined();
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
