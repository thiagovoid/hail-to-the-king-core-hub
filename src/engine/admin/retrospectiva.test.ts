import { describe, expect, it } from "vitest";

import { buildRetrospectiva } from "./retrospectiva";
import { calculateOverallScore, type FuncaoDoJogador } from "../scores";
import type { CorePerformanceTargets } from "../../types/index";
import type { PlayerPerformance, WeeklyPerformance } from "../../types/performance";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 60, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  help: { target: 60, direction: "higher" },
  deliver: { target: 75, direction: "higher" },
  survival: { target: 10, direction: "lower" },
  preparation: { target: 60, direction: "higher" },
};

/** A pessoa é o healer; o tanque é o alt dela. Como Voidsurge e Voidwar. */
const FUNCOES = new Map<string, FuncaoDoJogador>([
  ["healer1", "healer"],
  ["tank1", "tank"],
]);

const curando = (overrides: Partial<PlayerPerformance> = {}): PlayerPerformance => ({
  playerId: "healer1",
  deaths: 1,
  parse: 50,
  healing: { score: 70, coverage: 20, share: 100, overheal: 10 },
  attack: { score: 70, uptime: 90, cooldowns: 50 },
  ...overrides,
});

const tankando = (overrides: Partial<PlayerPerformance> = {}): PlayerPerformance => ({
  playerId: "tank1",
  deaths: 4,
  parse: 90,
  attack: { score: 85, uptime: 95, cooldowns: 70 },
  // Defender pesa 45 pro tanque e 10 pro healer: é o que faz as duas
  // réguas discordarem sobre a MESMA noite.
  defense: { score: 20, mitigation: 35, dtps: 90000, selfSustain: 27 },
  ...overrides,
});

const retro = (semanas: WeeklyPerformance[]) =>
  buildRetrospectiva(
    "healer1",
    ["healer1", "tank1"],
    "Healer1",
    FUNCOES,
    semanas,
    TARGETS,
    new Map([[1, "Boss"]]),
    "Midnight S2",
    new Map()
  );

const abertura = (semanas: WeeklyPerformance[]) =>
  retro(semanas)?.slides.find((slide) => slide.tipo === "abertura")?.rodape;

const melhorNoite = (semanas: WeeklyPerformance[]) =>
  retro(semanas)?.slides.find((slide) => slide.chapeu === "Sua melhor noite");

describe("buildRetrospectiva", () => {
  it("dois personagens na mesma raide contam UMA noite", () => {
    // O caso real: o Voidsurge trocou pro Voidwar no meio de 15/09 e de
    // 22/09, e a retrospectiva dele dizia 22 noites onde houve 20.
    expect(
      abertura([
        {
          week: 1,
          runs: [
            {
              date: "2026-09-15",
              reportCode: "A",
              players: [curando(), tankando()],
            },
          ],
        },
        {
          week: 2,
          runs: [{ date: "2026-09-22", reportCode: "B", players: [curando()] }],
        },
      ] as WeeklyPerformance[])
    ).toBe("2 noites de raide");
  });

  it("uma noite só diz noite no singular", () => {
    expect(
      abertura([
        {
          week: 1,
          runs: [{ date: "2026-09-15", reportCode: "A", players: [curando(), tankando()] }],
        },
      ] as WeeklyPerformance[])
    ).toBe("1 noite de raide");
  });

  it("cada noite é medida pela régua do personagem que a jogou", () => {
    // A noite de tanque com a régua de healer dava um número que não é de
    // ninguém: no caso real, 100 numa noite que valia 99 e 31 numa de 46.
    const noite = tankando();
    const comoTanque = calculateOverallScore(noite, TARGETS, "tank").overall;
    const comoHealer = calculateOverallScore(noite, TARGETS, "healer").overall;

    expect(comoTanque).not.toBe(comoHealer);

    const slide = melhorNoite([
      { week: 1, runs: [{ date: "2026-09-15", reportCode: "A", players: [noite] }] },
    ] as WeeklyPerformance[]);

    expect(slide?.destaque).toBe(String(comoTanque));
  });

  it("na noite de dois personagens vale a maior das duas notas", () => {
    // Score é percentil, não contador: somar daria um número que ninguém
    // fez. A maior é um número real, posto no placar naquela noite.
    const doTanque = calculateOverallScore(tankando(), TARGETS, "tank").overall!;
    const doHealer = calculateOverallScore(curando(), TARGETS, "healer").overall!;

    const slide = melhorNoite([
      {
        week: 1,
        runs: [{ date: "2026-09-15", reportCode: "A", players: [curando(), tankando()] }],
      },
    ] as WeeklyPerformance[]);

    expect(slide?.destaque).toBe(String(Math.max(doTanque, doHealer)));
    expect(slide?.rodape).toBe("em 15/09/2026");
  });

  it("pessoa sem noite nenhuma não tem retrospectiva", () => {
    expect(
      retro([{ week: 1, runs: [{ date: "2026-09-15", reportCode: "A", players: [] }] }] as WeeklyPerformance[])
    ).toBeNull();
  });
});
