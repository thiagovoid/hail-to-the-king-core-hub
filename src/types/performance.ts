/**
 * Performance data for a single player during one raid run (one night).
 */
export interface PlayerPerformance {
  /**
   * Player ID from roster.json.
   */
  playerId: string;

  /**
   * Average DPS during the run.
   * Only applicable to DPS players.
   */
  dps?: number;

  /**
   * Average HPS during the run.
   * Only applicable to healers.
   */
  hps?: number;

  /**
   * Warcraft Logs parse percentile.
   * Only available for kills logged on a public report.
   */
  parse?: number;

  /**
   * Item level during the run.
   */
  itemLevel?: number;

  /**
   * Number of deaths during the run.
   * Collected and shown in the history table, but out of the Score for now.
   */
  deaths: number;

  /**
   * Percentage (0-100) of preparation items ready for the night — gems,
   * enchants, flask, food, potions, rune, oil. Not collected yet: needs a
   * WarcraftLogs pass over `combatantInfo` (gear) plus the consumable buffs.
   */
  preparation?: number;
  /**
   * Slots em português que estão sem encanto ou sem gema. É o que explica,
   * na tela, por que a nota não é 100.
   */
  preparationMissing?: string[];
  /** Quantas checagens formaram a nota — deixa a combinação com os consumíveis rastreável. */
  preparationChecks?: number;

  /**
   * Mechanics-related failures.
   * Not tracked automatically; filled in manually when available.
   */
  mechanics?: {
    /** Média de mecânicas distintas erradas por try. */
    errors: number;
    /** Em quantas trys a média foi calculada — deixa o número rastreável. */
    tries?: number;
  };

  /**
   * Onde os erros mecânicos aconteceram na noite, do mais frequente pro
   * menos. É o que explica o número — a nota sozinha não diz o que treinar.
   */
  mechanicsDetail?: Array<{ boss: string; mechanic: string; label?: string; tries: number }>;

  /**
   * Wipefest's overall mechanics score (0-100) for the run.
   * Not populated yet — reserved for the Wipefest provider (browser
   * automation, planned separately). Additive: absent for every run until then.
   */
  wipefestScore?: number;

  /**
   * "Atacar corretamente" — execução ofensiva da noite, 0-100.
   *
   * Duas metades: quanto da luta a pessoa passou atacando (uptime) e quanto
   * do tempo os cooldowns ofensivos ficaram em recarga. A segunda parte é
   * tempo em recarga, NÃO quantidade de usos: quem guarda o cooldown pro
   * final da luta gastou o uso, mas deixou a habilidade parada.
   */
  attack?: {
    /** Média das duas metades. É o que vira nota da dimensão. */
    score: number;
    /** % da luta com o jogador ativo (activeTime / duração da noite). */
    uptime: number;
    /** % médio de tempo em recarga dos cooldowns ofensivos. Null sem nenhum usado. */
    cooldowns: number | null;
  };

  /**
   * Cooldown a cooldown, do pior aproveitado pro melhor — é o que explica a
   * nota. "Atacar: 61%" sozinho não diz o que treinar; "Avatar 45%" diz.
   */
  attackDetail?: Array<{
    spellId: number;
    name: string;
    casts: number;
    /** 0-100: tempo em recarga sobre o tempo de luta. */
    efficiency: number;
  }>;

  /**
   * "Defender corretamente" — o que a pessoa fez pra não morrer.
   *
   * A nota vem SÓ dos cooldowns defensivos. Mitigação e dano recebido são
   * contexto: no log de 15/09 a mitigação ficou entre 38% e 48% pro raide
   * inteiro, com os três tanks nas três últimas posições. Ela mede armadura
   * e buff de raide, não decisão de quem se defende. Ver buildDefense.
   */
  defense?: {
    /** 0-100, média dos cooldowns defensivos. Null quando nenhum foi medido. */
    score: number | null;
    /** % do dano que vinha e não chegou a entrar. Informativo. */
    mitigation: number;
    /** Dano recebido por segundo de luta. Informativo. */
    dtps: number;
  };

  /** Cooldown a cooldown, do pior aproveitado pro melhor. */
  defenseDetail?: Array<{
    spellId: number;
    name: string;
    casts: number;
    /** 0-100: tempo em recarga sobre o tempo de luta. */
    efficiency: number;
  }>;

  /**
   * WoW Analyzer's "Always Be Casting" percentage for the run (0-100) —
   * Active Time for a DPS spec, Ability/Healing Uptime for a healer. There
   * is no single 0-100 score like Wipefest's on WoW Analyzer (confirmed
   * inspecting real specs: every spec has its own checklist with different
   * metrics and labels) — this is the one number close enough to universal
   * across specs to fit here; everything else stays a native per-provider
   * feature instead (see wowanalyzer-findings memory).
   */
  uptime?: number;
}

/**
 * One raid night (one Warcraft Logs report) inside a raid week.
 * A week can have multiple runs (e.g. Tuesday + Thursday).
 */
export interface PerformanceRun {
  /**
   * Date of this specific run.
   */
  date: string;

  /**
   * Warcraft Logs report code this run was generated from, when known.
   */
  reportCode?: string;

  /**
   * Performance data for each player present in this run.
   */
  players: PlayerPerformance[];
}

/**
 * Performance data collected for the entire core during one raid week.
 * A week groups every run (raid night) that happened within it.
 */
export interface WeeklyPerformance {
  /**
   * Sequential week number.
   */
  week: number;

  /**
   * Raid runs that happened during this week, in chronological order.
   */
  runs: PerformanceRun[];
}

/**
 * A player's performance for a single run, with the run's own
 * week/date/report attached — used for flattened history views
 * (player history, core-wide series) where each run is a data point.
 */
export interface PlayerRunPerformance extends PlayerPerformance {
  week: number;
  date: string;
  reportCode?: string;
}

/**
 * Performance goals for an individual player.
 */
export interface PerformanceGoal {
  /**
   * Player ID from roster.json.
   */
  playerId: string;

  /**
   * DPS goal.
   */
  dps?: {
    target: number;
  };

  /**
   * Maximum acceptable number of mechanic errors.
   */
  mechanics?: {
    maxErrors: number;
  };
}
