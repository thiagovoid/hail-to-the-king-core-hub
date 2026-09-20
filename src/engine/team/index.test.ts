import { describe, expect, it } from "vitest";
import { buildCoreRanking, calculateCoreAverages } from "./index";
import type { WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 60, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  help: { target: 60, direction: "higher" },
  deliver: { target: 75, direction: "higher" },
  survival: { target: 10, direction: "lower" },
  preparation: { target: 60, direction: "higher" },
};

const weeks: WeeklyPerformance[] = [
  {
    week: 1,
    runs: [
      {
        date: "2026-08-18",
        players: [
          { playerId: "voidwar", dps: 100000, parse: 80, simTarget: 125000, deaths: 2, mechanics: { errors: 1 } },
          { playerId: "blackwatch", dps: 80000, parse: 60, simTarget: 133333, deaths: 4 },
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
          { playerId: "voidwar", dps: 120000, parse: 90, simTarget: 133333, deaths: 0 },
          { playerId: "blackwatch", dps: 90000, parse: 70, simTarget: 128571, deaths: 2 },
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

  it("ordena pelo Score Geral (decrescente) usando a run mais recente", () => {
    const ranking = buildCoreRanking(weeks, players, TARGETS);

    // run mais recente, medida por Entregar (Parse saiu da nota): voidwar
    // entrega 90% do sim contra meta 75 e crava o teto; blackwatch entrega
    // 70% e fica em 93.
    expect(ranking[0]).toMatchObject({ playerId: "voidwar", overall: 100 });
    expect(ranking[1]).toMatchObject({ playerId: "blackwatch", overall: 93 });
  });

  it("joga pro fim quem não aparece na run mais recente, em vez de tratar como 0", () => {
    const ranking = buildCoreRanking(weeks, players, TARGETS);

    expect(ranking.at(-1)?.playerId).toBe("benched");
    expect(ranking.at(-1)?.overall).toBeNull();
  });
});
