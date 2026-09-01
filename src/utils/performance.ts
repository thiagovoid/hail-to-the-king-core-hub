import type {
  PlayerPerformance,
  WeeklyPerformance,
} from "../types/performance";

const weekModules = import.meta.glob<{ default: WeeklyPerformance }>(
  "../../data/performance/week-*.json",
  { eager: true }
);

/**
 * Returns all performance records for a player across the available weeks.
 */
export function getPlayerHistory(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerPerformance[] {
  return [...weeks]
    .sort((a, b) => a.week - b.week)
    .flatMap((week) =>
      week.players.filter((player) => player.playerId === playerId)
    );
}

/**
 * Returns the most recent performance record for a player.
 */
export function getLatestPerformance(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerPerformance | undefined {
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
 * Calculates the evolution of a player's DPS between two weeks.
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
 * Calculates the evolution of a player's HPS between two weeks.
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
 * Builds a performance series for a specific metric
 * across all players in the core.
 *
 * Players without data for a given week simply do not
 * receive a data point for that week.
 */
export function getCorePerformanceSeries(
  weeks: WeeklyPerformance[],
  players: { id: string; name: string }[],
  metric: 'dps' | 'parse' | 'deaths' | 'mechanics'
) {
  return players
    .map((player) => {
      const playerId = player.id;

      const data = weeks
        .slice()
        .sort((a, b) => a.week - b.week)
        .flatMap((week) => {
          const performance = week.players.find(
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
              week: week.week,
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
 * Returns all available weekly performance datasets.
 */
export function getPerformanceWeeks(): WeeklyPerformance[] {
  return Object.values(weekModules)
    .map((mod) => mod.default)
    .sort((a, b) => a.week - b.week);
}

export interface PerformanceTargets {
  dps?: number;
  hps?: number;
  parse?: number;
  deaths?: number;
  mechanics?: number;
}

export interface PlayerPerformance {
  playerId: string;
  dps?: number;
  hps?: number;
  parse?: number;
  deaths?: number;
  mechanics?: {
    errors: number;
  };
}

export interface WeeklyPerformance {
  week: number;
  players: PlayerPerformance[];
}

export interface PerformanceTargets {
  dps?: number;
  hps?: number;
  parse?: number;
  deaths?: number;
  mechanics?: number;
}

