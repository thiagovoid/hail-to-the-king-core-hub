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
   * Um registro por try de kill em que o jogador estava, nesta run.
   *
   * Guardamos qual boss era, e não só a contagem, pra conseguir mostrar
   * QUAIS bosses foram sem ter que rebuscar o log. A dificuldade vem junto
   * porque distingue Normal de Heroico na hora de exibir.
   */
  bossKills?: Array<{ encounterID: number; difficulty: number }>;

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
   * A nota de preparação SÓ do equipamento, antes de entrar o Wipefest.
   *
   * Existe pra que combinar seja idempotente: `preparation` já é o resultado
   * da combinação, e recombiná-lo empurrava o número a cada execução do
   * coletor de mecânicas. Ver `combinePreparation`.
   */
  preparationGear?: number;
  /** O que falta de equipamento, antes de somar o que o ready check pegou. */
  preparationMissingGear?: string[];
  /**
   * Peça a peça, com o número de slot da WCL junto.
   *
   * `preparationMissing` é uma lista de nomes e não distingue encanto de
   * gema nem um anel do outro — os dois anéis viram um "Anel" só. Aqui o
   * slot vem junto, que é o que permite medalha por peça e a piada de quem
   * encantou UMA das duas armas. Slot 16 só aparece quando a mão secundária
   * é arma de verdade: escudo e off-hand não recebem encanto.
   */
  preparationSlots?: Array<{
    slot: number;
    label: string;
    tipo: "encanto" | "gema";
    ok: boolean;
  }>;

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
  mechanicsDetail?: Array<{
    boss: string;
    mechanic: string;
    label?: string;
    tries: number;
    /**
     * Página do MythicTrap que explica a mecânica, pronta pra iframe.
     *
     * Vem da Wipefest, que já incorpora o MythicTrap — 32 das 39 mecânicas
     * do tier têm uma. Só existe em inglês.
     */
    tipEmbedUrl?: string;
  }>;

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
   * "Curar corretamente" — só existe pra quem curou de verdade na noite.
   *
   * A régua não é HPS: curar mais costuma significar que o raide apanhou
   * mais, e isso não é mérito do healer. Ver buildHealing.
   */
  healing?: {
    /** 0-100: média do quinhão puxado (teto 100) com o aproveitamento. */
    score: number;
    /** % do dano do raide que passou pelas mãos deste healer. */
    coverage: number;
    /** % do que caberia a ele, dado quantos healers a noite teve. */
    share: number;
    /** % da cura lançada que caiu em quem já estava cheio. */
    overheal: number;
  };

  /**
   * Dano e cura FORA da função — o tank que contribui com dano, o dps que
   * segura o próprio HP. Guardado separado do dps/hps principal porque a
   * comparação só faz sentido entre quem está fora de função.
   */
  offRole?: {
    /** Dano por segundo de quem não é dps. */
    dps?: number;
    /** Cura efetiva por segundo de quem não é healer. */
    hps?: number;
  };

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
    /**
     * Quanto do dano que você tomou foi reposto pela SUA própria cura.
     *
     * É a métrica que separa estilos de tank sem colocá-los pra competir:
     * no log de 15/09, Voidwar repôs 27% e Blackwatch 41%. Não dá pra dizer
     * qual é melhor — dá pra dizer se cada um está melhorando.
     */
    selfSustain?: number;
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
   * A noite try a try — presença, ociosidade e o que aconteceu em cada pull.
   *
   * O agregado responde "quanto você fez na noite"; isto responde se você
   * estava na primeira pull e se atravessou alguma try sem bater em nada.
   * Ausente nas noites coletadas antes desta coleta existir.
   */
  tries?: {
    /** Trys de boss em que o jogador estava no raide. */
    present: number;
    /** Trys de boss que a noite teve. */
    total: number;
    /** Faltou na primeira try e apareceu depois. */
    lateStart: boolean;
    /** Estava em alguma try e faltou na última. */
    earlyExit: boolean;
    /** Trys em que estava presente e não causou dano nenhum. */
    idle: number;
    /** Trys em que morreu e ainda assim foi o maior dano da try. */
    topDamageDead: number;
  };

  /**
   * O que as mortes custaram: quanto tempo o raide seguiu lutando sem você.
   *
   * Contar morte crua puniria resiliência — progressão em mítico é 200, 300
   * trys, e "pode wipar, galera" produz morte que não é erro de ninguém.
   * Medir o custo resolve sem limiar: a call de wipe sai perto de zero
   * porque a try acaba logo depois, não porque alguém decidiu perdoar.
   */
  deathCost?: {
    /** Segundos de luta que o raide seguiu sem você. */
    seconds: number;
    /** % do tempo de luta da noite. É a régua. */
    share: number;
    /** Mortes em try que virou kill — o boss caiu sem você. */
    inKills: number;
  };

  /**
   * COMO as mortes aconteceram — não quantas, nem quanto custaram.
   *
   * Separado do `deathCost` de propósito: o custo entra no Score e precisa
   * ser justo com quem cumpre a call de wipe. Isto aqui é só zoeira, e um
   * tombo é engraçado independente de ter sido caro. Ver buildNightDetail.
   */
  deathSignature?: {
    /** Trys em que foi o primeiro a cair, com mais gente caindo depois. */
    primeiroACair: number;
    /** Trys em que morreu e a try acabou em até 10 segundos. */
    efeitoDomino: number;
    /** Trys em que morreu nos primeiros 30 segundos. */
    speedrun: number;
    /** Trys em que passou mais tempo morto do que vivo. */
    fantasma: number;
  };

  /**
   * Utilidade: interromper, dissipar, levantar quem caiu.
   *
   * Não entra em dano nem em cura, não entra no Score hoje — e é o que
   * costuma separar um grupo que limpa heroico de um que não passa. Numa
   * noite de 12 trys foram 22 interrupções e 79 dispels no raide inteiro:
   * evento raro, alto impacto.
   */
  utility?: {
    /** Casts inimigos interrompidos. */
    interrupts: number;
    /** Debuffs tirados de alguém do raide. */
    dispels: number;
    /** Buffs arrancados do inimigo — outra decisão, contada separada. */
    purges: number;
    /** Battle rez lançados. Sai dos casts, sem coleta nova. */
    battleRez: number;
    /** Battle rez RECEBIDOS — o grupo gastando uma carga escassa em você. */
    battleRezRecebidos: number;
  };

  /** Quantas trys de cada boss, e se caiu — base de "Paciência de Jó". */
  bossTries?: Array<{
    encounterID: number;
    tries: number;
    killed: boolean;
    /** Derrubou o boss sem morrer em nenhuma try dele naquela noite. */
    flawless: boolean;
  }>;

  /**
   * Participação no dano das lutas de TRASH da noite, em %.
   *
   * Ausente quando o log não gravou trash — num log que começa na pull do
   * boss todo mundo tem zero, e zero ali não quer dizer que a pessoa estava
   * de bobeira.
   */
  trashShare?: number;

  /**
   * Spec(s) que a WCL registrou pro jogador na noite, com a função de cada.
   *
   * Mais de uma significa que a pessoa trocou de spec entre as trys. Vem do
   * `composition` da tabela de resumo — o `specs` do `playerDetails` volta
   * vazio nos reports reais.
   */
  specs?: Array<{ spec: string; role: "tank" | "healer" | "dps" }>;
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
