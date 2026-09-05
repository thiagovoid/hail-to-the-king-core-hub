import type {
  PlayerPerformance,
  PlayerRunPerformance,
  WeeklyPerformance,
} from "../../types/performance";

const weekModules = import.meta.glob<{ default: WeeklyPerformance }>(
  "../../../data/performance/week-*.json",
  { eager: true }
);

/**
 * Returns all runs across all weeks, in chronological order
 * (sorted by week, then by date within the week).
 */
function getAllRuns(weeks: WeeklyPerformance[]) {
  return [...weeks]
    .sort((a, b) => a.week - b.week)
    .flatMap((week) =>
      [...week.runs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((run) => ({ week: week.week, run }))
    );
}

/**
 * Returns all performance records for a player across every run,
 * across every week, in chronological order.
 */
export function getPlayerHistory(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerRunPerformance[] {
  return getAllRuns(weeks).flatMap(({ week, run }) =>
    run.players
      .filter((player) => player.playerId === playerId)
      .map((player) => ({
        ...player,
        week,
        date: run.date,
        reportCode: run.reportCode,
      }))
  );
}

/**
 * Returns the most recent performance record for a player.
 */
export function getLatestPerformance(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerRunPerformance | undefined {
  const history = getPlayerHistory(weeks, playerId);

  return history.at(-1);
}

/**
 * Calculates how close a player is to their performance target.
 *
 * Example:
 * actual = 82,000
 * target = 105,000
 * result = 78
 */
export function calculateEfficiency(
  actual: number,
  target: number
): number {
  if (target <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((actual / target) * 100));
}

/**
 * Calculates percentage evolution between two values.
 *
 * Example:
 * previous = 50,000
 * current = 60,000
 * result = 20
 */
export function calculateEvolution(
  current: number,
  previous?: number
): number | null {
  if (previous === undefined || previous === 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Calculates the evolution of a player's DPS between two runs.
 */
export function calculateDpsEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.dps === undefined || previous?.dps === undefined) {
    return null;
  }

  return calculateEvolution(current.dps, previous.dps);
}

/**
 * Calculates the evolution of a player's HPS between two runs.
 */
export function calculateHpsEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.hps === undefined || previous?.hps === undefined) {
    return null;
  }

  return calculateEvolution(current.hps, previous.hps);
}

/**
 * Calculates the evolution of a player's Warcraft Logs parse.
 */
export function calculateParseEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.parse === undefined || previous?.parse === undefined) {
    return null;
  }

  return current.parse - previous.parse;
}

/**
 * Calculates the change in mechanic errors.
 *
 * Positive value means more errors.
 * Negative value means fewer errors.
 */
export function calculateMechanicEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (
    current.mechanics?.errors === undefined ||
    previous?.mechanics?.errors === undefined
  ) {
    return null;
  }

  return current.mechanics.errors - previous.mechanics.errors;
}

/**
 * Formats a numeric DPS/HPS value for display.
 *
 * Example:
 * 82000 -> "82.0k"
 * 105000 -> "105.0k"
 */
export function formatPerformanceValue(
  value?: number
): string {
  if (value === undefined) {
    return "-";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return value.toString();
}

/**
 * Calculates progress toward a performance goal.
 *
 * Higher:
 *   actual >= target → 100%
 *
 * Lower:
 *   actual <= target → 100%
 *
 * For lower goals where target is zero:
 *   actual === 0 → 100%
 *   actual > 0    → 0%
 */
export function calculateGoalProgress(
  actual: number,
  target: number,
  direction: 'higher' | 'lower'
): number {
  if (actual < 0 || target < 0) {
    return 0;
  }

  if (direction === 'higher') {
    if (target === 0) {
      return 100;
    }

    return Math.min(
      100,
      Math.round((actual / target) * 100)
    );
  }

  if (actual <= target) {
    return 100;
  }

  if (target === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((target / actual) * 100)
  );
}

/**
 * Builds a performance series for a specific metric across all
 * players in the core, one data point per raid run (not per week).
 *
 * Players without data for a given run simply do not receive a
 * data point for that run.
 */
export function getCorePerformanceSeries(
  weeks: WeeklyPerformance[],
  players: { id: string; name: string }[],
  metric: 'dps' | 'parse' | 'deaths' | 'mechanics'
) {
  const runs = getAllRuns(weeks);

  return players
    .map((player) => {
      const playerId = player.id;

      const data = runs.flatMap(({ run }) => {
        const performance = run.players.find(
          (item) => item.playerId === playerId
        );

        if (!performance) {
          return [];
        }

        let value: number | undefined;

        switch (metric) {
          case 'dps':
            value = performance.dps;
            break;

          case 'parse':
            value = performance.parse;
            break;

          case 'deaths':
            value = performance.deaths;
            break;

          case 'mechanics':
            value = performance.mechanics?.errors;
            break;
        }

        if (value === undefined) {
          return [];
        }

        return [
          {
            date: run.date,
            value,
          },
        ];
      });

      return {
        playerId,
        playerName: player.name,
        data,
      };
    })
    .filter((series) => series.data.length > 0);
}

/**
 * Measures how stable a set of values has been (e.g. a player's dps across
 * their last few runs), as a 0-100 score — 100 means no variation at all,
 * lower means more erratic. Based on the coefficient of variation
 * (standard deviation / mean), which is scale-independent so the same
 * function works for dps, parse, wipefestScore, etc. without normalizing
 * units first.
 *
 * Needs at least 2 values to mean anything; null otherwise (including when
 * the mean is 0, where "% variation" isn't a meaningful number).
 */
export function calculateConsistency(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const coefficientOfVariation = Math.sqrt(variance) / Math.abs(mean);

  return Math.max(0, Math.round(100 - coefficientOfVariation * 100));
}

/**
 * Percentage of recorded raid runs a player appears in, across every week.
 * Based on actual performance data (who WCL saw in each run), the same
 * source scripts/warcraftlogs/sync-roster-stats.ts already computes inline
 * to fill roster.json's static `warcraftLogs.attendance` field — this is
 * the same calculation, available for the engine to call directly instead
 * of only living in that one script.
 */
export function calculateAttendance(
  weeks: WeeklyPerformance[],
  playerId: string
): number {
  const runs = getAllRuns(weeks);
  if (runs.length === 0) {
    return 0;
  }

  const attended = runs.filter(({ run }) =>
    run.players.some((player) => player.playerId === playerId)
  ).length;

  return Math.round((attended / runs.length) * 100);
}

/**
 * Returns all available weekly performance datasets.
 */
export function getPerformanceWeeks(): WeeklyPerformance[] {
  return Object.values(weekModules)
    .map((mod) => mod.default)
    .sort((a, b) => a.week - b.week);
}
