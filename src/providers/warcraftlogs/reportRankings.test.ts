import { describe, expect, it } from "vitest";
import { buildParseByPlayer, findParse, type WclReportRankings } from "./reportRankings";

/** Recorte da resposta real do report JCvk27bDL6Zdm18j (fight 1, Nek'zali heroico). */
const REAL: WclReportRankings = {
  data: [
    {
      fightID: 1,
      encounter: { id: 3470, name: "Nek'zali the Soulcoiler" },
      difficulty: 4,
      kill: 1,
      roles: {
        tanks: {
          characters: [
            { name: "Blackwatch", rankPercent: 13 },
            { name: "Apocalïpse", rankPercent: 27 },
          ],
        },
        healers: { characters: [{ name: "Kams", rankPercent: 44 }] },
        dps: { characters: [{ name: "Voidwar", rankPercent: 51 }] },
      },
    },
    {
      fightID: 17,
      encounter: { id: 3445, name: "Entombed Sentinels" },
      difficulty: 4,
      kill: 1,
      roles: { dps: { characters: [{ name: "Voidwar", rankPercent: 62 }] } },
    },
  ],
};

describe("buildParseByPlayer", () => {
  it("lê o percentil de todos os papéis, não só dps", () => {
    const porJogador = buildParseByPlayer(REAL);

    expect(porJogador.get("blackwatch")?.parse).toBe(13);
    expect(porJogador.get("kams")?.parse).toBe(44);
    expect(porJogador.get("voidwar")?.parse).toBe(62);
  });

  it("fica com o melhor parse entre os kills, não a média", () => {
    // Voidwar tirou 51 e 62: é assim que a WCL e o jogador leem "meu parse".
    expect(buildParseByPlayer(REAL).get("voidwar")).toEqual({ parse: 62, kills: 2 });
  });

  it("ignora wipe — a WCL não calcula percentil pra quem não matou", () => {
    const comWipe: WclReportRankings = {
      data: [
        { fightID: 5, kill: 0, roles: { dps: { characters: [{ name: "Xúlio", rankPercent: 90 }] } } },
        { fightID: 6, kill: 1, roles: { dps: { characters: [{ name: "Xúlio", rankPercent: 30 }] } } },
      ],
    };

    expect(buildParseByPlayer(comWipe).get("xúlio")).toEqual({ parse: 30, kills: 1 });
  });

  it("noite sem kill nenhum fica sem parse — diferente de parse zero", () => {
    const soWipe: WclReportRankings = {
      data: [{ fightID: 5, kill: 0, roles: { dps: { characters: [{ name: "Xúlio", rankPercent: 90 }] } } }],
    };

    expect(buildParseByPlayer(soWipe).size).toBe(0);
  });

  it("resposta vazia não quebra", () => {
    expect(buildParseByPlayer(undefined).size).toBe(0);
    expect(buildParseByPlayer({}).size).toBe(0);
  });

  it("ignora personagem sem percentil, em vez de contar como zero", () => {
    const semPercentil: WclReportRankings = {
      data: [{ fightID: 1, kill: 1, roles: { dps: { characters: [{ name: "Naamt" }] } } }],
    };

    expect(buildParseByPlayer(semPercentil).size).toBe(0);
  });
});

describe("findParse", () => {
  it("acha o jogador independente da caixa do nome", () => {
    // A WCL varia a caixa entre endpoints; o roster guarda a grafia do perfil.
    const porJogador = buildParseByPlayer(REAL);

    expect(findParse(porJogador, "VOIDWAR")?.parse).toBe(62);
    expect(findParse(porJogador, "voidwar")?.parse).toBe(62);
  });

  it("devolve undefined pra quem não está no relatório", () => {
    expect(findParse(buildParseByPlayer(REAL), "Ninguem")).toBeUndefined();
  });
});
