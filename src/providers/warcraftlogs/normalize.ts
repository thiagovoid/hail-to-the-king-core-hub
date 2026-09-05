/**
 * Normalization Layer for WarcraftLogs: pure functions that turn raw WCL
 * shapes into the fields the rest of the app already understands
 * (PlayerPerformance / PerformanceRun). No network calls in this file —
 * that's the point, it's what makes this testable without mocking the API.
 */

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
 * dps/hps aggregate over the kills in a run (or the wipes, on a 100% wipe
 * night) — matches exactly what WCL's own "All Kills" tab shows.
 */
export function selectAggregateFights(raidFights: WclFight[], killedFights: WclFight[]): WclFight[] {
  return killedFights.length > 0 ? killedFights : raidFights;
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
}

export interface NormalizedRunPlayer {
  playerId: string;
  dps?: number;
  hps?: number;
  parse?: number;
  itemLevel: number;
  deaths: number;
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
}

/**
 * Builds the PlayerPerformance-shaped records for one run, given the raw
 * tables/rankings already fetched for that report. Pure — no network.
 */
export function buildRunPlayers(input: BuildRunPlayersInput): NormalizedRunPlayer[] {
  const { reportCode, aggregateFightIds, aggregateDurationMs, aggregateTables, fullTables, rankings, players } = input;
  const deathEvents = fullTables.summary.data.deathEvents ?? [];
  const result: NormalizedRunPlayer[] = [];

  for (const player of players) {
    const metricKey: "dps" | "hps" = player.role === "healer" ? "hps" : "dps";
    const entries = metricKey === "hps" ? aggregateTables.healing.data.entries : aggregateTables.damage.data.entries;

    const entry = entries.find((item) => sameCharacterName(item.name, player.profile.name));
    if (!entry || !entry.activeTime || aggregateDurationMs <= 0) continue;

    const value = calculateMetricValue(entry.total, aggregateDurationMs);
    const deaths = countDeaths(deathEvents, player.profile.name);

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

    result.push({
      playerId: player.id,
      [metricKey]: Math.round(value),
      parse: bestRankPercent !== undefined ? Math.round(bestRankPercent) : undefined,
      itemLevel: entry.itemLevel,
      deaths,
    });
  }

  return result;
}
