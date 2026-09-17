/**
 * Preparação: quanto do "dever de casa" antes da raid o jogador cumpriu —
 * gemas, encantos, flask, comida, poção, runa e óleo.
 *
 * Tudo aqui é puro: recebe o `combatantInfo` que a WCL já devolve na tabela
 * Summary e um checklist de configuração, e devolve a nota. Sem rede.
 *
 * O checklist não é escrito na mão: vem de `preparation-reference.json`, que
 * o coletor do Wowhead gera por spec a cada temporada — ver
 * `preparationReference.ts`, que faz a tradução.
 *
 * Enquanto uma checagem não estiver configurada ela fica `unconfigured` e sai
 * da conta, em vez de contar como falha e punir o jogador por uma lacuna
 * nossa.
 */

export interface WclGearItem {
  id: number;
  slot?: number;
  /** 0 ou ausente = sem encanto permanente. */
  permanentEnchant?: number;
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
   * Índices de slot no array `gear` da WCL que exigem encanto permanente
   * no tier atual (ex: costas, peito, pulsos, pernas, pés, anéis, arma).
   * Vazio = checagem não configurada.
   */
  enchantedSlots: number[];
  /**
   * Item ids das gemas recomendadas pra spec. Vazio = não configurado.
   *
   * Só dá pra afirmar se a gema equipada é a certa — quantas *deveria* ter
   * não é observável: a WCL lista as gemas presentes, não os soquetes
   * vazios. Então soquete vazio não aparece como falha aqui.
   */
  recommendedGemIds: number[];
  /** IDs de spell do buff de cada consumível. Lista vazia = não configurado. */
  consumables: {
    flask: number[];
    food: number[];
    rune: number[];
    oil: number[];
    potion: number[];
  };
}

export type PreparationStatus = "ok" | "missing" | "unconfigured";

export interface PreparationCheck {
  key: "gems" | "enchants" | "flask" | "food" | "rune" | "oil" | "potion";
  label: string;
  status: PreparationStatus;
  /** Detalhe legível, ex: "3 de 5 slots sem encanto". */
  detail?: string;
}

export interface PreparationResult {
  /**
   * 0-100 — proporção das checagens avaliáveis que passaram. `undefined`
   * quando nenhuma pôde ser avaliada (sem combatantInfo ou checklist vazio).
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

  // Gemas — item id do Wowhead e da WCL são o mesmo espaço de id, então o
  // cruzamento é direto e não depende do idioma do cliente.
  if (checklist.recommendedGemIds.length > 0) {
    const worn = gear.flatMap((item) => item.gems ?? []).map((gem) => gem.id);
    const recommended = new Set(checklist.recommendedGemIds);
    const matching = worn.filter((id) => recommended.has(id)).length;

    checks.push({
      key: "gems",
      label: "Gemas",
      status: worn.length > 0 && matching === worn.length ? "ok" : "missing",
      detail:
        worn.length === 0 ? "nenhuma gema equipada" : `${matching} de ${worn.length} gemas são as recomendadas`,
    });
  } else {
    checks.push({ key: "gems", label: "Gemas", status: "unconfigured" });
  }

  // Encantos
  if (checklist.enchantedSlots.length > 0) {
    const missing = checklist.enchantedSlots.filter((slot) => {
      const item = gear[slot];
      // Slot vazio (ex: off-hand de quem usa duas mãos) não conta como falha.
      if (!item || !item.id) return false;
      return !item.permanentEnchant;
    });

    checks.push({
      key: "enchants",
      label: "Encantos",
      status: missing.length === 0 ? "ok" : "missing",
      detail: `${checklist.enchantedSlots.length - missing.length} de ${checklist.enchantedSlots.length} slots`,
    });
  } else {
    checks.push({ key: "enchants", label: "Encantos", status: "unconfigured" });
  }

  // Consumíveis
  for (const key of ["flask", "food", "rune", "oil", "potion"] as const) {
    const spellIds = checklist.consumables[key];
    if (spellIds.length === 0) {
      checks.push({ key, label: CONSUMABLE_LABELS[key], status: "unconfigured" });
      continue;
    }
    checks.push({
      key,
      label: CONSUMABLE_LABELS[key],
      status: hasAura(auras, spellIds) ? "ok" : "missing",
    });
  }

  const evaluated = checks.filter((check) => check.status !== "unconfigured");
  if (evaluated.length === 0) {
    return { score: undefined, checks };
  }

  const passed = evaluated.filter((check) => check.status === "ok").length;
  return { score: Math.round((passed / evaluated.length) * 100), checks };
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
