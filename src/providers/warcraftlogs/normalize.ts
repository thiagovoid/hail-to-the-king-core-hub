/**
 * Normalization Layer for WarcraftLogs: pure functions that turn raw WCL
 * shapes into the fields the rest of the app already understands
 * (PlayerPerformance / PerformanceRun). No network calls in this file —
 * that's the point, it's what makes this testable without mocking the API.
 */

import { calculatePreparation, type PreparationChecklist, type WclCombatantInfo } from "./preparation";

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
    };
  };
}

export interface WclTableEntry {
  name: string;
  total: number;
  activeTime: number;
  itemLevel: number;
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
  players: Array<{ id: string; role: "tank" | "healer" | "dps"; profile: WclProfile }>;
  /**
   * Checklist de preparação **daquele jogador** — a recomendação é por spec,
   * não do raide inteiro. Ausente (ou devolvendo undefined) = a nota não é
   * calculada e fica undefined, em vez de sair zerada.
   */
  resolvePreparationChecklist?: (playerId: string) => PreparationChecklist | undefined;
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
    resolvePreparationChecklist,
  } = input;
  const deathEvents = fullTables.summary.data.deathEvents ?? [];
  const playerDetails = fullTables.summary.data.playerDetails;
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

    // A WCL só rankeia kill — wipe não tem percentil. Então mesmo com o
    // agregado cobrindo a noite toda, o parse é o melhor rank entre os
    // bosses efetivamente mortos (os ranks já vêm só desses fights).
    let bestRankPercent: number | undefined;
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

    const checklist = resolvePreparationChecklist?.(player.id);
    const preparation = checklist
      ? calculatePreparation(findCombatantInfo(playerDetails, player.profile.name), checklist).score
      : undefined;

    result.push({
      playerId: player.id,
      ...(trocouDeFuncao ? {} : { [metricKey]: Math.round(value) }),
      parse: bestRankPercent !== undefined ? Math.round(bestRankPercent) : undefined,
      itemLevel: entry.itemLevel,
      deaths,
      preparation,
    });
  }

  return result;
}
