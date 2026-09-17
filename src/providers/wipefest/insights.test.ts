import { describe, expect, it } from "vitest";
import { buildFightMechanics, extractCounts, limparMarkup, type WipefestApiFight } from "./insights";

/**
 * Recorte do `details` real do insight "Hit by Peçonha Viva" (report
 * JCvk27bDL6Zdm18j, fight 17): JSON com `@@@`/`|||` no lugar das chaves e
 * markup de cor no nome do jogador.
 */
const DETAILS_REAL =
  "<div data-component-type='BarChartTable' data-component-data='" +
  '@@@"columnDatas":[@@@"id":"player","title":"Player","type":"actor"|||,' +
  '@@@"id":"bar","title":"","type":"bar"|||,' +
  '@@@"id":"damage","title":"Damage","type":"text"|||,' +
  '@@@"id":"hits","title":"Hits","type":"text"|||],' +
  '"rowDatas":[' +
  '@@@"player":@@@"markup":"@@@[style=\\"shaman\\"] Gunst|||","id":1|||,"bar":@@@"value":1139671|||,' +
  '"damage":@@@"text":"1.1m"|||,"hits":@@@"text":"5"||||||,' +
  '@@@"player":@@@"markup":"@@@[style=\\"priest\\"] Ligiaf|||","id":2|||,"bar":@@@"value":983240|||,' +
  '"damage":@@@"text":"983k"|||,"hits":@@@"text":"8"||||||]|||' +
  "'></div>";

/** Valores reais da Ligiaf no fight 17 — conferidos contra o card da tela. */
const FIGHT: WipefestApiFight = {
  report: { friendlies: [{ id: 15, name: "Ligiaf" }] },
  insightConfigs: [
    { id: "10", group: "3445", name: "Damage from Living Venom", statistics: [{ name: "Hits", higherIsBetter: false }] },
    { id: "20", group: "3445", name: "Unstable Miasma soaks", statistics: [{ name: "Soaks", higherIsBetter: true }] },
    { id: "30", group: "raid", name: "Ready Check (Flask, Gear, etc.)", statistics: [{ name: "Score", higherIsBetter: true }] },
    { id: "40", group: "3445", name: "Damage from Blood Venom", statistics: [{ name: "Hits", higherIsBetter: false }] },
  ],
  insights: [{ id: "10", group: "3445", title: "Hit by Peçonha Viva 43 times.", details: DETAILS_REAL }],
  playerValues: [
    {
      playerId: 15,
      totalValue: 91,
      totalBonus: 7,
      values: [
        { insightId: "10", insightGroup: "3445", value: 76, isBonus: false },
        { insightId: "40", insightGroup: "3445", value: 100, isBonus: false },
        { insightId: "20", insightGroup: "3445", value: 0, isBonus: true },
        { insightId: "30", insightGroup: "raid", value: 1, isBonus: true },
      ],
    },
  ],
};

describe("extractCounts", () => {
  it("lê a contagem por jogador da tabela embutida no details", () => {
    const { countColumn, byPlayer } = extractCounts(DETAILS_REAL);

    expect(countColumn).toBe("hits");
    expect(byPlayer).toEqual({ Gunst: 5, Ligiaf: 8 });
  });

  it("não usa dano como contagem — mesmo dano pode ser 1 hit ou 10", () => {
    expect(extractCounts(DETAILS_REAL).countColumn).not.toBe("damage");
  });

  it("insight sem tabela devolve vazio, não zero", () => {
    // Não saber quantas vezes é diferente de ter sido zero vezes.
    expect(extractCounts(undefined).byPlayer).toEqual({});
  });
});

describe("limparMarkup", () => {
  it("tira o estilo de classe do nome do jogador", () => {
    expect(limparMarkup('{[style="demon-hunter"] Heracranosx}')).toBe("Heracranosx");
  });
});

