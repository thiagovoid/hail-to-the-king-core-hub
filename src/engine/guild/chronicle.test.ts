import { describe, expect, it } from "vitest";
import { buildSeasonChronicle } from "./chronicle";
import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import type { Boss } from "../../types/index";

function boss(overrides: Partial<Boss>): Boss {
  return {
    id: "boss",
    name: "Boss",
    status: "not_started",
    pulls: 0,
    bestPullPercent: null,
    killDate: null,
    links: { warcraftLogs: null, wipefest: null, video: null },
    ...overrides,
  };
}

const players = [
  { id: "voidwar", name: "Voidwar" },
  { id: "blackwatch", name: "Blackwatch" },
];

const goals: Record<string, PlayerPerformanceGoals | undefined> = {
  voidwar: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
  blackwatch: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
};

describe("buildSeasonChronicle", () => {
  it("counts raids, pulls and kills across both difficulties", () => {
    const weeks: WeeklyPerformance[] = [
      { week: 1, runs: [{ date: "2026-08-18", players: [] }] },
      { week: 2, runs: [{ date: "2026-08-25", players: [] }, { date: "2026-08-27", players: [] }] },
    ];
    const bossesNormal = [boss({ id: "b1", status: "killed", pulls: 3 }), boss({ id: "b2", pulls: 5 })];
    const bossesHeroic = [boss({ id: "b1", pulls: 2 })];

    const chronicle = buildSeasonChronicle("Midnight Season 2", weeks, bossesNormal, bossesHeroic, [], {});

    expect(chronicle.raids).toBe(3);
    expect(chronicle.totalPulls).toBe(10);
    expect(chronicle.bossesKilled).toBe(1);
    expect(chronicle.totalBosses).toBe(3);
  });

  it("picks the MVP by average Overall Score across every run, not just the latest", () => {
    const weeks: WeeklyPerformance[] = [
      {
        week: 1,
        runs: [
          {
            date: "2026-08-18",
            players: [
              { playerId: "voidwar", deaths: 0 },
              { playerId: "blackwatch", deaths: 2 },
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
              { playerId: "voidwar", deaths: 4 },
              { playerId: "blackwatch", deaths: 0 },
            ],
          },
        ],
      },
    ];

    const chronicle = buildSeasonChronicle("Midnight Season 2", weeks, [], [], players, goals);

    // voidwar: [100, 0] -> avg 50. blackwatch: [0, 100] -> avg 50. Tied ->
    // whoever the sort/insertion order favors; what matters is both appear.
    expect(chronicle.mvp).not.toBeNull();
    expect(["voidwar", "blackwatch"]).toContain(chronicle.mvp?.playerId);
    expect(chronicle.mvp?.avgScore).toBe(50);
  });

  it("returns mvp: null when no run has scoreable data", () => {
    const chronicle = buildSeasonChronicle("Midnight Season 2", [], [], [], players, {});
    expect(chronicle.mvp).toBeNull();
  });
});
