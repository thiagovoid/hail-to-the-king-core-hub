import { describe, expect, it } from "vitest";

import { armaPreparada, usoPorAtor, type CastDoLog } from "./consumiveisDaNoite";
import type { FamiliaDeConsumivel } from "../providers/wowhead/familiaDoConsumivel";

const POCAO = 1236616; // Light's Potential
const OUTRA_POCAO = 1295247; // Concentrated Silvermoon Health Potion
const PEDRA = 6262;
const ROTACAO = 23922;

const familia = (id: number): FamiliaDeConsumivel | undefined =>
  id === POCAO || id === OUTRA_POCAO ? "pocao" : id === PEDRA ? "pedra" : undefined;
const nome = (id: number) =>
  ({ [POCAO]: "Light's Potential", [OUTRA_POCAO]: "Concentrated Silvermoon Health Potion", [PEDRA]: "Healthstone" })[id];

const raide = new Set([1, 2, 3]);
const rodar = (casts: CastDoLog[]) => usoPorAtor(casts, raide, familia, nome, ["pocao", "pedra"]);

describe("usoPorAtor", () => {
  /**
   * O caso que gerou tudo: a poção mais usada do core não tem "poção" no
   * nome, e por isso ninguém era creditado. Aqui ela conta como qualquer
   * outra — é a regra pedida, "poção é poção".
   */
  it("credita poção que o nome não denuncia", () => {
    const uso = rodar([
      { sourceID: 1, abilityGameID: ROTACAO, fight: 1 },
      { sourceID: 1, abilityGameID: POCAO, fight: 1 },
      { sourceID: 1, abilityGameID: ROTACAO, fight: 2 },
    ]);

    const pocao = uso.get(1)!.find((u) => u.familia === "pocao")!;
    expect(pocao.trysComUso).toBe(1);
    expect(pocao.trys).toBe(2);
    expect(pocao.uso).toBe(50);
    expect(pocao.quais).toEqual(["Light's Potential"]);
  });

  it("não soma duas vezes a mesma try", () => {
    // Tomar duas poções no mesmo pull não é estar preparado em dobro.
    const uso = rodar([
      { sourceID: 1, abilityGameID: POCAO, fight: 1 },
      { sourceID: 1, abilityGameID: OUTRA_POCAO, fight: 1 },
    ]);

    expect(uso.get(1)!.find((u) => u.familia === "pocao")!.trysComUso).toBe(1);
  });

  it("separa poção de pedra de vida", () => {
    // São dois itens do Portão: "não usou poção" e "não usou a pedra que o
    // bruxo fez pra você" são conversas diferentes.
    const uso = rodar([
      { sourceID: 1, abilityGameID: POCAO, fight: 1 },
      { sourceID: 1, abilityGameID: PEDRA, fight: 2 },
    ]);

    expect(uso.get(1)!.find((u) => u.familia === "pocao")!.trysComUso).toBe(1);
    expect(uso.get(1)!.find((u) => u.familia === "pedra")!.trysComUso).toBe(1);
  });

  /**
   * Quem entrou na metade da noite não pode ser cobrado pelas trys em que
   * não estava — o denominador é onde ELA lutou.
   */
  it("conta só as trys em que a pessoa esteve", () => {
    const uso = rodar([
      { sourceID: 1, abilityGameID: ROTACAO, fight: 1 },
      { sourceID: 1, abilityGameID: ROTACAO, fight: 2 },
      { sourceID: 1, abilityGameID: ROTACAO, fight: 3 },
      { sourceID: 2, abilityGameID: ROTACAO, fight: 3 },
      { sourceID: 2, abilityGameID: POCAO, fight: 3 },
    ]);

    expect(uso.get(1)!.find((u) => u.familia === "pocao")!.trys).toBe(3);
    expect(uso.get(2)!.find((u) => u.familia === "pocao")!.trys).toBe(1);
    expect(uso.get(2)!.find((u) => u.familia === "pocao")!.uso).toBe(100);
  });

  it("ignora o que aconteceu fora das lutas de raide", () => {
    // Poção tomada no trash não é preparação de boss.
    const uso = rodar([
      { sourceID: 1, abilityGameID: ROTACAO, fight: 1 },
      { sourceID: 1, abilityGameID: POCAO, fight: 99 },
    ]);

    expect(uso.get(1)!.find((u) => u.familia === "pocao")!.trysComUso).toBe(0);
  });

  it("devolve zero com nome vazio pra quem não usou", () => {
    const uso = rodar([{ sourceID: 1, abilityGameID: ROTACAO, fight: 1 }]);
    const pocao = uso.get(1)!.find((u) => u.familia === "pocao")!;

    expect(pocao).toMatchObject({ trysComUso: 0, trys: 1, uso: 0, quais: [] });
  });
});

describe("armaPreparada", () => {
  it("aceita óleo e imbue de xamã, que são temporários", () => {
    expect(armaPreparada({ temporaryEnchant: 1, temporaryEnchantName: "Thalassian Phoenix Oil" }, "warrior"))
      .toEqual({ preparada: true, nome: "Thalassian Phoenix Oil" });
    expect(armaPreparada({ temporaryEnchant: 2, temporaryEnchantName: "Windfury" }, "shaman"))
      .toEqual({ preparada: true, nome: "Windfury" });
  });

  /**
   * O runeforge do DK é PERMANENTE e ocupa a arma — ele não aplica óleo nem
   * pode. Olhando só o temporário, o Blackwatch levava dez medalhas de "arma
   * seca" com a Rune of Sanguination na mão.
   */
  it("aceita o runeforge do death knight, que é permanente", () => {
    const comRune = { permanentEnchant: 6241, permanentEnchantName: "Rune of Sanguination" };

    expect(armaPreparada(comRune, "death-knight")).toEqual({
      preparada: true,
      nome: "Rune of Sanguination",
    });
    // E a mesma arma num guerreiro continua seca: pra ele o permanente é
    // outra coisa, e o óleo é que falta.
    expect(armaPreparada(comRune, "warrior")?.preparada).toBe(false);
  });

  it("acusa quem está sem nada", () => {
    expect(armaPreparada({ permanentEnchantName: "Enchant Weapon - Berserker's Rage" }, "warrior")?.preparada).toBe(false);
    expect(armaPreparada({}, "death-knight")?.preparada).toBe(false);
  });

  it("não afirma nada sem arma", () => {
    // Sem gear da mão principal a resposta é "não sei", não "não usou".
    expect(armaPreparada(undefined, "warrior")).toBeUndefined();
  });
});
