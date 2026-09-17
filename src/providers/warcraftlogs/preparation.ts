/**
 * Preparação: quanto do "dever de casa" antes da raid o jogador cumpriu.
 *
 * **A régua é presença, não BIS.** O Wowhead lista o melhor item possível,
 * mas na prática se escolhe encanto mais barato, gema de outra stat, item
 * que não compensa. Isso é decisão legítima e não pode virar nota baixa.
 * Então a medida é "encantou?" e "gemou?", nunca "usou exatamente o que o
 * guia mandou".
 *
 * Por isso também não existe mapa de índice→slot aqui. A versão anterior
 * conferia slot a slot contra uma ordem de array suposta, que não batia com
 * o que a WCL devolve — e produzia zeros falsos. Contar quantos itens têm
 * encanto não depende de ordem nenhuma.
 *
 * Cada checagem vale uma proporção de 0 a 1, então a nota é contínua: seis
 * de sete encantos dá 86, não zero.
 *
 * Tudo aqui é puro: recebe o `combatantInfo` que a WCL já devolve na tabela
 * Summary e o checklist derivado do guia, e devolve a nota. Sem rede.
 */

export interface WclGearItem {
  id: number;
  /** Slot autoritativo informado pela WCL — não depende da posição no array. */
  slot?: number;
  /** 0 ou ausente = sem encanto permanente. */
  permanentEnchant?: number;
  permanentEnchantName?: string;
  gems?: Array<{ id: number }>;
}

export interface WclAura {
  ability?: number;
  name?: string;
}

export interface WclCombatantInfo {
  gear?: WclGearItem[];
  auras?: WclAura[];
}

export interface PreparationChecklist {
  /**
   * Quantos encantos o guia da spec recomenda. Serve de denominador, não de
   * lista: qualquer encanto no personagem conta pro numerador.
   * 0 = checagem não configurada.
   */
  recommendedEnchantCount: number;
  /**
   * Quantos soquetes se espera que estejam preenchidos. O próprio guia diz
   * que todo mundo tem no mínimo três — colar e os dois anéis sempre vêm
   * com um soquete cada. Soquete vazio em outra peça não é detectável: a
   * WCL só lista as gemas presentes, nunca os buracos.
   * 0 = checagem não configurada.
   */
  expectedGems: number;
  /** IDs de spell do buff de cada consumível. Lista vazia = não configurado. */
  consumables: {
    flask: number[];
    food: number[];
    rune: number[];
    oil: number[];
    potion: number[];
  };
}

export type PreparationStatus = "ok" | "partial" | "missing" | "unconfigured";

export interface PreparationCheck {
  key: "gems" | "enchants" | "flask" | "food" | "rune" | "oil" | "potion";
  label: string;
  status: PreparationStatus;
  /** 0 a 1. undefined quando a checagem não pôde ser avaliada. */
  ratio?: number;
  /** Detalhe legível, ex: "6 de 7 itens encantados". */
  detail?: string;
}

export interface PreparationResult {
  /**
   * 0-100 — média das checagens avaliáveis. `undefined` quando nenhuma pôde
   * ser avaliada (sem combatantInfo ou checklist vazio), nunca zero: a
   * lacuna seria nossa, não do jogador.
   */
  score?: number;
  checks: PreparationCheck[];
}

const CONSUMABLE_LABELS: Record<keyof PreparationChecklist["consumables"], string> = {
  flask: "Flask",
  food: "Comida",
  rune: "Runa",
  oil: "Óleo",
  potion: "Poção",
};

function hasAura(auras: WclAura[], spellIds: number[]): boolean {
  return auras.some((aura) => aura.ability !== undefined && spellIds.includes(aura.ability));
}

function statusFromRatio(ratio: number): PreparationStatus {
  if (ratio >= 1) return "ok";
  return ratio > 0 ? "partial" : "missing";
}

export function calculatePreparation(
  combatantInfo: WclCombatantInfo | undefined,
  checklist: PreparationChecklist
): PreparationResult {
  // Sem combatantInfo não dá pra afirmar nada — nota ausente, não nota zero.
  if (!combatantInfo) {
    return { score: undefined, checks: [] };
  }

  const gear = combatantInfo.gear ?? [];
  const auras = combatantInfo.auras ?? [];
  const checks: PreparationCheck[] = [];

  // Encantos — conta itens encantados, sem olhar qual encanto nem em que
  // slot. Item vazio (slot sem peça) não entra na conta de jeito nenhum.
  if (checklist.recommendedEnchantCount > 0) {
    const encantados = gear.filter((item) => item.id && item.permanentEnchant).length;
    const ratio = Math.min(encantados / checklist.recommendedEnchantCount, 1);

    checks.push({
      key: "enchants",
      label: "Encantos",
      status: statusFromRatio(ratio),
      ratio,
      detail: `${encantados} de ${checklist.recommendedEnchantCount} itens encantados`,
    });
  } else {
    checks.push({ key: "enchants", label: "Encantos", status: "unconfigured" });
  }

  // Gemas — qualquer gema conta. Não se exige a gema do guia.
  if (checklist.expectedGems > 0) {
    const equipadas = gear.reduce((total, item) => total + (item.gems?.length ?? 0), 0);
    const ratio = Math.min(equipadas / checklist.expectedGems, 1);

    checks.push({
      key: "gems",
      label: "Gemas",
      status: statusFromRatio(ratio),
      ratio,
      detail: `${equipadas} de ${checklist.expectedGems} soquetes preenchidos`,
    });
  } else {
    checks.push({ key: "gems", label: "Gemas", status: "unconfigured" });
  }

  // Consumíveis — presença da aura, sem meio-termo.
  for (const key of ["flask", "food", "rune", "oil", "potion"] as const) {
    const spellIds = checklist.consumables[key];
    if (spellIds.length === 0) {
      checks.push({ key, label: CONSUMABLE_LABELS[key], status: "unconfigured" });
      continue;
    }
    const presente = hasAura(auras, spellIds);
    checks.push({
      key,
      label: CONSUMABLE_LABELS[key],
      status: presente ? "ok" : "missing",
      ratio: presente ? 1 : 0,
    });
  }

  const avaliaveis = checks.filter((check) => check.ratio !== undefined);
  if (avaliaveis.length === 0) {
    return { score: undefined, checks };
  }

  const media = avaliaveis.reduce((sum, check) => sum + (check.ratio ?? 0), 0) / avaliaveis.length;
  return { score: Math.round(media * 100), checks };
}

/**
 * Média da preparação do jogador entre os fights da noite. A preparação é
 * estado do começo do pull (flask cai, poção é por pull), então a média
 * entre as trys é mais fiel que olhar um pull só.
 */
export function averagePreparation(scores: Array<number | undefined>): number | undefined {
  const defined = scores.filter((score): score is number => score !== undefined);
  if (defined.length === 0) return undefined;
  return Math.round(defined.reduce((sum, score) => sum + score, 0) / defined.length);
}
