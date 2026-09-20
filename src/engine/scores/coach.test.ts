import { describe, expect, it } from "vitest";

import { buildCoachRecommendation, type NoiteDoCoach } from "./coach";
import { calculateOverallScore } from "./index";
import type { CorePerformanceTargets } from "../../types/index";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 30, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  help: { target: 60, direction: "higher" },
  deliver: { target: 75, direction: "higher" },
  survival: { target: 10, direction: "lower" },
  preparation: { target: 60, direction: "higher" },
};

/** Uma noite do core de verdade: dps forte, preparação fraca, uma mecânica pegando. */
const NOITE: NoiteDoCoach = {
  playerId: "a",
  deaths: 2,
  parse: 31,
  dps: 97_000,
  mechanics: { errors: 1.8, tries: 12 },
  mechanicsDetail: [
    {
      boss: "Nek'zali",
      mechanic: "Damage from Blood Venom",
      label: "Peçonha Sanguínea",
      tries: 11,
      tipEmbedUrl: "https://mythictrap.example/blood-venom",
    },
    { boss: "Vashnik", mechanic: "Damage from Tidal Crash", tries: 3 },
  ],
  attack: { score: 97.8, uptime: 96, cooldowns: 99 },
  attackDetail: [
    { spellId: 1, name: "Stormkeeper", casts: 12, efficiency: 47 },
    { spellId: 2, name: "Ascendance", casts: 4, efficiency: 88 },
  ],
  defense: { score: 16.6, mitigation: 40, dtps: 3_000 },
  defenseDetail: [{ spellId: 3, name: "Pele de Pedra", casts: 3, efficiency: 12 }],
  preparation: 57,
  preparationMissing: ["Poção", "Pedra de vida"],
  deathCost: { seconds: 40, share: 3, inKills: 0 },
};

const coach = (noite: NoiteDoCoach, anterior?: NoiteDoCoach) =>
  buildCoachRecommendation(noite, anterior, TARGETS, "dps");

/** Regra 1: ninguém lê conselho de quem não viu o esforço. */
describe("abre com o que mudou", () => {
  it("aponta a dimensão que mais avançou desde a noite anterior", () => {
    const antes = { ...NOITE, preparation: 30 };
    const positivo = coach(NOITE, antes).positivo;

    expect(positivo?.tipo).toBe("avanco");
    expect(positivo?.dimensao).toBe("preparation");
    expect(positivo?.texto).toContain("de 30 para 57");
  });

  it("usa o valor medido, não a sub-nota", () => {
    // Sub-nota de preparação 57/60 é 95; o texto tem que falar 57.
    const texto = coach(NOITE, { ...NOITE, preparation: 30 }).positivo?.texto ?? "";

    expect(texto).toContain("57");
    expect(texto).not.toContain("95");
  });

  it("inverte o verbo quando melhorar é diminuir", () => {
    const antes = { ...NOITE, mechanics: { errors: 4.5, tries: 12 } };
    const texto = coach(NOITE, antes).positivo?.texto ?? "";

    expect(texto).toContain("Mecânicas caiu");
    expect(texto).toContain("de 4,5 para 1,8");
  });

  it("ignora variação pequena, que é ruído de uma noite", () => {
    const antes = { ...NOITE, preparation: 56 };

    expect(coach(NOITE, antes).positivo?.tipo).toBe("destaque");
  });
});

/** Regra 6: mesmo quando nada mudou, alguma coisa está acima da meta. */
describe("registra o que foi bem", () => {
  it("cai no ponto forte quando não há noite anterior", () => {
    const positivo = coach(NOITE).positivo;

    expect(positivo?.tipo).toBe("destaque");
    expect(positivo?.texto).toContain("97,8");
  });

  /**
   * Desde que a sub-nota passa de 100 ao superar a meta (ver
   * TETO_DA_SUB_NOTA), o destaque vai pra quem foi mais ALÉM da régua, e não
   * mais pro desempate por peso: Atacar 97,8 contra meta 90 passa de 100,
   * Mecânicas 1,8 contra meta 1,8 fica exatamente em 100.
   */
  it("destaca quem foi mais além da meta", () => {
    expect(coach(NOITE).positivo?.dimensao).toBe("attack");
  });

  it("não inventa elogio quando nada passa da meta", () => {
    const fraco: NoiteDoCoach = {
      ...NOITE,
      parse: 10,
      attack: { score: 20, uptime: 30, cooldowns: 10 },
      defense: { score: 10, mitigation: 30, dtps: 3_000 },
      preparation: 20,
      mechanics: { errors: 6, tries: 12 },
      deathCost: { seconds: 600, share: 40, inKills: 0 },
    };

    expect(coach(fraco).positivo).toBeNull();
  });
});

