import type { DataProvider, ProviderResult } from "../types";

export interface RaiderIoProfileContext {
  region: string;
  realm: string;
  name: string;
  /**
   * Extra `fields` to request from the Raider.IO profile endpoint beyond the
   * defaults it always returns (race, thumbnail_url). Example:
   * ["mythic_plus_scores_by_season:current", "mythic_plus_best_runs", "mythic_plus_ranks"]
   */
  fields?: string[];
}

export interface RaiderIoRawProfile {
  race?: string;
  thumbnail_url?: string;
  mythic_plus_scores_by_season?: Array<{ scores?: { all?: number } }>;
  mythic_plus_best_runs?: Array<{ dungeon: string; mythic_level: number }>;
  mythic_plus_ranks?: { overall?: { realm?: number } };
  [key: string]: unknown;
}

/**
 * Public API, no credential needed (https://raider.io/api). Used both when
 * drafting a new roster entry (race/avatar) and when syncing profile stats
 * (IO score, best run, realm rank) — same endpoint, different `fields`.
 */
export class RaiderIoProvider implements DataProvider<RaiderIoProfileContext, RaiderIoRawProfile | null> {
  readonly name = "raiderio";

  async fetch(context: RaiderIoProfileContext): Promise<ProviderResult<RaiderIoRawProfile | null>> {
    const fieldsParam = context.fields?.length ? `&fields=${context.fields.join(",")}` : "";
    const url = `https://raider.io/api/v1/characters/profile?region=${encodeURIComponent(
      context.region
    )}&realm=${encodeURIComponent(context.realm)}&name=${encodeURIComponent(context.name)}${fieldsParam}`;

    let raw: RaiderIoRawProfile | null = null;
    try {
      const response = await fetch(url);
      if (response.ok) {
        raw = (await response.json()) as RaiderIoRawProfile;
      }
    } catch {
      raw = null;
    }

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  }
}
