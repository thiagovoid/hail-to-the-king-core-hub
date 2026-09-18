import { describe, expect, it } from "vitest";
import { buildCoachRecommendation } from "./coach";
import type { OverallPerformanceScore, ScoreDimension, ScoreDimensionKey } from "./index";

const WEIGHTS: Record<ScoreDimensionKey, number> = {
  parse: 35,
  mechanics: 30,
  attack: 15,
  defense: 10,
  preparation: 10,
};

const LABELS: Record<ScoreDimensionKey, string> = {
  parse: "Parse",
  mechanics: "Mecânicas",
  attack: "Atacar",
  defense: "Defender",
  preparation: "Preparação",
};

/** Monta o score a partir de `{ dimensão: nota }`, preenchendo o resto do shape. */
function score(scores: Partial<Record<ScoreDimensionKey, number | null>>): OverallPerformanceScore {
  const dimensions: ScoreDimension[] = (Object.keys(WEIGHTS) as ScoreDimensionKey[]).map((key) => ({
    key,
    label: LABELS[key],
    weight: WEIGHTS[key],
    unit: `unidade de ${key}`,
    score: scores[key] ?? null,
    value: scores[key] ?? null,
    description: `descrição de ${key}`,
    source: `fonte de ${key}`,
    target: { target: 60, direction: "higher" as const },
  }));

  const available = dimensions.filter((dimension) => dimension.score !== null);
  const overall = available.length
    ? Math.round(
        available.reduce((sum, d) => sum + d.weight * (d.score as number), 0) /
          available.reduce((sum, d) => sum + d.weight, 0)
      )
    : null;

  return { overall, dimensions };
}

describe("buildCoachRecommendation", () => {
  it("escolhe a dimensão mais fraca entre as que têm dado", () => {
    const result = buildCoachRecommendation(score({ parse: 90, mechanics: 40, preparation: 70 }));

    expect(result.focusKey).toBe("mechanics");
    expect(result.message).toMatch(/Mecânicas/);
  });

  it("reconhece em vez de cobrar quando tudo que tem dado está forte", () => {
    const result = buildCoachRecommendation(score({ parse: 85, mechanics: 100, preparation: 90 }));

    expect(result.message).toBe("Performance sólida em todas as frentes disponíveis. Continue assim.");
  });

  it("devolve foco null quando nenhuma dimensão tem dado", () => {
    const result = buildCoachRecommendation(score({}));

    expect(result.focusKey).toBeNull();
    expect(result.focusLabel).toBeNull();
  });
});
