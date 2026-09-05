import { describe, expect, it } from "vitest";
import { buildCoachRecommendation } from "./coach";
import type { OverallPerformanceScore } from "./index";

function score(dimensions: OverallPerformanceScore["dimensions"]): OverallPerformanceScore {
  const scored = dimensions.filter((d) => d.score !== null);
  const overall = scored.length
    ? Math.round(scored.reduce((s, d) => s + d.weight * (d.score as number), 0) / scored.reduce((s, d) => s + d.weight, 0))
    : null;
  return { overall, dimensions };
}

describe("buildCoachRecommendation", () => {
  it("picks the weakest available dimension as the focus", () => {
    const result = buildCoachRecommendation(
      score([
        { key: "parse", label: "Parse", weight: 30, score: 90 },
        { key: "mechanics", label: "Mecânicas", weight: 25, score: 40 },
        { key: "cooldowns", label: "Cooldowns", weight: 20, score: null },
        { key: "deaths", label: "Mortes", weight: 15, score: 70 },
        { key: "preparation", label: "Preparação", weight: 10, score: null },
      ])
    );

    expect(result.focusKey).toBe("mechanics");
    expect(result.message).toMatch(/Mecânicas/);
  });

  it("recognizes rather than nags when every available dimension is strong", () => {
    const result = buildCoachRecommendation(
      score([
        { key: "parse", label: "Parse", weight: 30, score: 85 },
        { key: "mechanics", label: "Mecânicas", weight: 25, score: 100 },
        { key: "cooldowns", label: "Cooldowns", weight: 20, score: null },
        { key: "deaths", label: "Mortes", weight: 15, score: 90 },
        { key: "preparation", label: "Preparação", weight: 10, score: null },
      ])
    );

    expect(result.message).toBe("Performance sólida em todas as frentes disponíveis. Continue assim.");
  });

  it("returns a null focus when no dimension has data", () => {
    const result = buildCoachRecommendation(
      score([
        { key: "parse", label: "Parse", weight: 30, score: null },
        { key: "mechanics", label: "Mecânicas", weight: 25, score: null },
        { key: "cooldowns", label: "Cooldowns", weight: 20, score: null },
        { key: "deaths", label: "Mortes", weight: 15, score: null },
        { key: "preparation", label: "Preparação", weight: 10, score: null },
      ])
    );

    expect(result.focusKey).toBeNull();
    expect(result.focusLabel).toBeNull();
  });
});
