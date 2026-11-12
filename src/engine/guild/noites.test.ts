import { describe, expect, it } from "vitest";

import { noitesDoCore, porNoite, semanasPorNoite } from "./noites";

describe("noitesDoCore", () => {
  it("um relatório por data vira uma noite", () => {
    const noites = noitesDoCore([
      { runs: [{ date: "2026-10-20", reportCode: "A", players: [{ playerId: "gunst" }] }] },
      { runs: [{ date: "2026-10-22", reportCode: "B", players: [{ playerId: "kams" }] }] },
    ]);

    expect(noites.map((n) => n.date)).toEqual(["2026-10-22", "2026-10-20"]);
    expect(noites[1].reportCodes).toEqual(["A"]);
  });

  it("dois relatórios na mesma data são UMA noite", () => {
    // O caso real de 23/10: o WoW partiu o log quando alguém deslogou.
    const noites = noitesDoCore([
      {
        runs: [
          { date: "2026-10-23", reportCode: "pNVy", players: [{ playerId: "kairá" }] },
          { date: "2026-10-23", reportCode: "Qzdp", players: [{ playerId: "beowolff" }] },
        ],
      },
    ]);

    expect(noites).toHaveLength(1);
    expect(noites[0].reportCodes).toEqual(["pNVy", "Qzdp"]);
    expect(noites[0].jogadores.map((j) => j.playerId)).toEqual(["kairá", "beowolff"]);
  });

  it("quem jogou as duas metades soma os contadores", () => {
    const noites = noitesDoCore([
      {
        runs: [
          {
            date: "2026-10-23",
            reportCode: "pNVy",
            players: [
              {
                playerId: "kairá",
                deaths: 2,
                utility: { interrupts: 3, dispels: 1 },
                deathCost: { seconds: 40 },
              },
            ],
          },
          {
            date: "2026-10-23",
            reportCode: "Qzdp",
            players: [
              {
                playerId: "kairá",
                deaths: 3,
                utility: { interrupts: 4, dispels: 0 },
                deathCost: { seconds: 60 },
              },
            ],
          },
        ],
      },
    ]);

    const kaira = noites[0].jogadores[0] as unknown as Record<string, number>;

    expect(kaira.deaths).toBe(5);
    expect(kaira.utility).toMatchObject({ interrupts: 7, dispels: 1 });
    expect(kaira.deathCost).toMatchObject({ seconds: 100 });
  });

  it("taxa fica com a maior das metades, não com a soma", () => {
    // Somar dps das duas metades daria um número que ninguém fez.
    const noites = noitesDoCore([
      {
        runs: [
          { date: "2026-10-23", reportCode: "pNVy", players: [{ playerId: "k", dps: 58_000, parse: 19 }] },
          { date: "2026-10-23", reportCode: "Qzdp", players: [{ playerId: "k", dps: 91_000, parse: 12 }] },
        ],
      },
    ]);

    const k = noites[0].jogadores[0] as unknown as Record<string, number>;

    expect(k.dps).toBe(91_000);
    expect(k.parse).toBe(19);
  });

  it("não inventa campo que nenhuma das metades tinha", () => {
    const noites = noitesDoCore([
      {
        runs: [
          { date: "2026-10-23", reportCode: "A", players: [{ playerId: "k", deaths: 1 }] },
          { date: "2026-10-23", reportCode: "B", players: [{ playerId: "k", deaths: 2 }] },
        ],
      },
    ]);

    expect(noites[0].jogadores[0]).not.toHaveProperty("dps");
    expect(noites[0].jogadores[0]).not.toHaveProperty("utility");
  });

  it("semana sem run some em vez de virar noite vazia", () => {
    expect(noitesDoCore([{ runs: [] }, { runs: undefined }])).toEqual([]);
  });
});

