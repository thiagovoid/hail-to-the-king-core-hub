import type { PlayerPerformance, PerformanceRun, WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import { calculateOverallScore } from "../scores";

export interface CoreAverages {
  dps: number | null;
  parse: number | null;
  deaths: number | null;
  mechanicErrors: number | null;
}

export interface CoreRankingEntry {
  playerId: string;
  playerName: string;
  /** Overall Performance Score (Score Engine) for the latest run, or null when there isn't enough data yet. */
  overall: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Most recent raid run across every week, or undefined when nothing has been recorded yet. */
function getLatestRun(weeks: WeeklyPerformance[]): PerformanceRun | undefined {
  const latestWeek = [...weeks].sort((a, b) => a.week - b.week).at(-1);
  if (!latestWeek || latestWeek.runs.length === 0) return undefined;

  return [...latestWeek.runs].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

function definedValues<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => value !== undefined);
}

/**
 * Team Analytics Engine: core-wide averages for the most recent raid run
 * (doc: "9. Team Analytics Engine" — DPS/Parse médio, mortes, erros
 * mecânicos). Scoped to the latest run, not the whole season, to match the
 * "this week" framing already used by weekly-highlights.
 *
 * "Mortes por boss" from the doc isn't included here: a run can span
 * several bosses and `PlayerPerformance` only tracks deaths per run, not
 * per encounter — that needs a data model change, not part of this pass.
 */
export function calculateCoreAverages(weeks: WeeklyPerformance[]): CoreAverages {
  const run = getLatestRun(weeks);
  if (!run) {
    return { dps: null, parse: null, deaths: null, mechanicErrors: null };
  }

  return {
    dps: average(definedValues(run.players.map((player) => player.dps))),
    parse: average(definedValues(run.players.map((player) => player.parse))),
    deaths: average(run.players.map((player) => player.deaths)),
    mechanicErrors: average(definedValues(run.players.map((player) => player.mechanics?.errors))),
  };
}

/**
 * Ranks every player by Overall Performance Score (Score Engine) for the
 * most recent run. A player without enough data for a score sorts last —
 * null is "unknown", never treated as a 0 that would bury them below a
 * genuinely bad score.
 */
export function buildCoreRanking(
  weeks: WeeklyPerformance[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>
): CoreRankingEntry[] {
  const run = getLatestRun(weeks);

  const entries: CoreRankingEntry[] = players.map((player) => {
    const performance: PlayerPerformance | undefined = run?.players.find(
      (entry) => entry.playerId === player.id
    );
    const overall = performance
      ? calculateOverallScore(performance, goalsByPlayerId[player.id]).overall
      : null;

    return { playerId: player.id, playerName: player.name, overall };
  });

  return entries.sort((a, b) => {
    if (a.overall === null) return b.overall === null ? 0 : 1;
    if (b.overall === null) return -1;
    return b.overall - a.overall;
  });
}
