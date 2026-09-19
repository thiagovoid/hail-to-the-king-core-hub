import { describe, expect, it } from "vitest";
import {
  averagePreparation,
  calculatePreparation,
  type PreparationChecklist,
  temArmaNaSecundaria,
  type WclCombatantInfo,
  type WclGearItem,
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

describe("temArmaNaSecundaria", () => {
  const comOffHand = (icon?: string): WclGearItem[] => [
    { id: 100, slot: 15, icon: "inv_sword_1h_a.jpg", permanentEnchant: 1 },
    ...(icon ? [{ id: 200, slot: 16, icon }] : []),
  ];

  it("reconhece arma de verdade na mão secundária", () => {
    expect(temArmaNaSecundaria(comOffHand("inv_glaive_1h_ulatek_d_01.jpg"))).toBe(true);
    expect(temArmaNaSecundaria(comOffHand("inv_axe_1h_dungeonharronir_c_01.jpg"))).toBe(true);
  });

  // Seis pessoas de escudo e uma de off-hand no log de 15/09. Cobrar encanto
  // delas seria inventar um erro que não existe.
  it("não conta escudo nem item de off-hand", () => {
    expect(temArmaNaSecundaria(comOffHand("inv_shield_1h_questbloodelf_b_01.jpg"))).toBe(false);
    expect(temArmaNaSecundaria(comOffHand("inv_offhand_1h_dungeonharronir_c_01.jpg"))).toBe(false);
  });

  it("não conta arma de duas mãos, que não tem secundária", () => {
    expect(temArmaNaSecundaria(comOffHand())).toBe(false);
  });

  it("não afirma nada quando a WCL não manda o icon", () => {
    expect(temArmaNaSecundaria([{ id: 200, slot: 16 }])).toBe(false);
  });
});

describe("preparação peça a peça", () => {
  const gear = (itens: WclGearItem[]): WclCombatantInfo => ({ gear: itens, auras: [] });

  it("diz o slot e o tipo de cada peça avaliada", () => {
    const resultado = calculatePreparation(
      gear([
        { id: 1, slot: 0, permanentEnchant: 5 },
        { id: 2, slot: 10, permanentEnchant: 0, gems: [] },
        { id: 3, slot: 11, permanentEnchant: 7, gems: [{ id: 9 }] },
      ]),
      { enchantedSlots: [0, 10, 11], gemSlots: [10, 11], consumables: CHECKLIST.consumables }
    );

    // Os dois anéis são "Anel" na tela, mas aqui vêm separados pelo slot.
    expect(resultado.slots).toContainEqual({ slot: 10, label: "Anel", tipo: "encanto", ok: false });
    expect(resultado.slots).toContainEqual({ slot: 11, label: "Anel", tipo: "encanto", ok: true });
    expect(resultado.slots).toContainEqual({ slot: 10, label: "Anel", tipo: "gema", ok: false });
    expect(resultado.slots).toContainEqual({ slot: 11, label: "Anel", tipo: "gema", ok: true });
  });

  it("cobra encanto da segunda arma só quando ela é arma", () => {
    const duasArmas = calculatePreparation(
      gear([
        { id: 1, slot: 15, icon: "inv_sword_1h_a.jpg", permanentEnchant: 5 },
        { id: 2, slot: 16, icon: "inv_axe_1h_b.jpg", permanentEnchant: 0 },
      ]),
      { enchantedSlots: [15], gemSlots: [], consumables: CHECKLIST.consumables }
    );
    expect(duasArmas.slots.filter((s) => s.tipo === "encanto")).toHaveLength(2);
    expect(duasArmas.slots).toContainEqual({
      slot: 16,
      label: "Mão secundária",
      tipo: "encanto",
      ok: false,
    });

    const comEscudo = calculatePreparation(
      gear([
        { id: 1, slot: 15, icon: "inv_sword_1h_a.jpg", permanentEnchant: 5 },
        { id: 2, slot: 16, icon: "inv_shield_1h_b.jpg", permanentEnchant: 0 },
      ]),
      { enchantedSlots: [15], gemSlots: [], consumables: CHECKLIST.consumables }
    );
    expect(comEscudo.slots.filter((s) => s.tipo === "encanto")).toHaveLength(1);
    // E a nota não cai por causa do escudo.
    expect(comEscudo.checks.find((c) => c.key === "enchants")?.ratio).toBe(1);
  });
});
