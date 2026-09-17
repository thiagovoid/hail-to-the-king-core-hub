/**
 * Traduz a referência coletada do Wowhead (`preparation-reference.json`) no
 * checklist que `calculatePreparation` consome.
 *
 * A separação existe porque as duas pontas falam línguas diferentes:
 *
 *   Wowhead  → rótulo de slot em inglês ("Boots") e **item** id da gema/encanto
 *   WCL      → índice numérico no array `gear` e **spell** id da aura
 *
 * O que dá pra cruzar sem depender de locale é traduzido aqui. O que não dá
 * fica `unconfigured` de propósito — ver a nota sobre consumíveis no fim.
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

/**
 * Rótulo de slot do guia → índice no array `gear` da WCL, que segue a ordem
 * clássica de equipamento (0 = cabeça … 16 = mão secundária).
 *
 * Os apelidos não são chute: são as grafias que aparecem de fato nos 19 guias
 * coletados — o mesmo slot vem como "Boots" num guia e "Feet" em outro,
 * "Helm"/"Head", "Shoulder"/"Shoulders", "Ring"/"Rings".
 */
const GEAR_SLOT_INDEX: Record<string, number[]> = {
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
  // Os dois anéis são encantáveis e o guia recomenda um encanto só pros dois.
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

export interface ResolveEnchantedSlotsResult {
  slots: number[];
  /** Rótulos que o guia trouxe e não sabemos traduzir — reportados, não ignorados em silêncio. */
  unknownLabels: string[];
}

export function resolveEnchantedSlots(
  enchants: PreparationReferenceEntry["enchants"]
): ResolveEnchantedSlotsResult {
  const slots = new Set<number>();
  const unknownLabels: string[] = [];

  for (const enchant of enchants) {
    const indices = GEAR_SLOT_INDEX[normalizeKeyPart(enchant.slot)];
    if (!indices) {
      if (!unknownLabels.includes(enchant.slot)) unknownLabels.push(enchant.slot);
      continue;
    }
    for (const index of indices) slots.add(index);
  }

  return { slots: [...slots].sort((a, b) => a - b), unknownLabels };
}

export interface BuildChecklistResult {
  checklist: PreparationChecklist;
  unknownSlotLabels: string[];
}

/**
 * Monta o checklist de uma spec a partir da recomendação do Wowhead.
 *
 * **Consumíveis ficam de fora do cálculo por ora, de propósito.** O guia dá o
 * *item* id ("Flask of the Blood Knights" = 241324); a WCL entrega a aura pelo
 * *spell* id, com o nome no idioma do cliente de quem logou. Cruzar por nome
 * quebraria justamente no caso mais comum aqui — raider com cliente em
 * português não casa com nome de item em inglês — e, pior, contaria como
 * "faltou flask" um erro nosso de tradução.
 *
 * Então eles seguem `unconfigured`: saem da conta, não viram falha. Pra ligar,
 * é preciso rodar `npm run wcl:inspect-preparation -- --report=<codigo>` uma
 * vez, pegar os spell ids reais das auras e preenchê-los — aí o campo deixa de
 * ser adivinhação.
 */
export function buildChecklistFromReference(entry: PreparationReferenceEntry): BuildChecklistResult {
  const { slots, unknownLabels } = resolveEnchantedSlots(entry.enchants);

  return {
    checklist: {
      enchantedSlots: slots,
      recommendedGemIds: entry.gems.map((gem) => gem.itemId),
      consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
    },
    unknownSlotLabels: unknownLabels,
  };
}

/** Exportado só pra documentar quais tipos o adaptador reconhece. */
export const KNOWN_CONSUMABLE_TYPES = CONSUMABLE_TYPE_KEYS;
