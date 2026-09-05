import type { PlayerPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import { calculateGoalProgress } from "../metrics";

export type ScoreDimensionKey = "parse" | "mechanics" | "cooldowns" | "deaths" | "preparation";

export interface ScoreDimension {
  key: ScoreDimensionKey;
  label: string;
  /** Documented weight (Parse 30 / Mecânicas 25 / Cooldowns 20 / Deaths 15 / Preparação 10), out of 100. */
  weight: number;
  /**
   * 0-100 sub-score for this dimension, or null when the data behind it
   * isn't available yet (no goal set for the player, or the provider hasn't
   * populated it). A null dimension is excluded from the weighted average
   * entirely, never treated as a 0 — a missing metric should never drag the
   * score down just because we haven't wired it up yet.
   */
  score: number | null;
}

export interface OverallPerformanceScore {
  /** Weighted average of every available dimension, renormalized to 100. Null when none are available. */
  overall: number | null;
  dimensions: ScoreDimension[];
}

const DIMENSION_META: Record<ScoreDimensionKey, { label: string; weight: number }> = {
  parse: { label: "Parse", weight: 30 },
  mechanics: { label: "Mecânicas", weight: 25 },
  cooldowns: { label: "Cooldowns", weight: 20 },
  deaths: { label: "Mortes", weight: 15 },
  preparation: { label: "Preparação", weight: 10 },
};

/**
 * Score Engine: builds the Overall Performance Score, a single 0-100 summary
 * across Parse/Mecânicas/Cooldowns/Deaths/Preparação (see "8. Score Engine"
 * in the architecture doc).
 *
 * Parse and Deaths are scored as goal progress (0-100), not the raw metric —
 * same Metric → Goal → Assessment separation the Goal Engine already uses,
 * so a player with a harder goal isn't compared on an absolute scale.
 * Mecânicas reuses Wipefest's own 0-100 score directly instead: there's no
 * personal target to hit there, it's already normalized by the tool.
 *
 * Cooldowns and Preparação are always null today:
 * - Cooldowns needs `PlayerPerformance.uptime`, which the WoW Analyzer
 *   provider can't populate while blocked by Cloudflare (see
 *   providers/wowanalyzer/README.md).
 * - Preparação would come from Wipefest's "bonus" score (ready check,
 *   potions), which the provider already captures per fight but isn't
 *   propagated into the Unified Model yet (see providers/wipefest/README.md).
 *
 * Rather than assume a fixed 100-point denominator, a dimension without data
 * is dropped and its weight redistributed proportionally among the ones that
 * do have data. That keeps `overall` meaningful while Cooldowns/Preparação
 * are unavailable, and both start contributing automatically — without
 * touching this function — the moment their data source is wired in.
 */
export function calculateOverallScore(
  performance: PlayerPerformance,
  goals: PlayerPerformanceGoals | undefined
): OverallPerformanceScore {
  const dimensions: ScoreDimension[] = [
    {
      key: "parse",
      ...DIMENSION_META.parse,
      score:
        goals?.parse && performance.parse !== undefined
          ? calculateGoalProgress(performance.parse, goals.parse.target, goals.parse.direction)
          : null,
    },
    {
      key: "mechanics",
      ...DIMENSION_META.mechanics,
      score: performance.wipefestScore ?? null,
    },
    {
      key: "cooldowns",
      ...DIMENSION_META.cooldowns,
      score: performance.uptime ?? null,
    },
    {
      key: "deaths",
      ...DIMENSION_META.deaths,
      score: goals?.deaths
        ? calculateGoalProgress(performance.deaths, goals.deaths.target, goals.deaths.direction)
        : null,
    },
    {
      key: "preparation",
      ...DIMENSION_META.preparation,
      score: null,
    },
  ];

  const available = dimensions.filter(
    (dimension): dimension is ScoreDimension & { score: number } => dimension.score !== null
  );

  if (available.length === 0) {
    return { overall: null, dimensions };
  }

  const totalWeight = available.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weightedSum = available.reduce((sum, dimension) => sum + dimension.weight * dimension.score, 0);

  return { overall: Math.round(weightedSum / totalWeight), dimensions };
}
