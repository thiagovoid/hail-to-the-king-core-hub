import type {
  PlayerPerformance,
  WeeklyPerformance,
} from "@/types/performance";

export interface CorePerformancePoint {
  week: number;
  value: number;
}

export interface CorePerformanceSeries {
  playerId: string;
  data: CorePerformancePoint[];
}

/**
 * Returns the performance history of all players
 * for a specific metric.
 */
export function getCorePerformanceSeries(
  weeks: WeeklyPerformance[],
  metric: keyof Pick<
    PlayerPerformance,
    "dps" | "hps" | "parse" | "itemLevel"
  >
): CorePerformanceSeries[] {
  const players = new Map<string, CorePerformanceSeries>();

  [...weeks]
    .sort((a, b) => a.week - b.week)
    .forEach((week) => {
      week.players.forEach((player) => {
        const value = player[metric];

        if (typeof value !== "number") {
          return;
        }

        if (!players.has(player.playerId)) {
          players.set(player.playerId, {
            playerId: player.playerId,
            data: [],
          });
        }

        players.get(player.playerId)!.data.push({
          week: week.week,
          value,
        });
      });
    });

  return Array.from(players.values());
}