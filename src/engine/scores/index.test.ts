import { describe, expect, it } from "vitest";
import { calculateOverallScore, funcaoEfetiva } from "./index";
import type { PlayerPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";

const HEALING = { score: 80, coverage: 20, share: 100, overheal: 25 };

/** Mesmas metas do core em data/seasons/midnight-s2/config.json. */
const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 60, direction: "higher" },
  healing: { target: 80, direction: "higher" },
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
    // Sem função informada, vale a régua de dps: parse 35 e mecânicas 25 têm
    // dado → denominador 60.
    const result = calculateOverallScore(
      { playerId: "voidwar", parse: 60, mechanics: { errors: 4 }, deaths: 0 },
      TARGETS
    );

    expect(dimension(result, "attack")?.score).toBeNull();
    expect(dimension(result, "preparation")?.score).toBeNull();
    // (100*35 + 50*25) / 60 = 79.16 → 79
    expect(result.overall).toBe(79);
  });

  it("não pontua mortes — elas saíram da contabilização", () => {
    const result = calculateOverallScore({ playerId: "voidwar", parse: 60, deaths: 16 }, TARGETS);

    expect(result.dimensions.map((d) => d.key)).toEqual([
      "parse",
      "mechanics",
      "attack",
      "defense",
      "healing",
      "preparation",
    ]);
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

// Healer cura, tank segura, dps bate — e a nota tem que refletir isso.
describe("pesos por função", () => {
  const base: PlayerPerformance = {
    playerId: "x",
    deaths: 0,
    parse: 30,
    mechanics: { errors: 2 },
    attack: { score: 70, uptime: 70, cooldowns: null },
    defense: { score: 30, mitigation: 40, dtps: 50_000 },
    preparation: 60,
  };

  const peso = (result: ReturnType<typeof calculateOverallScore>, chave: string) =>
    result.dimensions.find((d) => d.key === chave)?.weight;

  it("dá o maior peso a Defender no tank", () => {
    const r = calculateOverallScore(base, TARGETS, "tank");
    expect(peso(r, "defense")).toBe(30);
    expect(peso(r, "parse")).toBe(15);
  });

  it("dá o maior peso a Parse no dps", () => {
    const r = calculateOverallScore(base, TARGETS, "dps");
    expect(peso(r, "parse")).toBe(35);
    expect(peso(r, "defense")).toBe(10);
  });

  it("dá o maior peso a Curar no healer", () => {
    const r = calculateOverallScore({ ...base, healing: HEALING }, TARGETS, "healer");
    expect(peso(r, "healing")).toBe(30);
    expect(peso(r, "attack")).toBe(5);
  });

  it("mantém Mecânicas em 25 nas três funções", () => {
    for (const funcao of ["dps", "tank", "healer"] as const) {
      expect(peso(calculateOverallScore(base, TARGETS, funcao), "mechanics")).toBe(25);
    }
  });

  it("cada função soma 100 entre as dimensões que se aplicam a ela", () => {
    const somaDe = (funcao: "dps" | "tank" | "healer", performance: typeof base) =>
      calculateOverallScore(performance, TARGETS, funcao).dimensions.reduce(
        (soma, d) => soma + d.weight,
        0
      );

    // Curar tem peso 0 em dps e tank, então a soma das seis dá 100 do mesmo
    // jeito que a das cinco que se aplicam.
    expect(somaDe("dps", base)).toBe(100);
    expect(somaDe("tank", base)).toBe(100);
    expect(somaDe("healer", { ...base, healing: HEALING })).toBe(100);
  });

  // A Ligiaf está cadastrada como dps e passou a noite de 15/09 curando.
  // Medi-la com a régua de dps daria peso 20 ao que ela não fez.
  it("mede como healer quem curou, mesmo cadastrado como dps", () => {
    const r = calculateOverallScore({ ...base, healing: HEALING }, TARGETS, "dps");
    expect(peso(r, "healing")).toBe(30);
    expect(funcaoEfetiva({ ...base, healing: HEALING }, "dps")).toBe("healer");
  });

  it("cai na régua de dps quando ninguém informa a função", () => {
    expect(funcaoEfetiva(base)).toBe("dps");
  });
});
