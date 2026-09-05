import { describe, expect, it } from "vitest";
import { calculateCoreHealth } from "./coreHealth";
import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import type { Boss } from "../../types/index";

const players = [
  { id: "voidwar", name: "Voidwar" },
  { id: "blackwatch", name: "Blackwatch" },
];

const goals: Record<string, PlayerPerformanceGoals | undefined> = {
  voidwar: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
  blackwatch: { deaths: { metric: "deaths", target: 0, direction: "lower" } },
};

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

describe("calculateCoreHealth", () => {
  it("returns green performance/attendance when the core shows up and scores well", () => {
    const weeks: WeeklyPerformance[] = [
      {
        week: 1,
        runs: [
          {
            date: "2026-09-01",
            players: [
              { playerId: "voidwar", deaths: 0 },
              { playerId: "blackwatch", deaths: 0 },
            ],
          },
        ],
      },
    ];

    const health = calculateCoreHealth(weeks, players, goals, [], []);
    const performance = health.categories.find((c) => c.key === "performance");
    const attendance = health.categories.find((c) => c.key === "attendance");

    expect(performance?.status).toBe("green");
    expect(attendance?.status).toBe("green");
  });

  it("marks performance unknown when nobody has a scoreable dimension", () => {
    const health = calculateCoreHealth([], players, {}, [], []);
    expect(health.categories.find((c) => c.key === "performance")?.status).toBe("unknown");
  });

  it("flags progression red when the current boss has 10+ pulls with no kill", () => {
    const bossesNormal = [boss({ id: "b1", status: "killed", pulls: 3 }), boss({ id: "b2", pulls: 12 })];

    const health = calculateCoreHealth([], [], {}, bossesNormal, []);
    const progression = health.categories.find((c) => c.key === "progression");

    expect(progression?.status).toBe("red");
    expect(progression?.detail).toContain("12 pull(s)");
  });

  it("marks progression green when every boss on the active difficulty is killed", () => {
    const bossesNormal = [boss({ id: "b1", status: "killed", pulls: 3 })];

    const health = calculateCoreHealth([], [], {}, bossesNormal, []);
    expect(health.categories.find((c) => c.key === "progression")?.status).toBe("green");
  });

  it("uses heroic as the active difficulty once any heroic pull has happened", () => {
    const bossesNormal = [boss({ id: "b1", status: "killed", pulls: 3 })];
    const bossesHeroic = [boss({ id: "b1", pulls: 6 })];

    const health = calculateCoreHealth([], [], {}, bossesNormal, bossesHeroic);
    const progression = health.categories.find((c) => c.key === "progression");

    expect(progression?.status).toBe("yellow");
    expect(progression?.detail).toContain("6 pull(s)");
  });
});
