import { describe, expect, it } from "vitest";
import { aggregateNightMechanics, type FightMechanics } from "./normalizeMechanics";

const fight = (boss: string, kill: boolean, players: FightMechanics["players"]): FightMechanics => ({
  boss,
  kill,
  players,
});

describe("aggregateNightMechanics", () => {
  it("conta mecânicas distintas, não hits — 62 ticks numa poça é um erro só", () => {
    // Era o caso real: "Peçonha Sanguínea x62" virava 62 erros, e o número
    // media severidade em vez de decisões erradas.
    const noite = [
      fight("Sentinelas", true, [
        { player: "Heracranosx", score: 54, errors: [{ mechanic: "Blood Venom", value: 0, count: 62 }] },
      ]),
    ];

    expect(aggregateNightMechanics(noite).Heracranosx.errors).toBe(1);
  });

  it("guarda os hits no detalhe — lá severidade é o que interessa", () => {
    const noite = [
      fight("Sentinelas", true, [
        { player: "Heracranosx", score: 54, errors: [{ mechanic: "Blood Venom", value: 0, count: 62 }] },
      ]),
    ];

    expect(aggregateNightMechanics(noite).Heracranosx.byMechanic[0].hits).toBe(62);
  });

  it("tira média por try, não soma — noite longa não pode parecer pior", () => {
    // 4 mecânicas erradas em 2 trys = 2 por try. Somar daria 4 e puniria a
    // noite de progressão, que é onde se erra mais.
    const noite = [
      fight("Sentinelas", false, [
        {
          player: "Xúlio",
          score: 50,
          errors: [
            { mechanic: "Blood Venom", value: 0, count: 6 },
            { mechanic: "Living Venom", value: 0, count: 3 },
            { mechanic: "Toxic Droplets", value: 0, count: 9 },
          ],
        },
      ]),
      fight("Sentinelas", true, [
        { player: "Xúlio", score: 90, errors: [{ mechanic: "Blood Venom", value: 80, count: 2 }] },
      ]),
    ];

    expect(aggregateNightMechanics(noite).Xúlio).toMatchObject({ errors: 2, tries: 2 });
  });

  it("mantém uma casa decimal — 1,5 e 2 são jogadores diferentes", () => {
    const noite = [
      fight("Sentinelas", false, [
        {
          player: "Kams",
          score: 50,
          errors: [
            { mechanic: "Blood Venom", value: 0, count: 1 },
            { mechanic: "Living Venom", value: 0, count: 1 },
          ],
        },
      ]),
      fight("Sentinelas", true, [{ player: "Kams", score: 90, errors: [{ mechanic: "Blood Venom", value: 50, count: 1 }] }]),
    ];

    expect(aggregateNightMechanics(noite).Kams.errors).toBe(1.5);
  });

  it("conta wipe igual a kill — é onde o erro acontece", () => {
    const noite = [
      fight("Sentinelas", false, [{ player: "Kams", score: 40, errors: [{ mechanic: "Living Venom", value: 0, count: 8 }] }]),
      fight("Sentinelas", true, [{ player: "Kams", score: 100, errors: [] }]),
    ];

    expect(aggregateNightMechanics(noite).Kams.errors).toBe(0.5);
  });

  it("só divide pelas trys em que o jogador esteve", () => {
    // Quem chegou na segunda try não é medido pela primeira.
    const noite = [
      fight("Sentinelas", false, [{ player: "Gunst", score: 50, errors: [{ mechanic: "X", value: 0, count: 4 }] }]),
      fight("Sentinelas", false, [
        {
          player: "Gunst",
          score: 50,
          errors: [
            { mechanic: "X", value: 0, count: 4 },
            { mechanic: "Y", value: 0, count: 1 },
          ],
        },
        { player: "Kroline", score: 50, errors: [{ mechanic: "X", value: 0, count: 2 }] },
      ]),
    ];

    const resultado = aggregateNightMechanics(noite);
    expect(resultado.Gunst).toMatchObject({ errors: 1.5, tries: 2 });
    expect(resultado.Kroline).toMatchObject({ errors: 1, tries: 1 });
  });

  it("soma o detalhe em vez de mediar — 'x15 na noite' é o que interessa", () => {
    const noite = [
      fight("Sentinelas", false, [{ player: "Xúlio", score: 50, errors: [{ mechanic: "Blood Venom", value: 0, count: 6 }] }]),
      fight("Sentinelas", true, [{ player: "Xúlio", score: 50, errors: [{ mechanic: "Blood Venom", value: 0, count: 9 }] }]),
    ];

    expect(aggregateNightMechanics(noite).Xúlio.byMechanic).toEqual([
      { boss: "Sentinelas", mechanic: "Blood Venom", hits: 15 },
    ]);
  });

  it("separa a mesma mecânica em bosses diferentes", () => {
    const noite = [
      fight("Sentinelas", true, [{ player: "Ligiaf", score: 90, errors: [{ mechanic: "Living Venom", value: 76, count: 2 }] }]),
      fight("Nek'zali", true, [{ player: "Ligiaf", score: 90, errors: [{ mechanic: "Living Venom", value: 50, count: 3 }] }]),
    ];

    const detalhe = aggregateNightMechanics(noite).Ligiaf.byMechanic;
    expect(detalhe).toHaveLength(2);
    expect(detalhe[0]).toMatchObject({ boss: "Nek'zali", hits: 3 });
  });

  it("mecânica sem contagem vale 1 — não fechou 100, só não sabemos quantas vezes", () => {
    // Ignorar seria fingir que não houve erro; chutar mais seria inventar.
    const noite = [
      fight("Sentinelas", true, [{ player: "Dagom", score: 50, errors: [{ mechanic: "Mark of Blood", value: 1 }] }]),
    ];

    expect(aggregateNightMechanics(noite).Dagom.errors).toBe(1);
  });

  it("jogador sem erro nenhum fica com zero, e aparece", () => {
    const noite = [fight("Sentinelas", true, [{ player: "Voidwar", score: 100, errors: [] }])];

    expect(aggregateNightMechanics(noite).Voidwar).toMatchObject({ errors: 0, tries: 1, byMechanic: [] });
  });

  it("noite sem fights devolve vazio, sem quebrar", () => {
    expect(aggregateNightMechanics([])).toEqual({});
  });
});
