import { describe, expect, it } from "vitest";

import {
  MARGEM_SOBRE_A_MEDIANA,
  PISO_DA_META,
  mapaDeBosses,
  metasDeMecanicas,
} from "./metaDeMecanicas";
import type { PlayerPerformance } from "../types/performance";

const BOSS = 3445;
const OUTRO = 3470;

const url = (encounter: number) =>
  `https://www.mythictrap.com/en/embed-ability/x/y/z?insightId=${encounter}-V`;

/** Um jogador com `tomou` mecânicas ao longo de `trys` no boss. */
const jogador = (
  playerId: string,
  trys: number,
  tomou: number,
  encounter = BOSS
): PlayerPerformance =>
  ({
    playerId,
    mechanics: { errors: tomou / trys, tries: trys },
    bossTries: [{ encounterID: encounter, difficulty: 4, tries: trys, killed: true, flawless: false }],
    mechanicsDetail: tomou > 0 ? [{ boss: "X", mechanic: "Damage from X", label: "X", tipEmbedUrl: url(encounter), tries: tomou }] : [],
  }) as unknown as PlayerPerformance;

describe("metasDeMecanicas", () => {
  it("tira a meta da mediana do grupo, com a margem", () => {
    // Taxas 0,2 / 0,4 / 0,6 -> mediana 0,4 -> meta 0,4 × 0,95 = 0,38.
    // Mas o piso é 0,6, então todos ficam nele. Uso números maiores pra
    // medir a margem sem o piso interferir.
    const metas = metasDeMecanicas([
      jogador("a", 10, 10), // 1,0
      jogador("b", 10, 20), // 2,0
      jogador("c", 10, 30), // 3,0
    ]);

    expect(metas.get("b")).toBeCloseTo(2 * MARGEM_SOBRE_A_MEDIANA, 2);
    // Mesma luta, mesmos trys: a meta é igual pra todo mundo.
    expect(metas.get("a")).toBe(metas.get("b"));
    expect(metas.get("c")).toBe(metas.get("b"));
  });

  /**
   * Sem isto a referência sairia só de quem errou e viria alta demais: o
   * grupo pareceria pior do que foi e a meta afrouxaria junto.
   */
  it("conta quem esteve no boss e não errou como zero", () => {
    const comLimpos = metasDeMecanicas([
      jogador("a", 10, 0),
      jogador("b", 10, 0),
      jogador("c", 10, 30),
    ]);
    const soQuemErrou = metasDeMecanicas([jogador("c", 10, 30)]);

    expect(comLimpos.get("c")).toBeLessThan(soQuemErrou.get("c")!);
  });

  /**
   * Em 18/08 a mediana do grupo foi 0,44, e sem piso quem fez 0,75 erro por
   * try — menos de um erro por try — cairia de 115 pra 53. Isso é castigar
   * quem foi bem num grupo que foi ótimo.
   */
  it("não deixa a noite limpa virar navalha", () => {
    const metas = metasDeMecanicas([
      jogador("a", 10, 1),
      jogador("b", 10, 2),
      jogador("c", 10, 3),
    ]);

    expect(metas.get("a")).toBe(PISO_DA_META);
  });

  /**
   * Quem fez onze trys do boss difícil e um do fácil não pode ser medido
   * pela mistura de quem fez o contrário.
   */
  it("pondera a meta pelos trys que a pessoa fez em cada boss", () => {
    const quaseTudoNoDificil: PlayerPerformance = {
      playerId: "foco",
      mechanics: { errors: 1, tries: 12 },
      bossTries: [
        { encounterID: BOSS, tries: 11 },
        { encounterID: OUTRO, tries: 1 },
      ],
      mechanicsDetail: [
        { boss: "d", mechanic: "Damage from d", label: "d", tipEmbedUrl: url(BOSS), tries: 11 },
      ],
    } as unknown as PlayerPerformance;

    const metas = metasDeMecanicas([
      quaseTudoNoDificil,
      jogador("outro1", 11, 33, BOSS),
      jogador("outro2", 11, 33, BOSS),
      jogador("facil1", 11, 0, OUTRO),
      jogador("facil2", 11, 0, OUTRO),
    ]);

    // O boss difícil tem mediana 3,0 e o fácil 0. Quem fez 11 de 12 trys no
    // difícil tem que herdar quase inteira a régua do difícil.
    const esperado = ((3 * 11 + 0 * 1) / 12) * MARGEM_SOBRE_A_MEDIANA;
    expect(metas.get("foco")).toBeCloseTo(esperado, 1);
  });

  it("volta vazio quando não dá pra montar referência", () => {
    // Noite sem detalhe de mecânica nem trys por boss: quem chama cai na
    // meta fixa do arquivo da temporada, que é pior mas não é buraco.
    expect(metasDeMecanicas([])).toEqual(new Map());
    expect(
      metasDeMecanicas([{ playerId: "a", mechanics: { errors: 1 } } as PlayerPerformance])
    ).toEqual(new Map());
  });
});

describe("mapaDeBosses", () => {
  /**
   * O defeito que gerou este teste: parte dos registros do Wipefest vem sem
   * `insightId` na URL. Em 10/09 as 19 mecânicas do Ula'tek vieram assim, e
   * ficavam de fora da referência enquanto continuavam contando no `errors`
   * de cada um — denominador menor que o numerador, nota mais baixa por
   * defeito de parsing. Foi o que fez a implementação divergir da simulação.
   */
  it("resolve o boss pelo nome quando a URL não traz o id", () => {
    const comId = {
      boss: "Ula'tek",
      mechanic: "Damage from x",
      label: "x",
      tipEmbedUrl: url(BOSS),
      tries: 20,
    };
    const semId = { boss: "Ula'tek", mechanic: "Damage from y", label: "y", tipEmbedUrl: "", tries: 20 };

    const semana = {
      week: 1,
      runs: [
        {
          date: "2026-09-10",
          players: [
            {
              playerId: "a",
              mechanics: { errors: 1, tries: 10 },
              bossTries: [{ encounterID: BOSS, tries: 10 }],
              mechanicsDetail: [comId],
            },
            {
              playerId: "b",
              mechanics: { errors: 1, tries: 10 },
              bossTries: [{ encounterID: BOSS, tries: 10 }],
              mechanicsDetail: [semId],
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof mapaDeBosses>[0][number];

    const mapa = mapaDeBosses([semana]);
    expect(mapa.get("Ula'tek")).toBe(BOSS);

    // Sem o mapa, "b" pareceria limpo e puxaria a mediana pra baixo.
    const semMapa = metasDeMecanicas(semana.runs[0].players!, new Map());
    const comMapa = metasDeMecanicas(semana.runs[0].players!, mapa);

    expect(comMapa.get("a")).toBeGreaterThan(semMapa.get("a")!);
  });
});
