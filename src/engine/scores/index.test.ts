import { describe, expect, it } from "vitest";
import { calculateOverallScore } from "./index";
import type { PlayerPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";

describe("calculateOverallScore", () => {
  it("renormalizes weight across the dimensions that have data (cooldowns/preparation stay unavailable)", () => {
    const performance: PlayerPerformance = {
      playerId: "voidwar",
      parse: 80,
      wipefestScore: 90,
      deaths: 0,
    };
    const goals: PlayerPerformanceGoals = {
      parse: { metric: "parse", target: 80, direction: "higher" },
      deaths: { metric: "deaths", target: 0, direction: "lower" },
    };

    const result = calculateOverallScore(performance, goals);

    // parse=100 (weight 30), mechanics=90 (weight 25), deaths=100 (weight 15)
    // -> (100*30 + 90*25 + 100*15) / (30+25+15) = 6750/70 = 96.43 -> 96
    expect(result.overall).toBe(96);

    const cooldowns = result.dimensions.find((dimension) => dimension.key === "cooldowns");
    const preparation = result.dimensions.find((dimension) => dimension.key === "preparation");
    expect(cooldowns?.score).toBeNull();
    expect(preparation?.score).toBeNull();
  });

  it("returns null overall when no dimension has data", () => {
    const performance: PlayerPerformance = { playerId: "voidwar", deaths: 0 };

    const result = calculateOverallScore(performance, undefined);

    expect(result.overall).toBeNull();
    expect(result.dimensions.every((dimension) => dimension.score === null)).toBe(true);
  });

  it("uses Wipefest's score directly for Mecânicas instead of goal progress", () => {
    const performance: PlayerPerformance = { playerId: "voidwar", wipefestScore: 77, deaths: 0 };

    const result = calculateOverallScore(performance, undefined);

    expect(result.dimensions.find((dimension) => dimension.key === "mechanics")?.score).toBe(77);
  });

  it("uses WoW Analyzer's uptime directly for Cooldowns once populated", () => {
    const performance: PlayerPerformance = { playerId: "voidwar", uptime: 82, deaths: 0 };

    const result = calculateOverallScore(performance, undefined);

    expect(result.dimensions.find((dimension) => dimension.key === "cooldowns")?.score).toBe(82);
    // Only cooldowns has data -> it alone carries the full weighted average.
    expect(result.overall).toBe(82);
  });

  it("scores deaths as goal progress, not the raw death count", () => {
    const performance: PlayerPerformance = { playerId: "voidwar", deaths: 2 };
    const goals: PlayerPerformanceGoals = { deaths: { metric: "deaths", target: 0, direction: "lower" } };

    const result = calculateOverallScore(performance, goals);

    expect(result.dimensions.find((dimension) => dimension.key === "deaths")?.score).toBe(0);
    expect(result.overall).toBe(0);
  });

  it("skips a dimension whose goal isn't set for the player", () => {
    const performance: PlayerPerformance = { playerId: "voidwar", parse: 80, deaths: 0 };

    const result = calculateOverallScore(performance, undefined);

    expect(result.dimensions.find((dimension) => dimension.key === "parse")?.score).toBeNull();
  });
});
