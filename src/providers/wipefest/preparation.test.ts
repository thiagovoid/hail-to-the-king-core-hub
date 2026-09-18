import { describe, expect, it } from "vitest";
import { buildFightPreparation, type WipefestApiFight } from "./insights";
import { aggregateNightPreparation, combinePreparation } from "./normalizeMechanics";

/** Valores reais do fight 17 (report JCvk27bDL6Zdm18j). */
const FIGHT: WipefestApiFight = {
  report: { friendlies: [{ id: 1, name: "Kams" }, { id: 2, name: "Heracranosx" }] },
  insightConfigs: [
    { id: "3", group: "raid", name: "Deaths", statistics: [{ name: "Events", higherIsBetter: false }] },
    { id: "4", group: "raid", name: "Ready Check (Flask, Gear, etc.)", statistics: [{ name: "Score", higherIsBetter: true }] },
    { id: "1", group: "raid", name: "Potions", statistics: [{ name: "Total", higherIsBetter: true }] },
    { id: "0", group: "raid", name: "Healthstone / Healing Potion", statistics: [{ name: "Casts", higherIsBetter: true }] },
    { id: "9", group: "3445", name: "Damage from Blood Venom", statistics: [{ name: "Hits", higherIsBetter: false }] },
  ],
  playerValues: [
    {
      playerId: 1,
      totalValue: 51,
      totalBonus: 13,
      interval: { unit: "EntireFight" },
      values: [
        { insightId: "3", insightGroup: "raid", value: 100, isBonus: false },
        { insightId: "4", insightGroup: "raid", value: 13, isBonus: true },
        { insightId: "1", insightGroup: "raid", value: 0, isBonus: true },
        { insightId: "0", insightGroup: "raid", value: 100, isBonus: false },
        { insightId: "9", insightGroup: "3445", value: 20, isBonus: false },
      ],
    },
    {
      playerId: 2,
      totalValue: 54,
      totalBonus: 87,
      interval: { unit: "EntireFight" },
      values: [
        { insightId: "4", insightGroup: "raid", value: 87, isBonus: true },
        { insightId: "1", insightGroup: "raid", value: 100, isBonus: true },
        { insightId: "0", insightGroup: "raid", value: 100, isBonus: false },
      ],
    },
  ],
};

describe("buildFightPreparation", () => {
  const porJogador = buildFightPreparation(FIGHT);

  it("pega os consumíveis do grupo raid", () => {
    const kams = porJogador.find((p) => p.player === "Kams");

    expect(kams?.itens.map((i) => i.nome).sort()).toEqual([
      "Healthstone / Healing Potion",
      "Potions",
      "Ready Check (Flask, Gear, etc.)",
    ]);
  });

  it("deixa Deaths de fora — mortes saíram do score", () => {
    const kams = porJogador.find((p) => p.player === "Kams");

    expect(kams?.itens.map((i) => i.nome)).not.toContain("Deaths");
  });

  it("ignora mecânica de encontro — aquilo é erro mecânico, não preparação", () => {
    const kams = porJogador.find((p) => p.player === "Kams");

    expect(kams?.itens.map((i) => i.nome)).not.toContain("Damage from Blood Venom");
  });

  it("só o recorte do fight inteiro, não os cortes por morte", () => {
    const comRecortes = buildFightPreparation({
      ...FIGHT,
      playerValues: [
        ...FIGHT.playerValues!,
        {
          playerId: 1,
          totalValue: 90,
          totalBonus: 90,
          interval: { unit: "Death" },
          values: [{ insightId: "1", insightGroup: "raid", value: 100, isBonus: true }],
        },
      ],
    });

    expect(comRecortes.filter((p) => p.player === "Kams")).toHaveLength(1);
  });
});

describe("aggregateNightPreparation", () => {
  it("tira média entre as trys — poção é por pull e flask cai", () => {
    const noite = [
      { players: [{ player: "Kams", itens: [{ nome: "Potions", value: 0 }] }] },
      { players: [{ player: "Kams", itens: [{ nome: "Potions", value: 100 }] }] },
    ];

    expect(aggregateNightPreparation(noite).Kams.score).toBe(50);
  });

  it("diz em português o que faltou", () => {
    const noite = [{ players: buildFightPreparation(FIGHT) }];

    expect(aggregateNightPreparation(noite).Kams.missing).toEqual(["Poção", "Flask/comida"]);
  });

  it("quem fez tudo não aparece com pendência", () => {
    const noite = [
      {
        players: [
          {
            player: "Voidwar",
            itens: [
              { nome: "Potions", value: 100 },
              { nome: "Ready Check (Flask, Gear, etc.)", value: 100 },
            ],
          },
        ],
      },
    ];

    const r = aggregateNightPreparation(noite).Voidwar;
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it("ordena do pior pro melhor — o que mais falta vem primeiro", () => {
    const noite = [
      {
        players: [
          {
            player: "Kams",
            itens: [
              { nome: "Ready Check (Flask, Gear, etc.)", value: 60 },
              { nome: "Potions", value: 10 },
            ],
          },
        ],
      },
    ];

    expect(aggregateNightPreparation(noite).Kams.missing).toEqual(["Poção", "Flask/comida"]);
  });

  it("informa quantos itens entraram — é o peso na combinação com o gear", () => {
    const noite = [{ players: buildFightPreparation(FIGHT) }];

    expect(aggregateNightPreparation(noite).Kams.itens).toBe(3);
  });

  it("noite sem dado devolve vazio, sem quebrar", () => {
    expect(aggregateNightPreparation([])).toEqual({});
  });
});

describe("combinePreparation", () => {
  it("pondera pelo número de checagens de cada fonte", () => {
    // 2 checagens de gear a 100 + 3 de consumível a 0 = 200/5 = 40.
    expect(combinePreparation({ score: 100, checks: 2 }, { score: 0, itens: 3 })).toBe(40);
  });

  it("vale o que existe quando uma das fontes falta", () => {
    // Spec sem gema no guia, ou log sem dado do Wipefest: nunca zero.
    expect(combinePreparation({ score: 88, checks: 2 }, undefined)).toBe(88);
    expect(combinePreparation(undefined, { score: 70, itens: 3 })).toBe(70);
  });

  it("sem nenhuma fonte fica undefined, não zero", () => {
    expect(combinePreparation(undefined, undefined)).toBeUndefined();
    expect(combinePreparation({ score: 90, checks: 0 }, undefined)).toBeUndefined();
  });
});
