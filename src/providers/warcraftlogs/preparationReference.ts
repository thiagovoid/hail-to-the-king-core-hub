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
 * Soquetes que qualquer personagem tem, independente de spec ou tier: um no
 * colar e um em cada anel. É o próprio guia do Wowhead que afirma isso
 * ("each piece of jewellery always comes with one socket each").
 *
 * Soquete extra em armadura não entra: a WCL lista as gemas presentes, nunca
 * os buracos vazios, então exigir mais que isso seria chutar contra o
 * jogador.
 */
const SOQUETES_DE_JOIA = 3;

export interface BuildChecklistResult {
  checklist: PreparationChecklist;
}

/**
 * Monta o checklist de uma spec a partir da recomendação do Wowhead.
 *
 * O guia entra só como **denominador**: quantos encantos se espera ver no
 * personagem. Qual encanto é indiferente — ver a nota sobre presença vs BIS
 * em preparation.ts.
 *
 * **Consumíveis ficam de fora do cálculo por ora, de propósito.** O guia dá o
 * *item* id; a WCL entrega a aura pelo *spell* id, com o nome no idioma do
 * cliente de quem logou. Cruzar por nome quebraria no caso mais comum aqui —
 * raider com cliente em português contra nome de item em inglês — e contaria
 * como "faltou flask" um erro nosso de tradução. Pra ligar, rodar
 * `npm run wcl:inspect-preparation -- --report=<codigo>` e pegar os spell ids
 * reais. (No log de 15/09 o combatantInfo veio sem auras nenhuma, então isso
 * ainda depende de descobrir qual query as expõe.)
 */
export function buildChecklistFromReference(entry: PreparationReferenceEntry): BuildChecklistResult {
  return {
    checklist: {
      recommendedEnchantCount: entry.enchants.length,
      expectedGems: entry.gems.length > 0 ? SOQUETES_DE_JOIA : 0,
      consumables: { flask: [], food: [], rune: [], oil: [], potion: [] },
    },
  };
}

/** Exportado só pra documentar quais tipos o adaptador reconhece. */
export const KNOWN_CONSUMABLE_TYPES = CONSUMABLE_TYPE_KEYS;
