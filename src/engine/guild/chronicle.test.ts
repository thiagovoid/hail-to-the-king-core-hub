import { describe, expect, it } from "vitest";
import { buildSeasonChronicle } from "./chronicle";
import type { WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import type { Boss } from "../../types/index";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 60, direction: "higher" },
  preparation: { target: 60, direction: "higher" },
};


function boss(overrides: Partial<Boss>): Boss {
  return {
    id: "boss",
    name: "Boss",
    encounterID: 1,
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

describe("buildSeasonChronicle", () => {
  it("counts raids, pulls and kills across both difficulties", () => {
    const weeks: WeeklyPerformance[] = [
      { week: 1, runs: [{ date: "2026-08-18", players: [] }] },
      { week: 2, runs: [{ date: "2026-08-25", players: [] }, { date: "2026-08-27", players: [] }] },
    ];
    const bossesNormal = [boss({ id: "b1", status: "killed", pulls: 3 }), boss({ id: "b2", pulls: 5 })];
    const bossesHeroic = [boss({ id: "b1", pulls: 2 })];

    const chronicle = buildSeasonChronicle("Midnight Season 2", weeks, bossesNormal, bossesHeroic, [], TARGETS);

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
              { playerId: "voidwar", parse: 60, deaths: 0 },
              { playerId: "blackwatch", parse: 30, deaths: 2 },
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
              { playerId: "voidwar", parse: 30, deaths: 4 },
              { playerId: "blackwatch", parse: 60, deaths: 0 },
            ],
          },
        ],
      },
    ];

    const chronicle = buildSeasonChronicle("Midnight Season 2", weeks, [], [], players, TARGETS);

    // parse vs meta 60: voidwar [100, 50] -> 75; blackwatch [50, 100] -> 75.
    // Empate — o que importa é que o cálculo cobre a temporada toda, não só a última run.
    expect(chronicle.mvp).not.toBeNull();
    expect(["voidwar", "blackwatch"]).toContain(chronicle.mvp?.playerId);
    expect(chronicle.mvp?.avgScore).toBe(75);
  });

  it("returns mvp: null when no run has scoreable data", () => {
    const chronicle = buildSeasonChronicle("Midnight Season 2", [], [], [], players, TARGETS);
    expect(chronicle.mvp).toBeNull();
  });
});
