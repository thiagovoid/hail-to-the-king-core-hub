import type { PlayerPerformance } from "../types/performance";

/**
 * Normalization Layer: assembles one player's PlayerPerformance record for a
 * run out of each provider's own partial contribution. Every provider keeps
 * normalizing its own raw shape independently (e.g. warcraftlogs/normalize.ts);
 * this is the one place those partial results get merged into the Unified
 * Model that data/weekly/performance/week-NN.json actually stores, so adding a new
 * provider (Wipefest, WoW Analyzer) never means touching what's already there.
 */
export interface PlayerPerformanceContributions {
  playerId: string;

  /** Deaths always come from the raid log (currently WarcraftLogs), never optional. */
  deaths: number;

  warcraftLogs?: Pick<PlayerPerformance, "dps" | "hps" | "parse" | "itemLevel">;
  wipefest?: Pick<PlayerPerformance, "wipefestScore" | "mechanics">;
  wowAnalyzer?: Pick<PlayerPerformance, "uptime">;
}

export function buildPlayerPerformance(contributions: PlayerPerformanceContributions): PlayerPerformance {
  const { playerId, deaths, warcraftLogs, wipefest, wowAnalyzer } = contributions;

  // `deaths` goes last: matches the key order the WCL-only pipeline already
  // wrote to data/weekly/performance/week-NN.json, so wiring this normalization
  // layer in doesn't produce a pure key-reorder diff on unchanged data.
  return {
    playerId,
    ...warcraftLogs,
    ...wipefest,
    ...wowAnalyzer,
    deaths,
  };
}
