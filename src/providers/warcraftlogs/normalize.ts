/**
 * Normalization Layer for WarcraftLogs: pure functions that turn raw WCL
 * shapes into the fields the rest of the app already understands
 * (PlayerPerformance / PerformanceRun). No network calls in this file —
 * that's the point, it's what makes this testable without mocking the API.
 */

import { calculatePreparation, type PreparationChecklist, type WclCombatantInfo } from "./preparation";
import { findParse } from "./reportRankings";
import type { CooldownsDoJogador } from "./cooldownUsage";
import type { BossMorto } from "./bossKills";
import { buildAttack, calculateUptime } from "../../normalization/buildAttack";
import { buildAjudar } from "../../normalization/buildAjudar";
import { buildDefense, type DanoRecebido } from "../../normalization/buildDefense";
import { buildHealing, calculateCobertura } from "../../normalization/buildHealing";
import type { DetalheDaNoite } from "../../normalization/buildNightDetail";
import type { PlayerPerformance } from "../../types/performance";

export interface WclProfile {
  region: string;
  realm: string;
  name: string;
}

export function parseWclProfile(profileUrl: string): WclProfile {
  const match = profileUrl.match(/character\/([a-z]+)\/([a-z0-9-]+)\/(.+)$/i);
  if (!match) {
    throw new Error(`URL de perfil do WarcraftLogs inválida: ${profileUrl}`);
  }
  const [, region, realm, name] = match;
  return { region: region.toUpperCase(), realm, name: decodeURIComponent(name) };
}

