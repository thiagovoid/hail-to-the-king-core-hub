import { describe, expect, it } from "vitest";
import { calculateOverallScore, fatorDeSobrevivencia, funcaoEfetiva } from "./index";
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
  help: { target: 60, direction: "higher" },
  survival: { target: 10, direction: "lower" },
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
    // (100*35 + 50*25) / 60 = 79,16 → 79
    expect(result.overall).toBe(79);
  });

  /**
   * Contagem de mortes continua fora. O que pontua é o CUSTO delas — quanto
   * tempo o raide seguiu lutando sem você (ver deathCost). Dezesseis mortes
   * na call de wipe custam quase nada; uma no começo da luta custa tudo que
   * viria depois.
   */
  it("não pontua a contagem de mortes, só o custo", () => {
    const result = calculateOverallScore({ playerId: "voidwar", parse: 60, deaths: 16 }, TARGETS);

    expect(result.dimensions.map((d) => d.key)).toEqual([
      "parse",
      "mechanics",
      "attack",
      "defense",
      "healing",
      "survival",
      "help",
      "preparation",
    ]);
    // Sem deathCost, Sobreviver não tem dado e o peso é redistribuído.
    expect(result.overall).toBe(100);
  });

  it("cobra o custo da morte, não o número dela", () => {
    const caro = calculateOverallScore(
      { playerId: "a", parse: 60, deaths: 2, deathCost: { seconds: 900, share: 30, inKills: 0 } },
      TARGETS
    );
    const barato = calculateOverallScore(
      { playerId: "b", parse: 60, deaths: 12, deathCost: { seconds: 40, share: 1.2, inKills: 0 } },
      TARGETS
    );

    // Doze mortes na call de wipe valem mais que duas no meio da luta.
    expect(barato.overall!).toBeGreaterThan(caro.overall!);
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
    const maior = Math.max(...r.dimensions.map((d) => d.weight));

    expect(peso(r, "defense")).toBe(maior);
    expect(peso(r, "parse")!).toBeLessThan(peso(r, "defense")!);
  });

  it("dá o maior peso a Parse no dps", () => {
    const r = calculateOverallScore(base, TARGETS, "dps");
    const maior = Math.max(...r.dimensions.map((d) => d.weight));

    expect(peso(r, "parse")).toBe(maior);
    expect(peso(r, "defense")!).toBeLessThan(peso(r, "parse")!);
  });

  it("dá o maior peso a Curar no healer", () => {
    const r = calculateOverallScore({ ...base, healing: HEALING }, TARGETS, "healer");
    expect(peso(r, "healing")).toBe(35);
    expect(peso(r, "attack")).toBe(5);
  });

  it("mantém Mecânicas com o mesmo peso nas três funções", () => {
    for (const funcao of ["dps", "tank", "healer"] as const) {
      expect(peso(calculateOverallScore(base, TARGETS, funcao), "mechanics")).toBe(25);
    }
  });

  /**
   * Sobreviver não é parcela: peso zero de propósito. Medido nas 113 noites
   * da temporada, subir o peso de 15 pra 40 movia o Dagom de 70 pra 69 —
   * as outras dimensões batem no teto e absorvem. Ver fatorDeSobrevivencia.
   */
  it("não dá peso nenhum a Sobreviver — ela multiplica", () => {
    for (const funcao of ["dps", "tank", "healer"] as const) {
      expect(peso(calculateOverallScore(base, TARGETS, funcao), "survival")).toBe(0);
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
    expect(peso(r, "healing")).toBe(35);
    expect(funcaoEfetiva({ ...base, healing: HEALING }, "dps")).toBe("healer");
  });

  it("cai na régua de dps quando ninguém informa a função", () => {
    expect(funcaoEfetiva(base)).toBe("dps");
  });
});

describe("fatorDeSobrevivencia", () => {
  /**
   * Progressão tem morte. Dentro da meta do core não desconta nada — e a
   * call de wipe já custa perto de zero por construção (ver deathCost).
   */
  it("não desconta nada dentro da meta", () => {
    expect(fatorDeSobrevivencia(0, 10)).toBe(1);
    expect(fatorDeSobrevivencia(10, 10)).toBe(1);
  });

  it("desconta o excesso, ponto a ponto", () => {
    // 30% morto com meta 10% deixa a nota valendo 80% do que valia.
    expect(fatorDeSobrevivencia(30, 10)).toBeCloseTo(0.8);
    expect(fatorDeSobrevivencia(15, 10)).toBeCloseTo(0.95);
  });
});

describe("Sobreviver multiplica, não soma", () => {
  const cheio: PlayerPerformance = {
    playerId: "a",
    deaths: 0,
    parse: 60,
    mechanics: { errors: 2 },
    attack: { score: 70, uptime: 70, cooldowns: 70 },
    defense: { score: 60, mitigation: 40, dtps: 1000 },
    preparation: 60,
  };

  it("deixa a nota intacta de quem ficou dentro da meta", () => {
    const r = calculateOverallScore(
      { ...cheio, deathCost: { seconds: 10, share: 3, inKills: 0 } },
      TARGETS
    );

    expect(r.survivalFactor).toBe(1);
    expect(r.overall).toBe(r.beforeSurvival);
  });

  /**
   * O ponto da mudança. A melhor preparação, o melhor dps e tudo em dia não
   * significam nada se a pessoa morreu no começo: o raide seguiu sem ela.
   */
  it("derruba a nota de quem passou a noite morto, mesmo com tudo em dia", () => {
    const r = calculateOverallScore(
      { ...cheio, deathCost: { seconds: 900, share: 30, inKills: 0 } },
      TARGETS
    );

    expect(r.beforeSurvival).toBe(100);
    expect(r.survivalFactor).toBeCloseTo(0.8);
    expect(r.overall).toBe(80);
  });

  // Log antigo, sem o dado de morte: não dá pra descontar o que não se sabe.
  it("não desconta quando a noite não tem o dado", () => {
    const r = calculateOverallScore(cheio, TARGETS);

    expect(r.survivalFactor).toBeNull();
    expect(r.overall).toBe(r.beforeSurvival);
  });
});
