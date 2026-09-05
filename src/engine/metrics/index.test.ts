import { describe, expect, it } from "vitest";
import {
  calculateAttendance,
  calculateConsistency,
  calculateDpsEvolution,
  calculateEfficiency,
  calculateEvolution,
  calculateGoalProgress,
  calculateHpsEvolution,
  calculateMechanicEvolution,
  calculateParseEvolution,
  formatPerformanceValue,
  getCorePerformanceSeries,
  getLatestPerformance,
  getPlayerHistory,
} from "./index";
import type { WeeklyPerformance } from "../../types/performance";

describe("calculateEfficiency", () => {
  it("calculates percentage of target reached", () => {
    expect(calculateEfficiency(82000, 105000)).toBe(78);
  });

  it("caps at 100 when actual exceeds target", () => {
    expect(calculateEfficiency(120000, 100000)).toBe(100);
  });

  it("returns 0 for a non-positive target", () => {
    expect(calculateEfficiency(100, 0)).toBe(0);
  });
});

describe("calculateEvolution", () => {
  it("calculates percentage change between two values", () => {
    expect(calculateEvolution(60000, 50000)).toBe(20);
  });

  it("returns null when there is no previous value", () => {
    expect(calculateEvolution(60000, undefined)).toBeNull();
  });

  it("returns null when the previous value is 0 (division by zero)", () => {
    expect(calculateEvolution(60000, 0)).toBeNull();
  });
});

describe("calculateDpsEvolution / calculateHpsEvolution / calculateParseEvolution / calculateMechanicEvolution", () => {
  it("calculates dps evolution when both runs have dps", () => {
    expect(calculateDpsEvolution({ playerId: "p", deaths: 0, dps: 60000 }, { playerId: "p", deaths: 0, dps: 50000 })).toBe(20);
  });

  it("returns null for dps evolution when either run lacks dps (e.g. a healer)", () => {
    expect(calculateDpsEvolution({ playerId: "p", deaths: 0 }, { playerId: "p", deaths: 0, dps: 50000 })).toBeNull();
  });

  it("calculates hps evolution the same way", () => {
    expect(calculateHpsEvolution({ playerId: "p", deaths: 0, hps: 40000 }, { playerId: "p", deaths: 0, hps: 20000 })).toBe(100);
  });

  it("calculates parse evolution as a raw percentile-point difference, not a percentage", () => {
    expect(calculateParseEvolution({ playerId: "p", deaths: 0, parse: 90 }, { playerId: "p", deaths: 0, parse: 80 })).toBe(10);
  });

  it("calculates mechanic evolution as errors difference (positive = worse)", () => {
    expect(
      calculateMechanicEvolution(
        { playerId: "p", deaths: 0, mechanics: { errors: 3 } },
        { playerId: "p", deaths: 0, mechanics: { errors: 1 } }
      )
    ).toBe(2);
  });
});

describe("formatPerformanceValue", () => {
  it("formats values >= 1000 in k notation", () => {
    expect(formatPerformanceValue(82000)).toBe("82.0k");
  });

  it("leaves small values as-is", () => {
    expect(formatPerformanceValue(87)).toBe("87");
  });

  it("returns a dash for undefined", () => {
    expect(formatPerformanceValue(undefined)).toBe("-");
  });
});

describe("calculateGoalProgress", () => {
  it("caps a 'higher' goal at 100% once the target is reached", () => {
    expect(calculateGoalProgress(120000, 100000, "higher")).toBe(100);
  });

  it("calculates partial progress toward a 'higher' goal", () => {
    expect(calculateGoalProgress(75000, 100000, "higher")).toBe(75);
  });

  it("gives 100% for a 'lower' goal once actual is at or under target", () => {
    expect(calculateGoalProgress(2, 3, "lower")).toBe(100);
  });

  it("calculates partial progress toward a 'lower' goal when over target", () => {
    expect(calculateGoalProgress(4, 2, "lower")).toBe(50);
  });
});

const weeks: WeeklyPerformance[] = [
  {
    week: 1,
    runs: [
      { date: "2026-08-01", reportCode: "AAA", players: [{ playerId: "voidwar", deaths: 1, dps: 50000 }] },
      { date: "2026-08-03", reportCode: "BBB", players: [{ playerId: "voidwar", deaths: 0, dps: 55000 }] },
    ],
  },
  {
    week: 2,
    runs: [{ date: "2026-08-08", reportCode: "CCC", players: [{ playerId: "voidwar", deaths: 2, dps: 60000 }] }],
  },
];

describe("getPlayerHistory / getLatestPerformance", () => {
  it("returns every run for a player in chronological order across weeks", () => {
    const history = getPlayerHistory(weeks, "voidwar");
    expect(history.map((entry) => entry.date)).toEqual(["2026-08-01", "2026-08-03", "2026-08-08"]);
  });

  it("returns nothing for a player with no recorded runs", () => {
    expect(getPlayerHistory(weeks, "nobody")).toEqual([]);
  });

  it("returns the most recent run as the latest performance", () => {
    expect(getLatestPerformance(weeks, "voidwar")?.dps).toBe(60000);
  });

  it("returns undefined for a player with no history", () => {
    expect(getLatestPerformance(weeks, "nobody")).toBeUndefined();
  });
});

describe("getCorePerformanceSeries", () => {
  it("builds one data point per run a player appears in", () => {
    const series = getCorePerformanceSeries(weeks, [{ id: "voidwar", name: "Voidwar" }], "dps");
    expect(series).toEqual([
      {
        playerId: "voidwar",
        playerName: "Voidwar",
        data: [
          { date: "2026-08-01", value: 50000 },
          { date: "2026-08-03", value: 55000 },
          { date: "2026-08-08", value: 60000 },
        ],
      },
    ]);
  });

  it("omits players with no data points for the requested metric", () => {
    const series = getCorePerformanceSeries(weeks, [{ id: "nobody", name: "Nobody" }], "dps");
    expect(series).toEqual([]);
  });
});

describe("calculateConsistency", () => {
  it("returns 100 for perfectly identical values", () => {
    expect(calculateConsistency([50000, 50000, 50000])).toBe(100);
  });

  it("returns a lower score for more erratic values", () => {
    const stable = calculateConsistency([50000, 51000, 49000])!;
    const erratic = calculateConsistency([20000, 80000, 40000])!;
    expect(stable).toBeGreaterThan(erratic);
  });

  it("returns null with fewer than 2 values", () => {
    expect(calculateConsistency([50000])).toBeNull();
    expect(calculateConsistency([])).toBeNull();
  });

  it("returns null when the mean is 0", () => {
    expect(calculateConsistency([0, 0])).toBeNull();
  });
});

describe("calculateAttendance", () => {
  it("calculates the percentage of runs a player appears in", () => {
    expect(calculateAttendance(weeks, "voidwar")).toBe(100);
  });

  it("returns 0 for a player who attended no runs", () => {
    expect(calculateAttendance(weeks, "nobody")).toBe(0);
  });

  it("returns 0 when there are no runs at all", () => {
    expect(calculateAttendance([], "voidwar")).toBe(0);
  });

  it("calculates partial attendance across mixed runs", () => {
    const mixedWeeks: WeeklyPerformance[] = [
      {
        week: 1,
        runs: [
          { date: "2026-08-01", players: [{ playerId: "voidwar", deaths: 0 }] },
          { date: "2026-08-03", players: [{ playerId: "someone-else", deaths: 0 }] },
        ],
      },
    ];
    expect(calculateAttendance(mixedWeeks, "voidwar")).toBe(50);
  });
});
