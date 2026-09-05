import { describe, expect, it } from "vitest";
import { buildHallOfFame } from "./hallOfFame";
import type { WeeklyPerformance } from "../../types/performance";

const players = [
  { id: "voidwar", name: "Voidwar" },
  { id: "blackwatch", name: "Blackwatch" },
];

describe("buildHallOfFame", () => {
  it("picks the player with the single highest recorded parse", () => {
    const weeks: WeeklyPerformance[] = [
      {
        week: 1,
        runs: [
          {
            date: "2026-08-18",
            players: [
              { playerId: "voidwar", parse: 92, deaths: 0 },
              { playerId: "blackwatch", parse: 80, deaths: 0 },
            ],
          },
        ],
      },
    ];

    const hof = buildHallOfFame("S2", weeks, [], [], players, {});
    const bestParse = hof.entries.find((e) => e.key === "bestParse");

    expect(bestParse?.winner).toEqual({ playerId: "voidwar", playerName: "Voidwar", value: "92" });
  });

  it("requires at least 2 runs for fewest-deaths and evolution categories", () => {
    const weeks: WeeklyPerformance[] = [
      {
        week: 1,
        runs: [{ date: "2026-08-18", players: [{ playerId: "voidwar", deaths: 0, parse: 50 }] }],
      },
    ];

    const hof = buildHallOfFame("S2", weeks, [], [], players, {});

    expect(hof.entries.find((e) => e.key === "fewestDeaths")?.winner).toBeNull();
    expect(hof.entries.find((e) => e.key === "bestEvolution")?.winner).toBeNull();
  });

  it("computes parse evolution from the first to the last run, not just consecutive runs", () => {
    const weeks: WeeklyPerformance[] = [
      { week: 1, runs: [{ date: "2026-08-18", players: [{ playerId: "voidwar", parse: 50, deaths: 0 }] }] },
      { week: 2, runs: [{ date: "2026-08-25", players: [{ playerId: "voidwar", parse: 60, deaths: 0 }] }] },
      { week: 3, runs: [{ date: "2026-09-01", players: [{ playerId: "voidwar", parse: 75, deaths: 0 }] }] },
    ];

    const hof = buildHallOfFame("S2", weeks, [], [], players, {});
    const evolution = hof.entries.find((e) => e.key === "bestEvolution");

    // 50 -> 75 = +50%, not 60 -> 75 = +25%
    expect(evolution?.winner).toEqual({ playerId: "voidwar", playerName: "Voidwar", value: "+50%" });
  });

  it("reuses the Chronicle MVP calculation instead of duplicating it", () => {
    const weeks: WeeklyPerformance[] = [
      { week: 1, runs: [{ date: "2026-08-18", players: [{ playerId: "voidwar", deaths: 0 }] }] },
    ];
    const goals = { voidwar: { deaths: { metric: "deaths" as const, target: 0, direction: "lower" as const } } };

    const hof = buildHallOfFame("S2", weeks, [], [], players, goals);
    const mvp = hof.entries.find((e) => e.key === "mvp");

    expect(mvp?.winner).toEqual({ playerId: "voidwar", playerName: "Voidwar", value: "Score 100" });
  });
});
