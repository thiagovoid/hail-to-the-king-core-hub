import type { DataProvider, ProviderResult } from "../types";
import { wclGraphql } from "./client";
import type { WclFight, WclFightTables, WclProfile, WclRankingEntry } from "./normalize";

export interface WclReportRef {
  code: string;
  startTime: number;
  zone?: { id: number } | null;
  owner?: { id: number } | null;
}

/**
 * Context for the "give me everything about this report" fetch: which
 * report, and which encounters actually belong to the current raid tier
 * (a report can contain trash/other-zone fights we don't care about).
 */
export interface WarcraftLogsReportContext {
  reportCode: string;
  validEncounterIds: Set<number>;
}

export interface WarcraftLogsRawReportTables {
  fights: WclFight[];
  raidFights: WclFight[];
  killedFights: WclFight[];
  aggregateFightIds: number[];
  allFightIds: number[];
  aggregateTables: WclFightTables;
  fullTables: WclFightTables;
}

/**
 * Context for the ranking (parse) pass — run separately from `fetch()`
 * because who counts as "roster" for this report (including brand-new
 * characters discovered from its own tables) is only known after the first
 * pass runs across every report of the batch.
 */
export interface WarcraftLogsRankingContext {
  reportCode: string;
  aggregateFightIds: number[];
  killedEncounterIds: number[];
  players: Array<{ profile: WclProfile; metric: "dps" | "hps" }>;
}

export interface WarcraftLogsRawRankings {
  rankings: WclRankingEntry[];
}

/**
 * Raw-data access for WarcraftLogs. Every method here mirrors one GraphQL
 * query — no business rules, no normalization. `fetch()` is the DataProvider
 * entrypoint (one full report's fight/table data); the other methods are
 * building blocks the acquisition layer (report discovery, ranking pass)
 * composes on its own.
 */