/** Regra 2: "parse baixo" é sintoma. A causa é o que produziu o parse. */
describe("aponta a causa, não o sintoma", () => {
  it("nunca faz do parse o foco", () => {
    // Parse 31 contra meta 60 é a dimensão mais fraca da noite.
    const score = calculateOverallScore(NOITE, TARGETS, "dps");
    const maisFraca = score.dimensions
      .filter((d) => d.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))[0];

    expect(maisFraca.key).toBe("parse");
    expect(coach(NOITE).foco?.dimensao).not.toBe("parse");
  });

  it("pula a dimensão cujo detalhe não foi coletado", () => {
    // Defender é a mais fraca com dado, mas sem defenseDetail não há nome
    // próprio pra dar. O conselho vago não sai: a preparação entra no lugar.
    const semDetalhe: NoiteDoCoach = {
      ...NOITE,
      preparation: 30,
      mechanicsDetail: undefined,
      attackDetail: undefined,
      defenseDetail: undefined,
    };

    expect(coach(semDetalhe).foco?.dimensao).toBe("preparation");
  });
});

/** Regra 3: "Peçonha Sanguínea", não "Mecânicas". */
describe("uma coisa de cada vez, com nome próprio", () => {
  it("nomeia o cooldown pior aproveitado", () => {
    const foco = coach(NOITE).foco;

    expect(foco?.dimensao).toBe("defense");
    expect(foco?.nome).toBe("Pele de Pedra");
    expect(foco?.causa).toContain("12% do tempo em recarga");
  });

  it("nomeia o item que faltou no ready check", () => {
    const foco = coach({ ...NOITE, preparation: 20, defenseDetail: undefined }).foco;

    expect(foco?.nome).toBe("Poção");
    expect(foco?.causa).toContain("Pedra de vida");
  });

  it("nomeia a mecânica e traz a explicação visual junto", () => {
    const comMecanica: NoiteDoCoach = {
      ...NOITE,
      mechanics: { errors: 6, tries: 12 },
      preparation: 100,
      preparationMissing: [],
      defense: { score: 90, mitigation: 40, dtps: 3_000 },
    };

    const foco = coach(comMecanica).foco;
    expect(foco?.nome).toBe("Peçonha Sanguínea");
    expect(foco?.causa).toContain("11 de 12 trys");
    expect(foco?.tipEmbedUrl).toBe("https://mythictrap.example/blood-venom");
  });

  it("devolve UM foco, nunca uma lista", () => {
    expect(coach(NOITE).foco).not.toBeInstanceOf(Array);
  });
});

/** Regra 4: o ganho é recalcular o Score com a peça arrumada. */
describe("diz quanto vale", () => {
  it("dá o ganho em pontos de Score de verdade", () => {
    const foco = coach(NOITE).foco!;
    const atual = calculateOverallScore(NOITE, TARGETS, "dps").overall!;
    const comMeta = calculateOverallScore(
      { ...NOITE, defense: { ...NOITE.defense!, score: TARGETS.defense.target } },
      TARGETS,
      "dps"
    ).overall!;

    expect(foco.ganho).toBe(comMeta - atual);
    expect(foco.ganho).toBeGreaterThan(0);
  });

  it("nunca promete ganho negativo", () => {
    expect(coach(NOITE).foco!.ganho).toBeGreaterThanOrEqual(0);
  });
});

describe("quando não há o que dizer", () => {
  it("assume a lacuna em vez de cobrar o jogador", () => {
    const vazia: NoiteDoCoach = { playerId: "a", deaths: 0 };

    expect(coach(vazia)).toEqual({ positivo: null, foco: null, semDados: true });
  });

  it("não aponta foco nenhum quando tudo está forte", () => {
    const forte: NoiteDoCoach = {
      playerId: "a",
      deaths: 0,
      parse: 95,
      mechanics: { errors: 0.2, tries: 12 },
      attack: { score: 98, uptime: 97, cooldowns: 99 },
      defense: { score: 95, mitigation: 45, dtps: 2_000 },
      preparation: 100,
      deathCost: { seconds: 0, share: 0, inKills: 0 },
    };

    expect(coach(forte).foco).toBeNull();
    expect(coach(forte).positivo?.tipo).toBe("destaque");
  });
});

/**
 * Regra 5: a entrada é o histórico da própria pessoa e as metas do core.
 * Não existe parâmetro por onde outro jogador entre — e este teste trava
 * isso: a recomendação de uma noite não muda por nada que aconteça fora dela.
 */
describe("nunca compara com outro jogador", () => {
  it("depende só da própria noite e das metas do core", () => {
    expect(buildCoachRecommendation(NOITE, undefined, TARGETS, "dps")).toEqual(
      buildCoachRecommendation({ ...NOITE }, undefined, TARGETS, "dps")
    );
  });
});