/** Character names are compared case-insensitively — roster URLs sometimes have the wrong casing. */
export function sameCharacterName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** "DeathKnight" -> "death-knight" */
export function classNameToSlug(className: string): string {
  return className.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function slugifyId(name: string, existingIds: Set<string>): string {
  const base = name.toLowerCase();
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

// Brasília não observa horário de verão desde 2019: offset fixo -03:00.
// Necessário porque o core raida à noite e o timestamp UTC do report
// costuma cair no dia seguinte.
const BRAZIL_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

export function toBrazilDateString(timestampMs: number): string {
  return new Date(timestampMs + BRAZIL_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

export interface WclDeathEvent {
  name: string;
}

export function countDeaths(deathEvents: WclDeathEvent[], characterName: string): number {
  return deathEvents.filter((event) => sameCharacterName(event.name, characterName)).length;
}

export interface WclFight {
  id: number;
  encounterID: number;
  name: string;
  kill: boolean;
  difficulty: number | null;
  startTime: number;
  endTime: number;
  /**
   * `actorId` de quem estava no raide NESTA try.
   *
   * É o que separa "não jogou a noite" de "não estava nesta pull" — a base
   * de quem chegou atrasado e de quem lagou no meio. Opcional porque os logs
   * arquivados antes desta coleta não têm o campo.
   */
  friendlyPlayers?: number[] | null;
}

/**
 * Quais fights compõem o agregado da noite: **todas as trys do tier**,
 * kills e wipes.
 *
 * Antes isso espelhava a aba "All Kills" da WCL (só os kills quando havia
 * algum), o que escondia justamente as tentativas de progressão — uma noite
 * de 20 wipes e 1 kill era medida só pelo kill. Como o Score Geral mede a
 * noite de raid, e não a melhor foto dela, o agregado passa a ser o log
 * inteiro.
 *
 * Único número que não segue essa regra é o `parse`: a WCL só calcula
 * percentil pra kill, wipe não tem ranking (ver buildRunPlayers).
 */
export function selectAggregateFights(raidFights: WclFight[]): WclFight[] {
  return raidFights;
}

export function calculateAggregateDurationMs(fights: WclFight[]): number {
  return fights.reduce((sum, fight) => sum + (fight.endTime - fight.startTime), 0);
}

/**
 * Total amount / fight duration — NOT the player's activeTime, which is
 * always <= fight duration whenever they die or have a gap, and inflates
 * the number relative to what WCL displays.
 */
export function calculateMetricValue(totalAmount: number, aggregateDurationMs: number): number {
  return totalAmount / (aggregateDurationMs / 1000);
}

const RACE_TRANSLATIONS: Record<string, string> = {
  Human: "Humano",
  Dwarf: "Anão",
  "Night Elf": "Elfo da Noite",
  Gnome: "Gnomo",
  Draenei: "Draenei",
  Worgen: "Worgen",
  "Void Elf": "Elfo Vazio",
  "Lightforged Draenei": "Draenei Iluminado",
  "Dark Iron Dwarf": "Anão Ferro Negro",
  "Kul Tiran": "Kul Tiran",
  Mechagnome: "Mecagnomo",
  Orc: "Orc",
  Undead: "Renegado",
  Tauren: "Tauren",
  Troll: "Troll",
  "Blood Elf": "Elfo Sangrento",
  Goblin: "Goblin",
  Nightborne: "Nightborne",
  "Highmountain Tauren": "Tauren das Terras Altas",
  "Mag'har Orc": "Orc Mag'har",
  "Zandalari Troll": "Troll Zandalari",
  Vulpera: "Vulpera",
  Pandaren: "Pandaren",
  Dracthyr: "Dracthyr",
  Earthen: "Terrestre",
};

export function translateRace(race: string | undefined | null): string {
  if (!race) return "";
  return RACE_TRANSLATIONS[race] ?? race;
}

export interface WclFightTables {
  damage: { data: { entries: WclTableEntry[] } };
  healing: { data: { entries: WclTableEntry[] } };
  summary: {
    data: {
      deathEvents?: WclDeathEvent[];
      playerDetails?: Record<string, WclPlayerDetail[]>;
      /**
       * Quem estava no raide, com spec E função de cada um.
       *
       * É a única fonte confiável de spec no relatório: o `specs` do
       * `playerDetails` volta vazio nos reports reais. Daqui saem as
       * medalhas de quem jogou de duas ou três specs na temporada, e a de
       * quem cobriu uma vaga fora da própria função.
       */
      composition?: Array<{
        name: string;
        id: number;
        type: string;
        specs?: Array<{ spec: string; role: string }>;
      }>;
    };
  };
}

export interface WclTableEntry {
  name: string;
  total: number;
  activeTime: number;
  itemLevel: number;
  /** Id do ator — o mesmo `sourceID` dos eventos de cast. */
  id?: number;
  /** Quebra do dano por habilidade. Ver buildDamageShares. */
  abilities?: Array<{ name?: string; total?: number }>;
  /** Só na tabela de cura: o que caiu em quem já estava cheio. */
  overheal?: number;
  /**
   * Quem recebeu a cura. Truncado nos 5 maiores, como todo o resto — o que
   * basta pra auto-cura, porque num tank ele mesmo é sempre o primeiro
   * (Voidwar: 99,9% da cura dele é nele).
   */
  targets?: Array<{ name?: string; total?: number }>;
}

export interface WclPlayerDetail {
  name: string;
  type: string;
  specs?: Array<{ name: string }>;
  server: string;
  region: string;
  /** Gear e auras do pull — base da nota de Preparação (ver preparation.ts). */
  combatantInfo?: WclCombatantInfo;
}

export interface NormalizedRunPlayer {
  playerId: string;
  dps?: number;
  hps?: number;
  parse?: number;
  itemLevel: number;
  deaths: number;
  /** 0-100; undefined quando o checklist não está configurado ou o log não trouxe combatantInfo. */
  preparation?: number;
  /** "Atacar corretamente": uptime + cooldowns ofensivos. Ver buildAttack. */
  attack?: PlayerPerformance["attack"];
  attackDetail?: PlayerPerformance["attackDetail"];
  /** "Defender corretamente": cooldowns defensivos. Ver buildDefense. */
  defense?: PlayerPerformance["defense"];
  defenseDetail?: PlayerPerformance["defenseDetail"];
  /** Bosses que o jogador viu morrer na noite. Ver bossKills.ts. */
  bossKills?: BossMorto[];
  /** "Curar corretamente" — só pra quem curou. Ver buildHealing. */
  healing?: PlayerPerformance["healing"];
  /** Dano/cura fora da função. Ver o tipo em performance.ts. */
  offRole?: PlayerPerformance["offRole"];
  /** A noite try a try. Ver buildNightDetail. */
  tries?: PlayerPerformance["tries"];
  bossTries?: PlayerPerformance["bossTries"];
  /** O que as mortes custaram. Ver buildNightDetail. */
  deathCost?: PlayerPerformance["deathCost"];
  /** Como as mortes aconteceram. Ver buildNightDetail. */
  deathSignature?: PlayerPerformance["deathSignature"];
  /** Interrupções, dispels e battle rez. Ver buildUtility. */
  utility?: PlayerPerformance["utility"];
  /** % do dano do raide nas lutas de trash. */
  trashShare?: PlayerPerformance["trashShare"];
  /** Spec(s) da noite, com a função de cada. */
  specs?: PlayerPerformance["specs"];
  /** Slots sem encanto ou sem gema — o que a tela mostra pra pessoa agir. */
  preparationMissing?: string[];
  /** Peça a peça, com o slot junto. Ver PlayerPerformance. */
  preparationSlots?: PlayerPerformance["preparationSlots"];
  /** A nota só do equipamento. Base fixa da combinação com o Wipefest. */
  preparationGear?: number;
  preparationMissingGear?: string[];
  /**
   * Quantas checagens entraram na nota de preparação (encantos, gemas).
   *
   * Necessário porque os consumíveis vêm de outra fonte, coletada depois:
   * sem saber o peso desta parte, não dá pra somar as duas sem distorcer.
   */
  preparationChecks?: number;
}

export interface WclRankingEntry {
  characterName: string;
  encounterID: number;
  metric: "dps" | "hps";
  ranks: Array<{ report: { code: string; fightID: number }; rankPercent: number }>;
}

export interface BuildRunPlayersInput {
  reportCode: string;
  aggregateFightIds: number[];
  aggregateDurationMs: number;
  aggregateTables: WclFightTables;
  fullTables: WclFightTables;
  rankings: WclRankingEntry[];
  /**
   * Parse por personagem, vindo dos rankings do próprio relatório.
   *
   * Substitui o cruzamento com o ranking global do personagem, que nunca
   * batia: os logs do core não aparecem lá, então o filtro por reportCode
   * resultava sempre vazio e a dimensão de maior peso ficava sem dado.
   */
  parseByPlayer?: Map<string, { parse: number; kills: number }>;
  players: Array<{ id: string; role: "tank" | "healer" | "dps"; profile: WclProfile }>;
  /**
   * Checklist de preparação **daquele jogador** — a recomendação é por spec,
   * não do raide inteiro. Ausente (ou devolvendo undefined) = a nota não é
   * calculada e fica undefined, em vez de sair zerada.
   */
  resolvePreparationChecklist?: (playerId: string) => PreparationChecklist | undefined;
  /**
   * Tempo em recarga dos cooldowns do jogador na noite, por id do roster.
   * Ausente quando a coleta de eventos não rodou — a nota de Atacar então
   * fica só com o uptime, em vez de sumir.
   */
  cooldownsByPlayer?: Map<string, CooldownsDoJogador>;
  /** Dano recebido na noite, por id do roster. Ver buildDefense. */
  damageTakenByPlayer?: Map<string, DanoRecebido>;
  /** Bosses mortos com o jogador presente, por id do roster. */
  bossKillsByPlayer?: Map<string, BossMorto[]>;
  /**
   * A noite try a try, por id do roster. Ver buildNightDetail.
   *
   * Ausente nos relatórios coletados antes desta coleta existir — é por isso
   * que tudo o que sai daqui é opcional do outro lado.
   */
  nightDetailByPlayer?: Map<string, DetalheDaNoite>;
  /** Utilidade por id do roster — interrupções, dispels, battle rez. */
  utilityByPlayer?: Map<string, NonNullable<PlayerPerformance["utility"]>>;
  /** % do dano no trash, por id do roster. Ausente quando o log não gravou trash. */
  trashShareByPlayer?: Map<string, number>;
  /** Spec(s) da noite, por id do roster. */
  specsByPlayer?: Map<string, NonNullable<PlayerPerformance["specs"]>>;
  /**
   * Dano que o raide inteiro tomou na noite. É o denominador da cobertura
   * de cura: sem ele, "curou muito" e "curou bem" ficam indistinguíveis.
   */
  raidDamageTaken?: number;
}

/**
 * Papéis que a WCL atribuiu ao jogador no conjunto de fights — os baldes do
 * playerDetails ("dps", "healers", "tanks").
 *
 * Mais de um papel significa que a pessoa trocou de função entre as trys.
 * O balde é o único sinal confiável disso: o campo `specs` do playerDetails
 * vem vazio nos reports reais (conferido no log de 15/09, em que a Ligiaf
 * alternou entre dano e cura).
 */
export function findPlayerRoles(
  playerDetails: Record<string, WclPlayerDetail[]> | undefined,
  characterName: string
): string[] {
  const roles: string[] = [];

  for (const [role, bucket] of Object.entries(playerDetails ?? {})) {
    const presente = bucket?.some((member) => sameCharacterName(member.name, characterName));
    if (presente && !roles.includes(role)) roles.push(role);
  }

  return roles;
}

/** Acha o combatantInfo de um personagem entre tanks/dps/healers do Summary. */
export function findCombatantInfo(
  playerDetails: Record<string, WclPlayerDetail[]> | undefined,
  characterName: string
): WclCombatantInfo | undefined {
  for (const bucket of Object.values(playerDetails ?? {})) {
    const match = bucket?.find((member) => sameCharacterName(member.name, characterName));
    if (match?.combatantInfo) return match.combatantInfo;
  }
  return undefined;
}

/**
 * Builds the PlayerPerformance-shaped records for one run, given the raw
 * tables/rankings already fetched for that report. Pure — no network.
 */
export function buildRunPlayers(input: BuildRunPlayersInput): NormalizedRunPlayer[] {
  const {
    reportCode,
    aggregateFightIds,
    aggregateDurationMs,
    aggregateTables,
    fullTables,
    rankings,
    players,
    parseByPlayer,
    resolvePreparationChecklist,
    cooldownsByPlayer,
    damageTakenByPlayer,
    bossKillsByPlayer,
    nightDetailByPlayer,
    trashShareByPlayer,
    specsByPlayer,
    utilityByPlayer,
    raidDamageTaken = 0,
  } = input;
  const deathEvents = fullTables.summary.data.deathEvents ?? [];
  const playerDetails = fullTables.summary.data.playerDetails;
  // Quem curou de fato na noite, pelo balde da WCL — não pelo roster. A
  // Ligiaf está cadastrada como dps e passou a noite de 15/09 curando; usar
  // o cadastro daria a ela um quinhão que não é dela.
  const curaDoRaide = players
    .map((player) => {
      const papeis = findPlayerRoles(playerDetails, player.profile.name);
      if (!papeis.includes('healers')) return null;

      const entrada = aggregateTables.healing.data.entries.find((item) =>
        sameCharacterName(item.name, player.profile.name)
      );
      if (!entrada) return null;

      // Proporcional ao tempo em que a pessoa esteve na luta. Sem isso,
      // quem jogou 1 de 12 trys aparece cobrindo quase nada e ainda dilui o
      // quinhão dos outros — foi o que aconteceu com o voidsurge em 15/09.
      const presenca = cooldownsByPlayer?.get(player.id)?.possibleMs ?? aggregateDurationMs;
      const danoNoTempoDele =
        aggregateDurationMs > 0 ? raidDamageTaken * (presenca / aggregateDurationMs) : raidDamageTaken;

      const cobertura = calculateCobertura(entrada.total, danoNoTempoDele);
      return cobertura === undefined ? null : cobertura;
    })
    .filter((valor): valor is number => valor !== null);
  const result: NormalizedRunPlayer[] = [];

  for (const player of players) {
    const metricKey: "dps" | "hps" = player.role === "healer" ? "hps" : "dps";
    const entries = metricKey === "hps" ? aggregateTables.healing.data.entries : aggregateTables.damage.data.entries;

    const entry = entries.find((item) => sameCharacterName(item.name, player.profile.name));
    if (!entry || !entry.activeTime || aggregateDurationMs <= 0) continue;

    // Quem trocou de função entre as trys não tem dps/hps que signifique
    // nada: o dano das trys de dano acaba dividido pela duração da noite
    // inteira, incluindo as trys em que a pessoa estava curando. Some com
    // a métrica em vez de publicar um número deprimido.
    const roles = findPlayerRoles(playerDetails, player.profile.name);
    const trocouDeFuncao = roles.length > 1;

    const value = calculateMetricValue(entry.total, aggregateDurationMs);
    const deaths = countDeaths(deathEvents, player.profile.name);

    // A WCL só calcula percentil pra kill — wipe não tem. Então mesmo com o
    // agregado cobrindo a noite toda, o parse é o melhor entre os bosses
    // efetivamente mortos.
    //
    // A fonte é `report.rankings` (percentis DESTE relatório), não o ranking
    // global do personagem: conferido no CI, nenhum dos oito logs do core
    // aparece no ranking global, então o cruzamento por reportCode resultava
    // sempre vazio e a dimensão de maior peso nunca tinha dado.
    let bestRankPercent = findParse(parseByPlayer ?? new Map(), player.profile.name)?.parse;

    // Caminho antigo, mantido como reserva: se algum dia os logs passarem a
    // ser rankeados globalmente, ele ainda encontra o parse.
    if (bestRankPercent === undefined) {
      for (const ranking of rankings) {
        if (ranking.metric !== metricKey) continue;
        if (!sameCharacterName(ranking.characterName, player.profile.name)) continue;

        for (const rank of ranking.ranks) {
          if (rank.report.code !== reportCode) continue;
          if (!aggregateFightIds.includes(rank.report.fightID)) continue;
          if (bestRankPercent === undefined || rank.rankPercent > bestRankPercent) {
            bestRankPercent = rank.rankPercent;
          }
        }
      }
    }

    const checklist = resolvePreparationChecklist?.(player.id);
    const resultadoPreparacao = checklist
      ? calculatePreparation(findCombatantInfo(playerDetails, player.profile.name), checklist)
      : undefined;
    const preparation = resultadoPreparacao?.score;
    const preparationChecks = resultadoPreparacao?.checks.filter((c) => c.ratio !== undefined).length;
    // Junta o que faltou nas duas checagens, sem repetir slot (os dois anéis
    // viram um "Anel" só na tela).
    const preparationMissing = resultadoPreparacao
      ? [...new Set(resultadoPreparacao.checks.flatMap((check) => check.missing ?? []))]
      : undefined;
    // Peça a peça, com o slot junto — é o que separa "anel sem encanto" de
    // "anel sem gema", e o que enxerga quem encantou UMA das duas armas.
    const preparationSlots = resultadoPreparacao?.slots;

    // Mesma regra do dps/hps: quem trocou de função entre as trys tem
    // cooldowns de duas specs diferentes misturados na mesma média, e a
    // nota não significaria nada. Some com a dimensão em vez de publicar
    // um número diluído.
    // O denominador do uptime é o tempo em que a pessoa esteve presente,
    // não a noite inteira: quem entrou na metade da raide teria uptime pela
    // metade sem ter feito nada errado. Sem a coleta de eventos não dá pra
    // saber em que trys ela estava, e aí a noite toda é o melhor palpite.
    const cooldownsDoJogador = cooldownsByPlayer?.get(player.id);
    // Mesmo denominador do uptime: o tempo em que a pessoa esteve na luta,
    // pra o DTPS de quem jogou meia noite não sair pela metade.
    const tempoNaLuta = cooldownsDoJogador?.possibleMs ?? aggregateDurationMs;
    const ataque = trocouDeFuncao
      ? undefined
      : buildAttack(
          calculateUptime(entry.activeTime, cooldownsDoJogador?.possibleMs ?? aggregateDurationMs),
          cooldownsDoJogador
        );

    // ----- cura e contribuição fora de função -----
    const entradaDeCura = aggregateTables.healing.data.entries.find((item) =>
      sameCharacterName(item.name, player.profile.name)
    );
    const entradaDeDano = aggregateTables.damage.data.entries.find((item) =>
      sameCharacterName(item.name, player.profile.name)
    );

    // Auto-cura sai do campo `targets` da tabela de cura. Ele vem truncado
    // nos 5 maiores, o que basta: num tank ele mesmo é sempre o primeiro.
    const autoCura =
      entradaDeCura?.targets?.find((alvo) =>
        sameCharacterName(alvo.name ?? '', player.profile.name)
      )?.total ?? 0;

    const defesa = buildDefense(
      damageTakenByPlayer?.get(player.id),
      tempoNaLuta,
      cooldownsDoJogador,
      autoCura
    );

    // "Ajudar": a mesma conta de recarga, sobre a lista curada de utilidade
    // de grupo. Ausente quando a spec não tem nenhuma — ausente, não zero.
    const ajuda = buildAjudar(cooldownsDoJogador);

    const danoDoRaideNoTempoDele =
      aggregateDurationMs > 0
        ? raidDamageTaken * (tempoNaLuta / aggregateDurationMs)
        : raidDamageTaken;

    const cura = roles.includes('healers')
      ? buildHealing(
          { effective: entradaDeCura?.total ?? 0, overheal: entradaDeCura?.overheal ?? 0 },
          danoDoRaideNoTempoDele,
          curaDoRaide
        )
      : undefined;

    // "Fora de função" é decidido pelo BALDE DA WCL, não pelo cadastro. A
    // Ligiaf está cadastrada como dps e curou a noite de 15/09 inteira: pelo
    // cadastro, os 153k de HPS dela virariam "contribuição fora de função",
    // quando eram o trabalho dela. Quem aparece nos dois baldes não tem
    // nada fora de função — fez as duas coisas de verdade.
    // Sem papel no log não há "fora de função": ausência de informação não
    // pode virar afirmação.
    const segundos = tempoNaLuta / 1000;
    const offRole =
      segundos > 0 && roles.length > 0
        ? {
            ...(!roles.includes('dps') && entradaDeDano?.total
              ? { dps: Math.round(entradaDeDano.total / segundos) }
              : {}),
            ...(!roles.includes('healers') && entradaDeCura?.total
              ? { hps: Math.round(entradaDeCura.total / segundos) }
              : {}),
          }
        : {};

    const noite = nightDetailByPlayer?.get(player.id);

    result.push({
      playerId: player.id,
      ...(trocouDeFuncao ? {} : { [metricKey]: Math.round(value) }),
      parse: bestRankPercent !== undefined ? Math.round(bestRankPercent) : undefined,
      itemLevel: entry.itemLevel,
      deaths,
      preparation,
      ...(preparationMissing?.length ? { preparationMissing } : {}),
      ...(preparationChecks ? { preparationChecks } : {}),
      ...(preparationSlots?.length ? { preparationSlots } : {}),
      // Guardadas separadas pra que somar os consumíveis do Wipefest seja
      // idempotente: sem base fixa, cada execução empurrava a nota.
      ...(preparation !== undefined ? { preparationGear: preparation } : {}),
      ...(preparationMissing?.length ? { preparationMissingGear: preparationMissing } : {}),
      ...(ataque ? { attack: ataque.attack, attackDetail: ataque.attackDetail } : {}),
      ...(defesa ? { defense: defesa.defense, defenseDetail: defesa.defenseDetail } : {}),
      ...(ajuda ? { help: ajuda.help, helpDetail: ajuda.helpDetail } : {}),
      ...(bossKillsByPlayer?.get(player.id)?.length
        ? { bossKills: bossKillsByPlayer.get(player.id) }
        : {}),
      ...(cura ? { healing: cura.healing } : {}),
      ...(Object.keys(offRole).length > 0 ? { offRole } : {}),
      ...(noite
        ? {
            tries: noite.tries,
            bossTries: noite.bossTries,
            deathCost: noite.deathCost,
            deathSignature: noite.deathSignature,
          }
        : {}),
      ...(trashShareByPlayer?.has(player.id)
        ? { trashShare: trashShareByPlayer.get(player.id) }
        : {}),
      ...(specsByPlayer?.get(player.id)?.length ? { specs: specsByPlayer.get(player.id) } : {}),
      ...(utilityByPlayer?.has(player.id) ? { utility: utilityByPlayer.get(player.id) } : {}),
    });
  }

  return result;
}