export class WarcraftLogsProvider
  implements DataProvider<WarcraftLogsReportContext, WarcraftLogsRawReportTables>
{
  readonly name = "warcraftlogs";

  async resolveGuildId(name: string, serverSlug: string, serverRegion: string): Promise<number> {
    const data = await wclGraphql<{ guildData: { guild: { id: number } } }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        guildData {
          guild(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id
          }
        }
      }`,
      { name, serverSlug, serverRegion }
    );
    return data.guildData.guild.id;
  }

  async fetchRaidEncounterIds(zoneID: number): Promise<Set<number>> {
    const data = await wclGraphql<{ worldData: { zone: { encounters: Array<{ id: number }> } } }>(
      `query($zoneID: Int!) {
        worldData {
          zone(id: $zoneID) {
            encounters { id }
          }
        }
      }`,
      { zoneID }
    );
    return new Set(data.worldData.zone.encounters.map((encounter) => encounter.id));
  }

  async fetchGuildReports(guildId: number, startTime: number, endTime: number, zoneID: number): Promise<WclReportRef[]> {
    const data = await wclGraphql<{ reportData: { reports: { data: WclReportRef[] } } }>(
      `query($guildID: Int!, $startTime: Float, $endTime: Float) {
        reportData {
          reports(guildID: $guildID, startTime: $startTime, endTime: $endTime) {
            data { code startTime zone { id } }
          }
        }
      }`,
      { guildID: guildId, startTime, endTime }
    );
    return data.reportData.reports.data.filter((report) => report.zone?.id === zoneID);
  }

  async fetchUserReports(userID: number, startTime: number, endTime: number, zoneID: number): Promise<WclReportRef[]> {
    const data = await wclGraphql<{ reportData: { reports: { data: WclReportRef[] } } }>(
      `query($userID: Int!, $startTime: Float, $endTime: Float, $zoneID: Int) {
        reportData {
          reports(userID: $userID, startTime: $startTime, endTime: $endTime, zoneID: $zoneID) {
            data { code startTime zone { id } }
          }
        }
      }`,
      { userID, startTime, endTime, zoneID }
    );
    return data.reportData.reports.data;
  }

  async fetchReportMeta(code: string): Promise<WclReportRef | null> {
    const data = await wclGraphql<{ reportData: { report: WclReportRef | null } }>(
      `query($code: String!) {
        reportData {
          report(code: $code) {
            code
            startTime
            zone { id }
          }
        }
      }`,
      { code }
    );
    return data.reportData.report;
  }

  /**
   * Finds reports by character presence rather than guild/uploader — the
   * only way to reach personal/unlisted reports. Callers must decide which
   * of these to trust (see WCL_UPLOADER_USER_IDS in AUTOMACAO.md).
   */
  async fetchCharacterRecentReports(profile: WclProfile): Promise<WclReportRef[]> {
    const data = await wclGraphql<{
      characterData: { character: { recentReports?: { data: WclReportRef[] } } | null };
    }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            recentReports(limit: 20) {
              data { code startTime zone { id } owner { id } }
            }
          }
        }
      }`,
      { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region }
    );
    return data.characterData.character?.recentReports?.data ?? [];
  }

  async fetchReportFights(code: string): Promise<WclFight[]> {
    const data = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
      `query($code: String!) {
        reportData {
          report(code: $code) {
            fights { id encounterID name kill difficulty startTime endTime }
          }
        }
      }`,
      { code }
    );
    return data.reportData.report.fights;
  }

  /** Passing multiple fightIDs aggregates them (sum total, sum activeTime) — same as WCL's "All Kills" tab. */
  async fetchFightTables(code: string, fightIDs: number[]): Promise<WclFightTables> {
    const data = await wclGraphql<{ reportData: { report: WclFightTables } }>(
      `query($code: String!, $fightIDs: [Int]) {
        reportData {
          report(code: $code) {
            damage: table(fightIDs: $fightIDs, dataType: DamageDone)
            healing: table(fightIDs: $fightIDs, dataType: Healing)
            summary: table(fightIDs: $fightIDs, dataType: Summary)
          }
        }
      }`,
      { code, fightIDs }
    );
    return data.reportData.report;
  }

  async fetchEncounterRankings(
    profile: WclProfile,
    encounterID: number,
    metric: "dps" | "hps"
  ): Promise<{ ranks: WclRankingEntry["ranks"] } | null> {
    const data = await wclGraphql<{
      characterData: { character: { encounterRankings?: { ranks: WclRankingEntry["ranks"] } } | null };
    }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!, $encounterID: Int!, $metric: CharacterRankingMetricType) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            encounterRankings(encounterID: $encounterID, metric: $metric)
          }
        }
      }`,
      { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region, encounterID, metric }
    );
    return data.characterData.character?.encounterRankings ?? null;
  }

  /**
   * DataProvider entrypoint — pass 1: everything WCL knows about a report's
   * fights/tables. Does not include rankings (see `fetchRankings`), because
   * who to fetch rankings for isn't known until this pass runs across every
   * report in the batch (new characters get discovered from these tables).
   */
  async fetch(context: WarcraftLogsReportContext): Promise<ProviderResult<WarcraftLogsRawReportTables>> {
    const fights = await this.fetchReportFights(context.reportCode);
    const raidFights = fights.filter((fight) => context.validEncounterIds.has(fight.encounterID));
    const killedFights = raidFights.filter((fight) => fight.kill);

    // Numa noite 100% wipe (sem kill nenhum), agrega os wipes no lugar dos
    // kills — não existe "All Kills" pra comparar nesse caso.
    const aggregateFights = killedFights.length > 0 ? killedFights : raidFights;
    const aggregateFightIds = aggregateFights.map((fight) => fight.id);
    const allFightIds = raidFights.map((fight) => fight.id);

    const aggregateTables = await this.fetchFightTables(context.reportCode, aggregateFightIds);
    // Mortes e composição sempre olham pra run inteira (kills + wipes).
    const fullTables =
      aggregateFightIds.length === allFightIds.length
        ? aggregateTables
        : await this.fetchFightTables(context.reportCode, allFightIds);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: { fights, raidFights, killedFights, aggregateFightIds, allFightIds, aggregateTables, fullTables },
    };
  }

  /**
   * Pass 2: best rank percent (parse) per player, among the encounters their
   * run actually killed. Archived separately under
   * data/raw/warcraftlogs/<code>-rankings.json.
   */
  async fetchRankings(context: WarcraftLogsRankingContext): Promise<ProviderResult<WarcraftLogsRawRankings>> {
    const rankings: WclRankingEntry[] = [];

    for (const player of context.players) {
      for (const encounterID of context.killedEncounterIds) {
        const ranking = await this.fetchEncounterRankings(player.profile, encounterID, player.metric);
        rankings.push({
          characterName: player.profile.name,
          encounterID,
          metric: player.metric,
          ranks: ranking?.ranks ?? [],
        });
      }
    }

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: { rankings },
    };
  }
}