describe("buildFightMechanics", () => {
  const [ligiaf] = buildFightMechanics(FIGHT);

  it("conta como erro só o que não fechou 100", () => {
    expect(ligiaf.errors.map((e) => e.mechanic)).toEqual(["Damage from Living Venom"]);
  });

  it("ignora participação — ninguém leva falta por não usar poção ou não fazer soak", () => {
    // 'Unstable Miasma soaks' (0) e 'Ready Check' (1) são isBonus no Wipefest.
    const nomes = ligiaf.errors.map((e) => e.mechanic);
    expect(nomes).not.toContain("Unstable Miasma soaks");
    expect(nomes).not.toContain("Ready Check (Flask, Gear, etc.)");
  });

  it("traz quantas vezes, que é o que a nota 0-100 não dizia", () => {
    expect(ligiaf.errors[0]).toMatchObject({ value: 76, count: 8, countColumn: "hits" });
  });

  it("usa o nome canônico em inglês, não o título traduzido do log", () => {
    // O título era 'Hit by Peçonha Viva'; o nome do config é estável.
    expect(ligiaf.errors[0].mechanic).toBe("Damage from Living Venom");
  });

  it("conta mecânica de dano mesmo quando o Wipefest a põe no bônus", () => {
    // Caso real (Dagom, fight 17): coletar Toxic Droplets é participação, mas
    // TOMAR dano deles é erro — e foi o que o matou. O Wipefest marca essa
    // segunda como isBonus, então filtrar por isBonus a deixava de fora.
    const comBonusDeDano = buildFightMechanics({
      ...FIGHT,
      insightConfigs: [
        ...FIGHT.insightConfigs!,
        { id: "50", group: "3445", name: "Damage from Toxic Droplets", statistics: [{ name: "Hits", higherIsBetter: false }] },
      ],
      playerValues: [
        {
          playerId: 15,
          totalValue: 50,
          totalBonus: 0,
          values: [{ insightId: "50", insightGroup: "3445", value: 0, isBonus: true }],
        },
      ],
    });

    expect(comBonusDeDano[0].errors.map((e) => e.mechanic)).toEqual(["Damage from Toxic Droplets"]);
  });

  it("não confunde mecânicas de grupos diferentes que dividem o mesmo id", () => {
    // No report real, id=3 é "Deaths" no grupo raid e "Average duration of
    // Mark of Blood" no grupo do encontro. Indexar só por id trocava o nome.
    const comColisao = buildFightMechanics({
      report: { friendlies: [{ id: 15, name: "Dagom" }] },
      insightConfigs: [
        { id: "3", group: "raid", name: "Deaths", statistics: [{ name: "Events", higherIsBetter: false }] },
        { id: "3", group: "3445", name: "Average duration of Mark of Blood", statistics: [{ name: "Duration", higherIsBetter: false }] },
      ],
      insights: [],
      playerValues: [
        {
          playerId: 15,
          totalValue: 50,
          totalBonus: 0,
          values: [{ insightId: "3", insightGroup: "3445", value: 1, isBonus: false }],
        },
      ],
    });

    expect(comColisao[0].errors.map((e) => e.mechanic)).toEqual(["Average duration of Mark of Blood"]);
  });

  it("exclui Deaths — mortes saíram do score por decisão do projeto", () => {
    const comMorte = buildFightMechanics({
      report: { friendlies: [{ id: 15, name: "Dagom" }] },
      insightConfigs: [{ id: "3", group: "raid", name: "Deaths", statistics: [{ name: "Events", higherIsBetter: false }] }],
      insights: [],
      playerValues: [{ playerId: 15, totalValue: 50, totalBonus: 0, values: [{ insightId: "3", insightGroup: "raid", value: 1, isBonus: false }] }],
    });

    expect(comMorte[0].errors).toEqual([]);
  });

  it("mantém a nota geral do fight", () => {
    expect(ligiaf.score).toBe(91);
  });

  it("jogador sem erro fica com lista vazia, não some", () => {
    const semErro = buildFightMechanics({
      ...FIGHT,
      playerValues: [{ playerId: 15, totalValue: 100, totalBonus: 0, values: [{ insightId: "40", insightGroup: "3445", value: 100, isBonus: false }] }],
    });

    expect(semErro).toHaveLength(1);
    expect(semErro[0].errors).toEqual([]);
  });
});
