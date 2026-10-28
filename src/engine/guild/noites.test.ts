import { describe, expect, it } from "vitest";

import { noitesDoCore } from "./noites";

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
