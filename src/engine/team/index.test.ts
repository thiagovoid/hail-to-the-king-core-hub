import { describe, expect, it } from "vitest";
import { buildCoreRanking, calculateCoreAverages } from "./index";
import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";

const weeks: WeeklyPerformance[] = [
  {
    week: 1,
    runs: [
      {
        date: "2026-08-18",
        players: [
          { playerId: "voidwar", dps: 100000, parse: 80, deaths: 2, mechanics: { errors: 1 } },
          { playerId: "blackwatch", dps: 80000, parse: 60, deaths: 4 },
        ],
      },
    ],
  },
  {
    week: 2,
    runs: [
      {
        date: "2026-08-25",
        players: [
          { playerId: "voidwar", dps: 120000, parse: 90, deaths: 0 },
          { playerId: "blackwatch", dps: 90000, parse: 70, deaths: 2 },
        ],
      },
    ],
  },
];

describe("calculateCoreAverages", () => {
  it("averages every metric across the latest run only", () => {
    const result = calculateCoreAverages(weeks);

    expect(result).toEqual({ dps: 105000, parse: 80, deaths: 1, mechanicErrors: null });
  });

  it("returns all null when there are no runs yet", () => {
    expect(calculateCoreAverages([])).toEqual({ dps: null, parse: null, deaths: null, mechanicErrors: null });
  });
});

describe("buildCoreRanking", () => {
  const players = [
    { id: "voidwar", name: "Voidwar" },
    { id: "blackwatch", name: "Blackwatch" },
    { id: "benched", name: "Benched" },
  ];

  it("ranks by Overall Performance Score descending, using the latest run", () => {
    const goals: Record<string, PlayerPerformanceGoals | undefined> = {
      voidwar: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
      blackwatch: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
    };

    const ranking = buildCoreRanking(weeks, players, goals);

    // voidwar: 0 deaths -> 100. blackwatch: 2 deaths, target 0 -> 0.
    expect(ranking[0]).toMatchObject({ playerId: "voidwar", overall: 100 });
    expect(ranking[1]).toMatchObject({ playerId: "blackwatch", overall: 0 });
  });

  it("sorts a player absent from the latest run last, not as a 0", () => {
    const goals: Record<string, PlayerPerformanceGoals | undefined> = {
      voidwar: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
      blackwatch: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
    };

    const ranking = buildCoreRanking(weeks, players, goals);

    expect(ranking.at(-1)?.playerId).toBe("benched");
    expect(ranking.at(-1)?.overall).toBeNull();
  });
});
