import { describe, expect, it } from "vitest";
import { calculateOverallScore } from "./index";
import type { PlayerPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";

/** Mesmas metas do core em data/seasons/midnight-s2/config.json. */
const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  preparation: { target: 60, direction: "higher" },
};

const dimension = (score: ReturnType<typeof calculateOverallScore>, key: string) =>
  score.dimensions.find((d) => d.key === key);

describe("calculateOverallScore", () => {
  it("pontua cada dimensão como progresso contra a meta do core", () => {
    const performance: PlayerPerformance = {
      playerId: "voidwar",
      parse: 30,
      mechanics: { errors: 4 },
      attack: { score: 35, uptime: 35, cooldowns: null },
      preparation: 30,
      deaths: 0,
    };

    const result = calculateOverallScore(performance, TARGETS);

    // metade da meta em todas → 50 em todas
    expect(dimension(result, "parse")?.score).toBe(50);
    expect(dimension(result, "mechanics")?.score).toBe(50);
    expect(dimension(result, "attack")?.score).toBe(50);
    expect(dimension(result, "preparation")?.score).toBe(50);
    expect(result.overall).toBe(50);
  });

  it("dá 100 pra quem bate exatamente a meta, inclusive nas de 'quanto menor melhor'", () => {
    const result = calculateOverallScore(
      {
        playerId: "voidwar",
        parse: 60,
        mechanics: { errors: 2 },
        attack: { score: 70, uptime: 70, cooldowns: null },
        preparation: 60,
        deaths: 0,
      },
      TARGETS
    );

    expect(result.overall).toBe(100);
  });

  it("redistribui o peso das dimensões sem dado em vez de contá-las como zero", () => {
    // Só parse (peso 30) e mecânicas (peso 25) têm dado → denominador 55.
    const result = calculateOverallScore(
      { playerId: "voidwar", parse: 60, mechanics: { errors: 4 }, deaths: 0 },
      TARGETS
    );

    expect(dimension(result, "attack")?.score).toBeNull();
    expect(dimension(result, "preparation")?.score).toBeNull();
    // (100*30 + 50*25) / 55 = 77.27 → 77
    expect(result.overall).toBe(77);
  });

  it("não pontua mortes — elas saíram da contabilização", () => {
    const result = calculateOverallScore({ playerId: "voidwar", parse: 60, deaths: 16 }, TARGETS);

    expect(result.dimensions.map((d) => d.key)).toEqual(["parse", "mechanics", "attack", "preparation"]);
    expect(result.overall).toBe(100);
  });

  it("devolve overall null quando nenhuma dimensão tem dado", () => {
    const result = calculateOverallScore({ playerId: "voidwar", deaths: 3 }, TARGETS);

    expect(result.overall).toBeNull();
    expect(result.dimensions.every((d) => d.score === null)).toBe(true);
  });

  it("expõe a meta usada em cada dimensão pra UI conseguir explicar a nota", () => {
    const result = calculateOverallScore({ playerId: "voidwar", parse: 60, deaths: 0 }, TARGETS);

    expect(dimension(result, "parse")?.target).toEqual({ target: 60, direction: "higher" });
    expect(dimension(result, "mechanics")?.target).toEqual({ target: 2, direction: "lower" });
  });
});
