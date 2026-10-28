import { describe, expect, it } from "vitest";

import { medalhasDaNoite, type JogadorDaNoite } from "./medalhasDaNoite";

const pega = (jogadores: JogadorDaNoite[], id: string) =>
  medalhasDaNoite(jogadores).find((medalha) => medalha.id === id);

describe("medalhasDaNoite", () => {
  it("premia o maior de cada coisa", () => {
    const noite: JogadorDaNoite[] = [
      { playerId: "a", dps: 58_000, deaths: 1 },
      { playerId: "b", dps: 91_500, deaths: 4 },
      { playerId: "c", dps: 70_000, deaths: 2 },
    ];

    expect(pega(noite, "dano")).toMatchObject({ ganhadores: ["b"], valor: "91.500 dps" });
    expect(pega(noite, "mortes")).toMatchObject({ ganhadores: ["b"], valor: "4" });
  });

  it("empate leva todo mundo", () => {
    const noite: JogadorDaNoite[] = [
      { playerId: "a", deaths: 3 },
      { playerId: "b", deaths: 3 },
      { playerId: "c", deaths: 1 },
    ];

    expect(pega(noite, "mortes")?.ganhadores).toEqual(["a", "b"]);
  });

  it("não premia quem só tem o dado porque ninguém mais tem", () => {
    // Uma pessoa com dps num log de dezoito não é "o maior dano da noite",
    // é buraco de coleta.
    const noite: JogadorDaNoite[] = [
      { playerId: "a", dps: 58_000 },
      { playerId: "b" },
      { playerId: "c" },
    ];

    expect(pega(noite, "dano")).toBeUndefined();
  });

  it("zero não ganha medalha", () => {
    // Noite sem nada pra interromper é noite tranquila, não é prêmio.
    const noite: JogadorDaNoite[] = [
      { playerId: "a", utility: { interrupts: 0 } },
      { playerId: "b", utility: { interrupts: 0 } },
    ];

    expect(pega(noite, "interrupcoes")).toBeUndefined();
  });

  it("separa mérito de zoeira", () => {
    const noite: JogadorDaNoite[] = [
      { playerId: "a", dps: 10, deaths: 1 },
      { playerId: "b", dps: 20, deaths: 3 },
    ];

    const porTom = Object.fromEntries(
      medalhasDaNoite(noite).map((medalha) => [medalha.id, medalha.tom])
    );

    expect(porTom).toEqual({ dano: "merito", mortes: "zoeira" });
  });

  it("tempo no chão sai em minutos e segundos", () => {
    const noite: JogadorDaNoite[] = [
      { playerId: "a", deathCost: { seconds: 252 } },
      { playerId: "b", deathCost: { seconds: 30 } },
    ];

    expect(pega(noite, "tempo-no-chao")?.valor).toBe("4m 12s");
  });

  it("noite vazia não inventa medalha", () => {
    expect(medalhasDaNoite([])).toEqual([]);
    expect(medalhasDaNoite([{ playerId: "a", dps: 100 }])).toEqual([]);
  });
});
