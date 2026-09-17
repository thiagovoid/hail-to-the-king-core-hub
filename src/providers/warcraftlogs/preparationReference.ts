/**
 * Traduz a referência coletada do Wowhead (`preparation-reference.json`) no
 * checklist que `calculatePreparation` consome.
 *
 * O guia serve de **denominador**, não de lista de compras: quantos encantos
 * se espera ver no personagem e quantos soquetes deveriam estar preenchidos.
 * Qual gema ou encanto o jogador escolheu é indiferente — o Wowhead publica
 * BIS, e optar por algo mais barato é decisão legítima, não descuido.
 *
 * O que não dá pra cruzar fica `unconfigured` de propósito — ver a nota sobre
 * consumíveis mais abaixo.
 */

import type { PreparationChecklist } from "./preparation";

export interface WowheadItemRef {
  itemId: number;
  name: string;
}

export interface PreparationReferenceEntry {
  wowClass: string;
  spec: string;
  role: string;
  url: string;
  players?: string[];
  enchants: Array<{ slot: string } & WowheadItemRef>;
  gems: Array<{ slot: string } & WowheadItemRef>;
  consumables: Array<{ type: string; items: WowheadItemRef[] }>;
}

export interface PreparationReference {
  updatedAt: string;
  source: string;
  /** Chave: "<classe>|<spec sem acento, minúscula>". */
  specs: Record<string, PreparationReferenceEntry>;
}

export function normalizeKeyPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function specKey(wowClass: string, spec: string): string {
  return `${normalizeKeyPart(wowClass)}|${normalizeKeyPart(spec)}`;
}

/** Tipo de consumível no guia → chave da checagem. */
const CONSUMABLE_TYPE_KEYS: Record<string, keyof PreparationChecklist["consumables"]> = {
  flask: "flask",
  food: "food",
  tea: "food",
  "augment rune": "rune",
  rune: "rune",
  "weapon buff": "oil",
  "weapon buffs": "oil",
  oil: "oil",
  "combat potion": "potion",
  "stats potion": "potion",
  // "Health Potion" e "Mana Potion" ficam de fora: são reativos, gastos no
  // meio da luta. Não medem preparação.
};

/**
 * Rótulo de slot do guia → número de slot da WCL (campo `slot` do item).
 *
 * **Conferido contra log real**, não suposto: o diagnóstico imprimiu o nome
 * de cada peça do Xúlio no report JCvk27bDL6Zdm18j e cada número foi lido do
 * item que estava lá (0 = Warhelm, 2 = Pauldrons, 14 = Cloak, 15 = Warblade).
 *
 * O erro anterior não era este mapa e sim usar a POSIÇÃO no array: ele é
 * esparso (pula camisa e mão secundária) e chega a repetir slot de berloque,
 * então gear[15] não era a arma.
 *
 * Os apelidos são as grafias que aparecem de fato nos 19 guias coletados.
 */
const GEAR_SLOT_NUMBERS: Record<string, number[]> = {
  helm: [0],
  helmet: [0],
  head: [0],
  neck: [1],
  shoulder: [2],
  shoulders: [2],
  chest: [4],
  belt: [5],
  waist: [5],
  legs: [6],
  boots: [7],
  feet: [7],
  bracers: [8],
  wrist: [8],
  wrists: [8],
  hands: [9],
  gloves: [9],
  // O guia recomenda um encanto só, mas os dois anéis contam.
  ring: [10, 11],
  rings: [10, 11],
  finger: [10, 11],
  back: [14],
  cloak: [14],
  weapon: [15],
  "main hand": [15],
  mainhand: [15],
  "off hand": [16],
  offhand: [16],
};

/**
 * Slots que sempre têm soquete: colar e os dois anéis. É o próprio guia que
 * afirma ("each piece of jewellery always comes with one socket each").
 */
const SLOTS_DE_JOIA = [1, 10, 11];

export interface BuildChecklistResult {
  checklist: PreparationChecklist;
  /** Rótulos do guia que não sabemos traduzir — reportados, não ignorados. */
  unknownSlotLabels: string[];
}

/**
 * Monta o checklist de uma spec a partir da recomendação do Wowhead.
 *
 * O guia diz **onde** encantar, não **com o quê**: qual encanto ou gema o
 * jogador escolheu é indiferente. Ele publica BIS, e optar por algo mais
 * barato é decisão legítima de quem joga, não descuido.
 *
 * **Consumíveis ficam de fora do cálculo por ora, de propósito.** O guia dá o
 * *item* id; a WCL entrega a aura pelo *spell* id, com o nome no idioma do
 * cliente. Pra ligar, rodar `npm run wcl:inspect-preparation` e pegar os
 * spell ids reais. (No log de 15/09 o combatantInfo veio sem aura nenhuma,
 * então isso ainda depende de descobrir qual query as expõe.)
 */
export function buildChecklistFromReference(entry: PreparationReferenceEntry): BuildChecklistResult {
  const slots = new Set<number>();
  const unknownSlotLabels: string[] = [];

  for (const enchant of entry.enchants) {
    const numeros = GEAR_SLOT_NUMBERS[normalizeKeyPart(enchant.slot)];
    if (!numeros) {
      if (!unknownSlotLabels.includes(enchant.slot)) unknownSlotLabels.push(enchant.slot);
      continue;
    }
    for (const numero of numeros) slots.add(numero);
  }

  return {
    checklist: {
      enchantedSlots: [...slots].sort((a, b) => a - b),
      gemSlots: entry.gems.length > 0 ? SLOTS_DE_JOIA : [],
      consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
    },
    unknownSlotLabels,
  };
}

/** Exportado só pra documentar quais tipos o adaptador reconhece. */
export const KNOWN_CONSUMABLE_TYPES = CONSUMABLE_TYPE_KEYS;
