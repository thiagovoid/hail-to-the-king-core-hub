import { describe, expect, it } from "vitest";
import {
  buildPlayerSeasonAverage,
  calculateAttendance,
  calculateTrend,
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

describe("calculateTrend", () => {
  it("mede evolução, não regularidade: quem sobe muito tem tendência alta", () => {
    // Kroline na temporada real: 17k -> 130k. A antiga consistência dava 55.
    const subindo = calculateTrend([17352, 93000, 80800, 124326, 130000])!;
    // Minort real: estável e baixo. A antiga consistência dava 98.
    const estavel = calculateTrend([43162, 41542])!;

    expect(subindo).toBeGreaterThan(100);
    expect(estavel).toBeLessThan(5);
    expect(subindo).toBeGreaterThan(estavel);
  });

  it("devolve negativo pra série em queda", () => {
    expect(calculateTrend([100000, 80000, 60000])).toBeLessThan(0);
  });

  it("devolve ~0 pra série plana", () => {
    expect(calculateTrend([50000, 50000, 50000])).toBe(0);
  });

  it("usa todos os pontos, não só primeiro e último — uma noite ruim no fim não inverte o sinal", () => {
    // primeiro-vs-último daria negativo; a reta ainda sobe.
    expect(calculateTrend([50000, 90000, 100000, 110000, 49000])).toBeGreaterThan(0);
  });

  it("devolve null com menos de 2 pontos ou média 0", () => {
    expect(calculateTrend([50000])).toBeNull();
    expect(calculateTrend([])).toBeNull();
    expect(calculateTrend([0, 0])).toBeNull();
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

describe('buildPlayerSeasonAverage', () => {
  const history = [
    { playerId: 'p', week: 1, date: '2026-08-18', dps: 100000, parse: 40, deaths: 4, itemLevel: 300 },
    { playerId: 'p', week: 2, date: '2026-08-25', dps: 120000, deaths: 2, itemLevel: 310 },
    { playerId: 'p', week: 3, date: '2026-09-01', dps: 140000, parse: 80, deaths: 0 },
  ];

  it('tira média de cada métrica só entre as runs em que ela existe', () => {
    const average = buildPlayerSeasonAverage('p', history);

    expect(average.dps).toBe(120000);
    // parse existe em 2 das 3 runs: (40 + 80) / 2
    expect(average.parse).toBe(60);
    expect(average.deaths).toBe(2);
    expect(average.runs).toBe(3);
  });

  it('usa a preparação da última noite, não a média — é estado, não desempenho', () => {
    // Quem arrumou o gear esta semana não pode seguir penalizado pelas
    // semanas em que estava sem encanto.
    const comPreparacao = [
      { playerId: 'p', week: 1, date: '2026-09-01', deaths: 0, preparation: 20 },
      { playerId: 'p', week: 2, date: '2026-09-08', deaths: 0, preparation: 60 },
      { playerId: 'p', week: 3, date: '2026-09-15', deaths: 0, preparation: 100 },
    ];

    expect(buildPlayerSeasonAverage('p', comPreparacao).preparation).toBe(100);
  });

  it('ignora noite sem preparação e pega a última que tem', () => {
    const comLacuna = [
      { playerId: 'p', week: 2, date: '2026-09-08', deaths: 0, preparation: 75 },
      { playerId: 'p', week: 3, date: '2026-09-15', deaths: 0 },
    ];

    expect(buildPlayerSeasonAverage('p', comLacuna).preparation).toBe(75);
  });

  it('usa o último item level registrado, não a média — é estado atual', () => {
    expect(buildPlayerSeasonAverage('p', history).itemLevel).toBe(310);
  });

  it('deixa a métrica undefined quando nenhuma run tem o dado', () => {
    const average = buildPlayerSeasonAverage('p', history);

    expect(average.hps).toBeUndefined();
    expect(average.mechanics).toBeUndefined();
    expect(average.uptime).toBeUndefined();
    expect(average.preparation).toBeUndefined();
  });

  it('devolve um registro vazio (sem runs) sem quebrar', () => {
    const average = buildPlayerSeasonAverage('p', []);

    expect(average.runs).toBe(0);
    expect(average.deaths).toBe(0);
    expect(average.dps).toBeUndefined();
  });
});
