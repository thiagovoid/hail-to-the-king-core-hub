import { describe, expect, it } from "vitest";

import {
  armaPreparada,
  linhasDeRecursos,
  notaDeRecursos,
  usoDaPedraPorAtor,
  usoPorAtor,
  type CastDoLog,
} from "./consumiveisDaNoite";
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

describe("usoDaPedraPorAtor", () => {
  const PEDRA_ID = 6262;
  const ehPedra = (id: number) => id === PEDRA_ID;
  const raide = new Set([1, 2, 3]);

  /**
   * Cobrar pedra em 60% das trys reprovava 151 noites-jogador, e a cobrança
   * não fazia sentido: pedra é botão de emergência, e apertar pouco é não
   * ter precisado. A pergunta que vale é "morreu com a pedra na mão?".
   */
  it("mede só as trys em que a pessoa morreu", () => {
    const uso = usoDaPedraPorAtor(
      [
        { sourceID: 1, abilityGameID: PEDRA_ID, fight: 1 },
        { sourceID: 1, abilityGameID: 999, fight: 2 },
      ],
      [
        { targetID: 1, fight: 1 },
        { targetID: 1, fight: 2 },
      ],
      raide,
      ehPedra
    );

    // Morreu em duas trys e só usou numa: 50.
    expect(uso.get(1)).toEqual({ trysComMorte: 2, trysComUso: 1, uso: 50 });
  });

  it("não julga quem não morreu", () => {
    // Sem morte não há situação — e não se acusa quem não teve a situação.
    const uso = usoDaPedraPorAtor([{ sourceID: 1, abilityGameID: 999, fight: 1 }], [], raide, ehPedra);

    expect(uso.get(1)).toBeUndefined();
  });

  it("não credita pedra usada em outra try", () => {
    // Usou na try 1, morreu na 2: não serviu de nada lá.
    const uso = usoDaPedraPorAtor(
      [{ sourceID: 1, abilityGameID: PEDRA_ID, fight: 1 }],
      [{ targetID: 1, fight: 2 }],
      raide,
      ehPedra
    );

    expect(uso.get(1)).toEqual({ trysComMorte: 1, trysComUso: 0, uso: 0 });
  });

  it("ignora morte fora das lutas de raide", () => {
    const uso = usoDaPedraPorAtor([], [{ targetID: 1, fight: 99 }], raide, ehPedra);

    expect(uso.get(1)).toBeUndefined();
  });
});

describe("notaDeRecursos", () => {
  const item = (familia: string, uso: number | null, extras = {}) =>
    ({ familia, rotulo: familia, trysComUso: null, trys: null, uso, quais: [], ...extras }) as never;

  it("tira a média só do que deu pra medir", () => {
    expect(notaDeRecursos([item("pocao", 50), item("frasco", 100)])).toBe(75);
  });

  /**
   * Nulo é "não se aplica", não falha. Quem não morreu não tem o que
   * responder sobre a pedra, e contar isso como zero é o erro que esta
   * dimensão passou a temporada cometendo.
   */
  it("não conta como zero o que não pôde ser medido", () => {
    expect(notaDeRecursos([item("pocao", 100), item("pedra", null)])).toBe(100);
  });

  it("devolve null quando nada foi medido", () => {
    expect(notaDeRecursos([item("pedra", null)])).toBeNull();
    expect(notaDeRecursos(undefined)).toBeNull();
  });
});

describe("linhasDeRecursos", () => {
  it("dá a cada família a unidade dela", () => {
    const linhas = linhasDeRecursos([
      { familia: "pocao", rotulo: "Poção", trysComUso: 10, trys: 15, uso: 67, quais: [] },
      { familia: "pedra", rotulo: "Pedra de vida", trysComUso: 0, trys: 7, uso: 0, quais: [] },
      { familia: "oleo", rotulo: "Óleo de arma", trysComUso: null, trys: null, uso: 100, quais: ["Thalassian Phoenix Oil"] },
      { familia: "frasco", rotulo: "Frasco", trysComUso: null, trys: null, uso: 0, quais: [] },
    ]);

    expect(linhas).toEqual([
      "Poção: 67% — 10 de 15 trys",
      // "morreu 7 vezes e não usou" conta uma história que "0%" não conta.
      "Pedra de vida: usou em 0 das 7 trys em que morreu",
      "Óleo de arma: sim (Thalassian Phoenix Oil)",
      "Frasco: não",
    ]);
  });

  it("diz por que não tem número, em vez de mostrar zero", () => {
    const linhas = linhasDeRecursos([
      { familia: "pedra", rotulo: "Pedra de vida", trysComUso: null, trys: null, uso: null, quais: [] },
      { familia: "frasco", rotulo: "Frasco", trysComUso: null, trys: null, uso: null, quais: [] },
    ]);

    expect(linhas).toEqual(["Pedra de vida: não morreu nenhuma vez", "Frasco: não medido"]);
  });
});
