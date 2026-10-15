import { describe, expect, it } from "vitest";

import { fatiarNoite, mapaDeRaides, raideDaNoite } from "./porRaide";

const BOSSES = [
  { encounterID: 3470, name: "Nek'zali, a Espiral de Almas", raid: "abismo" },
  { encounterID: 3421, name: "As Presas Gêmeas", raid: "abismo" },
  { encounterID: 3513, name: "Kith'ix", raid: "libertacao" },
];

const MAPA = mapaDeRaides(BOSSES);

describe("fatiarNoite", () => {
  it("separa trys e mortes pela raide de cada boss", () => {
    const fatias = fatiarNoite(
      {
        bossTries: [
          { encounterID: 3470, tries: 4, deaths: 2 },
          { encounterID: 3421, tries: 3, deaths: 1 },
          { encounterID: 3513, tries: 12, deaths: 5 },
        ],
        deaths: 8,
      },
      MAPA
    );

    expect(fatias.get("abismo")).toMatchObject({ tries: 7, deaths: 3 });
    expect(fatias.get("libertacao")).toMatchObject({ tries: 12, deaths: 5 });
  });

  it("somar as fatias devolve a noite — é o que torna o filtro honesto", () => {
    const noite = {
      bossTries: [
        { encounterID: 3470, tries: 4, deaths: 2 },
        { encounterID: 3513, tries: 12, deaths: 5 },
      ],
      deaths: 7,
    };

    const total = [...fatiarNoite(noite, MAPA).values()].reduce((s, f) => s + f.deaths, 0);

    expect(total).toBe(noite.deaths);
  });

  it("erros por try saem sobre as trys DAQUELA raide, não as da noite", () => {
    const fatias = fatiarNoite(
      {
        bossTries: [
          { encounterID: 3470, tries: 10, deaths: 0 },
          { encounterID: 3513, tries: 2, deaths: 0 },
        ],
        // 5 erros em 10 trys do Abismo; 6 em 2 trys da Libertação.
        mechanicsDetail: [
          { boss: "Nek'zali, a Espiral de Almas", tries: 5 },
          { boss: "Kith'ix", tries: 6 },
        ],
        mechanics: { errors: 0.9, tries: 12 },
      },
      MAPA
    );

    expect(fatias.get("abismo")?.mechanics).toBe(0.5);
    expect(fatias.get("libertacao")?.mechanics).toBe(3);
  });

  it("noite sem mecânica coletada devolve null, não zero", () => {
    const fatias = fatiarNoite(
      { bossTries: [{ encounterID: 3513, tries: 3, deaths: 1 }] },
      MAPA
    );

    expect(fatias.get("libertacao")?.mechanics).toBeNull();
  });

  it("raide em que o jogador não pisou não vira fatia", () => {
    const fatias = fatiarNoite(
      { bossTries: [{ encounterID: 3513, tries: 3, deaths: 0 }] },
      MAPA
    );

    expect(fatias.has("abismo")).toBe(false);
    expect([...fatias.keys()]).toEqual(["libertacao"]);
  });

  it("boss fora do cadastro é ignorado em vez de virar raide própria", () => {
    const fatias = fatiarNoite(
      {
        bossTries: [
          { encounterID: 3513, tries: 1, deaths: 0 },
          { encounterID: 3379, tries: 9, deaths: 4 },
        ],
      },
      MAPA
    );

    expect([...fatias.keys()]).toEqual(["libertacao"]);
    expect(fatias.get("libertacao")?.deaths).toBe(0);
  });
});

describe("raideDaNoite", () => {
  const noite = (encounterIDs: number[][]) =>
    encounterIDs.map((ids) => ({
      bossTries: ids.map((encounterID) => ({ encounterID, tries: 1, deaths: 0 })),
    }));

  it("noite inteira num tier é daquele tier", () => {
    expect(raideDaNoite(noite([[3470, 3421], [3470]]), MAPA)).toEqual({
      tipo: "uma",
      raide: "abismo",
    });
  });

  it("noite que encosta nos dois é mista, e não vira nenhum dos dois", () => {
    expect(raideDaNoite(noite([[3470], [3513]]), MAPA)).toEqual({
      tipo: "mista",
      raides: ["abismo", "libertacao"],
    });
  });

  it("noite sem boss cadastrado não chuta uma raide", () => {
    expect(raideDaNoite(noite([[3379]]), MAPA)).toEqual({ tipo: "sem-dado" });
    expect(raideDaNoite([], MAPA)).toEqual({ tipo: "sem-dado" });
  });
});
