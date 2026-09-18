import { describe, expect, it } from "vitest";

import { CONQUISTAS, contarConquistas } from "./conquistas";
import type { CorePerformanceTargets } from "../../types/index";
import type { WeeklyPerformance } from "../../types/performance";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 30, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  preparation: { target: 60, direction: "higher" },
};

const semana = (date: string, players: WeeklyPerformance["runs"][number]["players"]): WeeklyPerformance => ({
  week: 1,
  runs: [{ date, players }],
});

const quantas = (weeks: WeeklyPerformance[], playerId: string, conquista: string) =>
  contarConquistas(weeks, TARGETS).get(playerId)?.get(conquista) ?? 0;

describe("contarConquistas", () => {
  it("acumula a mesma conquista ao longo das noites", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, dps: 100 },
        { playerId: "b", deaths: 1, dps: 50 },
      ]),
      semana("2026-09-03", [
        { playerId: "a", deaths: 1, dps: 90 },
        { playerId: "b", deaths: 1, dps: 40 },
      ]),
    ];

    expect(quantas(weeks, "a", "maior-dano")).toBe(2);
    expect(quantas(weeks, "b", "maior-dano")).toBe(0);
  });

  // Desempatar por ordem de array daria a medalha a quem por acaso aparece
  // primeiro no arquivo — e essa ordem muda sozinha quando a coleta roda.
  it("entrega a conquista disputada a todos os empatados", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, dps: 100 },
        { playerId: "b", deaths: 1, dps: 100 },
      ]),
    ];

    expect(quantas(weeks, "a", "maior-dano")).toBe(1);
    expect(quantas(weeks, "b", "maior-dano")).toBe(1);
  });

  // Não morrer não tira de ninguém: é cumprida, não disputada.
  it("dá a conquista cumprida a todo mundo que atingiu", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 0 },
        { playerId: "b", deaths: 0 },
        { playerId: "c", deaths: 3 },
      ]),
    ];

    expect(quantas(weeks, "a", "noite-limpa")).toBe(1);
    expect(quantas(weeks, "b", "noite-limpa")).toBe(1);
    expect(quantas(weeks, "c", "noite-limpa")).toBe(0);
  });

  it("não inventa vencedor quando ninguém tem o dado", () => {
    const weeks = [semana("2026-09-01", [{ playerId: "a", deaths: 1 }])];

    expect(quantas(weeks, "a", "maior-dano")).toBe(0);
    expect(quantas(weeks, "a", "maior-cura")).toBe(0);
  });

  it("dá a maior cura ao healer que cobriu mais dano do raide", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, healing: { score: 80, coverage: 25, share: 100, overheal: 20 } },
        { playerId: "b", deaths: 1, healing: { score: 90, coverage: 18, share: 80, overheal: 10 } },
      ]),
    ];

    // Cobertura, não nota: a conquista é de volume coberto.
    expect(quantas(weeks, "a", "maior-cura")).toBe(1);
    expect(quantas(weeks, "b", "maior-cura")).toBe(0);
  });

  it("dá MVP a quem teve o maior Score Geral", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, parse: 60 },
        { playerId: "b", deaths: 1, parse: 30 },
      ]),
    ];

    expect(quantas(weeks, "a", "mvp")).toBe(1);
    expect(quantas(weeks, "b", "mvp")).toBe(0);
  });

  it("não devolve nada pra jogador que não aparece em run nenhuma", () => {
    const weeks = [semana("2026-09-01", [{ playerId: "a", deaths: 0 }])];
    expect(contarConquistas(weeks, TARGETS).get("ninguem")).toBeUndefined();
  });

  it("toda conquista definida tem nome e texto de como obter", () => {
    for (const conquista of CONQUISTAS) {
      expect(conquista.nome.length).toBeGreaterThan(0);
      expect(conquista.como.length).toBeGreaterThan(0);
    }
  });
});
