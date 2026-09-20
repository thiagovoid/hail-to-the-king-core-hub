import { describe, expect, it } from "vitest";

import { hailScoreDaRun, serieDoHailScore, tituloDoHailScore, TITULOS_DO_HAIL_SCORE } from "./hailScore";
import type { CorePerformanceTargets } from "../../types/index";
import type { PerformanceRun, WeeklyPerformance } from "../../types/performance";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 30, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  help: { target: 60, direction: "higher" },
  survival: { target: 10, direction: "lower" },
  preparation: { target: 60, direction: "higher" },
};

const jogador = (playerId: string, parse: number) => ({ playerId, parse, deaths: 0 });

describe("tituloDoHailScore", () => {
  it("dá o título da faixa alcançada", () => {
    expect(tituloDoHailScore(0).nome).toBe("Escudeiro");
    expect(tituloDoHailScore(45).nome).toBe("Cavaleiro");
    expect(tituloDoHailScore(62).nome).toBe("Nobre");
    expect(tituloDoHailScore(80).nome).toBe("Regente");
    expect(tituloDoHailScore(95).nome).toBe("Rei");
  });

  // O piso pertence à faixa de cima: 60 já é Nobre, não Cavaleiro.
  it("trata o piso como parte da faixa", () => {
    expect(tituloDoHailScore(60).nome).toBe("Nobre");
    expect(tituloDoHailScore(59).nome).toBe("Cavaleiro");
  });

  it("nunca fica sem título", () => {
    for (const valor of [0, 39, 40, 74, 75, 89, 90, 100]) {
      expect(TITULOS_DO_HAIL_SCORE.map((f: { nome: string }) => f.nome)).toContain(tituloDoHailScore(valor).nome);
    }
  });
});

describe("hailScoreDaRun", () => {
  it("é a média dos scores de quem jogou", () => {
    const run: PerformanceRun = {
      date: "2026-09-15",
      players: [jogador("a", 60), jogador("b", 30)],
    };

    // parse 60 bate a meta (100), parse 30 fica em 50 => média 75.
    expect(hailScoreDaRun(run, TARGETS)).toBe(75);
  });

  // Noite sem dado não vira zero, pelo mesmo motivo que dimensão sem dado
  // sai da média em vez de pesar contra o jogador.
  it("devolve null quando ninguém tem score", () => {
    const run: PerformanceRun = { date: "2026-09-15", players: [{ playerId: "a", deaths: 0 }] };
    expect(hailScoreDaRun(run, TARGETS)).toBeNull();
  });

  it("devolve null em run sem jogador nenhum", () => {
    expect(hailScoreDaRun({ date: "2026-09-15", players: [] }, TARGETS)).toBeNull();
  });
});

describe("serieDoHailScore", () => {
  const weeks: WeeklyPerformance[] = [
    { week: 2, runs: [{ date: "2026-08-25", players: [jogador("a", 60)] }] },
    { week: 1, runs: [{ date: "2026-08-18", players: [jogador("a", 30)] }] },
  ];

  it("devolve a série em ordem cronológica, não na ordem do arquivo", () => {
    expect(serieDoHailScore(weeks, TARGETS)).toEqual([
      { date: "2026-08-18", value: 50 },
      { date: "2026-08-25", value: 100 },
    ]);
  });

  it("descarta a noite sem score em vez de deixar um buraco de zero", () => {
    const comVazia: WeeklyPerformance[] = [
      ...weeks,
      { week: 3, runs: [{ date: "2026-09-01", players: [{ playerId: "a", deaths: 0 }] }] },
    ];

    expect(serieDoHailScore(comVazia, TARGETS).map((p: { date: string }) => p.date)).toEqual([
      "2026-08-18",
      "2026-08-25",
    ]);
  });
});