describe("semanasPorNoite", () => {
  it("duas runs da mesma data viram uma, somando os contadores", () => {
    // O caso real de 10/11: mesmo startTime, mesmos doze jogadores.
    const [semana] = semanasPorNoite([
      {
        week: 13,
        runs: [
          { date: "2026-11-10", reportCode: "HzNt", players: [{ playerId: "gunst", deaths: 2 }] },
          { date: "2026-11-10", reportCode: "vHDn", players: [{ playerId: "gunst", deaths: 1 }] },
        ],
      },
    ]);

    expect(semana.runs).toHaveLength(1);
    expect(semana.runs?.[0].reportCodes).toEqual(["HzNt", "vHDn"]);
    expect((semana.runs?.[0].players?.[0] as unknown as Record<string, number>).deaths).toBe(3);
  });

  it("o reportCode continua sendo o primeiro, pros links que já existem", () => {
    const [semana] = semanasPorNoite([
      {
        week: 13,
        runs: [
          { date: "2026-11-10", reportCode: "HzNt", players: [] },
          { date: "2026-11-10", reportCode: "vHDn", players: [] },
        ],
      },
    ]);

    expect(semana.runs?.[0].reportCode).toBe("HzNt");
  });

  it("noite partida entre duas semanas vai pra menor delas", () => {
    // Acontece quando as duas metades são coletadas com --week diferente.
    const semanas = semanasPorNoite([
      { week: 13, runs: [{ date: "2026-11-10", reportCode: "A", players: [{ playerId: "k" }] }] },
      { week: 14, runs: [{ date: "2026-11-10", reportCode: "B", players: [{ playerId: "k" }] }] },
    ]);

    expect(semanas[0].runs).toHaveLength(1);
    expect(semanas[0].runs?.[0].reportCodes).toEqual(["A", "B"]);
    expect(semanas[1].runs).toEqual([]);
  });

  it("noite inteira passa reta, e a semana vazia continua na lista", () => {
    const semanas = semanasPorNoite([
      { week: 1, runs: [{ date: "2026-08-18", reportCode: "X", players: [{ playerId: "k" }] }] },
      { week: 2, runs: [] },
    ]);

    expect(semanas[0].runs?.[0]).toMatchObject({ reportCode: "X", reportCodes: ["X"] });
    expect(semanas).toHaveLength(2);
    expect(semanas[1].runs).toEqual([]);
  });
});

describe("porNoite", () => {
  it("dois personagens da mesma pessoa na mesma data são uma noite", () => {
    // 15/09: o Voidsurge trocou pro Voidwar no meio da raide. Contar
    // entradas dava 22 noites na temporada dele onde houve 20.
    const noites = porNoite([
      { date: "2026-09-15", playerId: "voidwar" },
      { date: "2026-09-15", playerId: "voidsurge" },
      { date: "2026-09-22", playerId: "voidsurge" },
    ]);

    expect(noites).toHaveLength(2);
    expect(noites[0].map((e) => e.playerId)).toEqual(["voidwar", "voidsurge"]);
  });

  it("não funde as entradas: a noite é um grupo", () => {
    // Fundir seria errado — o tanque e o healer não formam ninguém. Quem
    // consome soma os contadores e escolhe entre as taxas.
    const noites = porNoite([
      { date: "2026-09-15", playerId: "voidwar", deaths: 9 },
      { date: "2026-09-15", playerId: "voidsurge", deaths: 2 },
    ]);

    expect(noites[0]).toHaveLength(2);
    expect(noites[0].reduce((total, e) => total + e.deaths, 0)).toBe(11);
  });

  it("um personagem por noite passa reto, na ordem que chegou", () => {
    const noites = porNoite([
      { date: "2026-08-18", playerId: "a" },
      { date: "2026-10-20", playerId: "a" },
    ]);

    expect(noites.map((n) => n[0].date)).toEqual(["2026-08-18", "2026-10-20"]);
  });

  it("histórico vazio não tem noite", () => {
    expect(porNoite([])).toEqual([]);
  });
});
