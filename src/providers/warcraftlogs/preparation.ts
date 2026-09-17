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
  /** Nome do item no idioma do cliente de quem subiu o log — não usar na tela. */
  name?: string;
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
   * Slots que o guia da spec manda encantar, no **número de slot da WCL**
   * (campo `slot` do item), nunca a posição no array: o array é esparso —
   * pula camisa e mão secundária, e chega a repetir o slot de berloque.
   * Foi exatamente isso que produziu as notas erradas antes.
   * Vazio = checagem não configurada.
   */
  enchantedSlots: number[];
  /**
   * Slots que sempre têm soquete: colar e os dois anéis. O próprio guia diz
   * ("each piece of jewellery always comes with one socket each"). Soquete
   * em armadura não entra: a WCL lista as gemas presentes, nunca os buracos.
   * Vazio = checagem não configurada.
   */
  gemSlots: number[];
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
  /** Slots (em português) que faltam — é o que a tela mostra pra pessoa agir. */
  missing?: string[];
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

/**
 * Número de slot da WCL → nome em português. Conferido contra log real: o
 * diagnóstico imprimiu a peça de cada slot (0 = Warhelm, 2 = Pauldrons,
 * 14 = Cloak, 15 = Warblade).
 */
const SLOT_LABELS: Record<number, string> = {
  0: "Elmo",
  1: "Colar",
  2: "Ombreiras",
  4: "Peito",
  5: "Cintura",
  6: "Pernas",
  7: "Botas",
  8: "Braçadeiras",
  9: "Luvas",
  10: "Anel",
  11: "Anel",
  12: "Berloque",
  13: "Berloque",
  14: "Capa",
  15: "Arma",
  16: "Mão secundária",
};

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

  // Acha a peça equipada num slot. Usa o campo `slot` da WCL, nunca a
  // posição no array — o array é esparso e repete slot de berloque.
  const pecaNoSlot = (slot: number) => gear.find((item) => item.slot === slot && item.id);

  // O nome do item vem do log no idioma do cliente de quem subiu — o mesmo
  // raide pode gerar "Warhelm..." ou "Elmo de Guerra...". Pra tela ser
  // sempre em português (e mais direta), mostra-se o slot, não a peça.
  const nomeDoSlot = (slot: number) => SLOT_LABELS[slot] ?? `slot ${slot}`;

  // Encantos — basta ter algum encanto no slot. Qual encanto é indiferente:
  // o guia publica BIS, e escolher o mais barato é decisão legítima.
  if (checklist.enchantedSlots.length > 0) {
    const avaliados: string[] = [];
    const faltando: string[] = [];

    for (const slot of checklist.enchantedSlots) {
      const peca = pecaNoSlot(slot);
      // Slot vazio (arma de duas mãos não tem secundária) não entra na conta:
      // não dá pra encantar o que não existe.
      if (!peca) continue;
      avaliados.push(nomeDoSlot(slot));
      if (!peca.permanentEnchant) faltando.push(nomeDoSlot(slot));
    }

    if (avaliados.length === 0) {
      checks.push({ key: "enchants", label: "Encantos", status: "unconfigured" });
    } else {
      const ratio = (avaliados.length - faltando.length) / avaliados.length;
      checks.push({
        key: "enchants",
        label: "Encantos",
        status: statusFromRatio(ratio),
        ratio,
        detail: `${avaliados.length - faltando.length} de ${avaliados.length} peças encantadas`,
        missing: faltando,
      });
    }
  } else {
    checks.push({ key: "enchants", label: "Encantos", status: "unconfigured" });
  }

  // Gemas — qualquer gema conta, não precisa ser a do guia.
  if (checklist.gemSlots.length > 0) {
    const avaliados: string[] = [];
    const faltando: string[] = [];

    for (const slot of checklist.gemSlots) {
      const peca = pecaNoSlot(slot);
      if (!peca) continue;
      avaliados.push(nomeDoSlot(slot));
      if (!peca.gems || peca.gems.length === 0) faltando.push(nomeDoSlot(slot));
    }

    if (avaliados.length === 0) {
      checks.push({ key: "gems", label: "Gemas", status: "unconfigured" });
    } else {
      const ratio = (avaliados.length - faltando.length) / avaliados.length;
      checks.push({
        key: "gems",
        label: "Gemas",
        status: statusFromRatio(ratio),
        ratio,
        detail: `${avaliados.length - faltando.length} de ${avaliados.length} soquetes preenchidos`,
        missing: faltando,
      });
    }
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
