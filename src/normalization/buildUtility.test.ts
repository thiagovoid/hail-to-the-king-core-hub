import { describe, expect, it } from "vitest";

import { buildUtility, MAGIAS_DE_BATTLE_REZ } from "./buildUtility";

const interromper = (sourceID: number) => ({ sourceID });
const dissipar = (sourceID: number, isBuff = false) => ({ sourceID, isBuff });
const lancar = (sourceID: number, abilityGameID: number, type = "cast") => ({
  sourceID,
  abilityGameID,
  type,
});

const RENASCIMENTO = 20484;

describe("buildUtility", () => {
  it("conta interrupções por quem interrompeu", () => {
    const util = buildUtility([interromper(8), interromper(8), interromper(3)], [], []);

    expect(util.get(8)?.interrupts).toBe(2);
    expect(util.get(3)?.interrupts).toBe(1);
  });

  // Tirar debuff do amigo e arrancar buff do inimigo são decisões diferentes;
  // somadas, esconderiam qual delas a pessoa faz.
  it("separa dispel de purge", () => {
    const util = buildUtility([], [dissipar(2), dissipar(2), dissipar(2, true)], []);

    expect(util.get(2)).toMatchObject({ dispels: 2, purges: 1 });
  });

  // `Resurrects` não existe no enum da WCL, mas os casts já estão todos no
  // bruto — o battle rez sai de lá sem requisição nova.
  it("tira battle rez dos casts, sem chamada nova", () => {
    const util = buildUtility([], [], [lancar(5, RENASCIMENTO), lancar(5, 12345)]);

    expect(util.get(5)?.battleRez).toBe(1);
  });

  // Battle rez tem tempo de conjuração: emite begincast E cast. Contar os
  // dois dobrava o número — e pior, contava como levantado alguém que a
  // conjuração interrompida nunca chegou a levantar.
  it("não conta a conjuração começada como rez", () => {
    const util = buildUtility([], [], [
      lancar(5, RENASCIMENTO, "begincast"),
      lancar(5, RENASCIMENTO, "cast"),
      lancar(5, RENASCIMENTO, "begincast"),
    ]);

    expect(util.get(5)?.battleRez).toBe(1);
  });

  it("ignora cast que não é ressurreição", () => {
    const util = buildUtility([], [], [lancar(5, 12345), lancar(5, 99999)]);
    expect(util.has(5)).toBe(false);
  });

  // Zero não é o mesmo que ausente: quem não tem interrupção na spec não
  // pode ser medido por ela.
  it("só devolve quem fez alguma coisa", () => {
    const util = buildUtility([interromper(8)], [], []);

    expect(util.has(8)).toBe(true);
    expect(util.has(99)).toBe(false);
  });

  it("soma as três frentes do mesmo ator", () => {
    const util = buildUtility(
      [interromper(7)],
      [dissipar(7), dissipar(7, true)],
      [lancar(7, RENASCIMENTO)]
    );

    expect(util.get(7)).toEqual({
      interrupts: 1,
      dispels: 1,
      purges: 1,
      battleRez: 1,
      battleRezRecebidos: 0,
    });
  });

  it("devolve vazio quando a noite não teve utilidade nenhuma", () => {
    expect(buildUtility([], [], []).size).toBe(0);
  });

  it("cobre as classes que têm battle rez", () => {
    // Druida, DK, Bruxo, Paladino e o item de engenharia.
    expect(MAGIAS_DE_BATTLE_REZ.size).toBeGreaterThanOrEqual(5);
    expect(MAGIAS_DE_BATTLE_REZ.has(RENASCIMENTO)).toBe(true);
  });
});

describe("battle rez recebido", () => {
  it("credita quem levantou e quem foi levantado", () => {
    const util = buildUtility([], [], [
      { sourceID: 7, abilityGameID: RENASCIMENTO, type: "cast", targetID: 9 },
    ]);

    expect(util.get(7)?.battleRez).toBe(1);
    expect(util.get(7)?.battleRezRecebidos).toBe(0);
    expect(util.get(9)?.battleRezRecebidos).toBe(1);
  });

  /** Receber é um fato da noite dela, mesmo que ela não tenha feito mais nada. */
  it("põe no mapa quem só recebeu", () => {
    const util = buildUtility([], [], [
      { sourceID: 7, abilityGameID: RENASCIMENTO, type: "cast", targetID: 9 },
    ]);

    expect(util.get(9)).toEqual({
      interrupts: 0,
      dispels: 0,
      purges: 0,
      battleRez: 0,
      battleRezRecebidos: 1,
    });
  });

  /** A conjuração interrompida não levantou ninguém — dos dois lados. */
  it("não conta begincast", () => {
    const util = buildUtility([], [], [
      { sourceID: 7, abilityGameID: RENASCIMENTO, type: "begincast", targetID: 9 },
    ]);

    expect(util.get(9)).toBeUndefined();
  });

  it("ignora rez sem alvo no evento", () => {
    const util = buildUtility([], [], [{ sourceID: 7, abilityGameID: RENASCIMENTO, type: "cast" }]);

    expect(util.get(7)?.battleRez).toBe(1);
    expect(util.size).toBe(1);
  });

  it("ignora o alvo -1, que é 'sem alvo' na WCL", () => {
    const util = buildUtility([], [], [
      { sourceID: 7, abilityGameID: RENASCIMENTO, type: "cast", targetID: -1 },
    ]);

    expect(util.get(-1)).toBeUndefined();
    expect(util.get(7)?.battleRez).toBe(1);
  });
});
