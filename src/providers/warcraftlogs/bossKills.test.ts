import { describe, expect, it } from "vitest";

import { buildBossKills, contarBossesDistintos, type TryDeKill } from "./bossKills";
import type { EventoDeCast } from "./cooldownUsage";

const NORMAL = 3;
const HEROICO = 4;

const kill = (id: number, encounterID: number, difficulty: number): TryDeKill => ({
  id,
  encounterID,
  difficulty,
  startTime: 0,
  endTime: 1000,
});

const cast = (sourceID: number, fight: number): EventoDeCast => ({
  sourceID,
  fight,
  abilityGameID: 1,
  timestamp: 0,
});

describe("buildBossKills", () => {
  it("credita o kill a quem lançou algo naquela try", () => {
    const resultado = buildBossKills([cast(5, 1)], [kill(1, 3470, HEROICO)]);

    expect(resultado.get(5)).toEqual([{ encounterID: 3470, difficulty: HEROICO }]);
  });

  // Quem não estava na try do kill não leva crédito, mesmo tendo ido à noite.
  it("não credita quem não aparece na try", () => {
    const resultado = buildBossKills([cast(5, 1), cast(9, 2)], [kill(1, 3470, HEROICO)]);

    expect(resultado.has(9)).toBe(false);
  });

  it("ignora try que não terminou em kill", () => {
    expect(buildBossKills([cast(5, 7)], [kill(1, 3470, HEROICO)]).size).toBe(0);
  });

  it("não repete o mesmo boss morto duas vezes na mesma noite", () => {
    const resultado = buildBossKills(
      [cast(5, 1), cast(5, 2)],
      [kill(1, 3470, HEROICO), kill(2, 3470, HEROICO)]
    );

    expect(resultado.get(5)).toHaveLength(1);
  });

  // Nek'zali no Normal e no Heroico são dois kills diferentes; é assim que o
  // jogo trata, e somar os dois contaria outra coisa.
  it("separa o mesmo boss por dificuldade", () => {
    const resultado = buildBossKills(
      [cast(5, 1), cast(5, 2)],
      [kill(1, 3470, NORMAL), kill(2, 3470, HEROICO)]
    );

    expect(resultado.get(5)).toHaveLength(2);
  });
});

describe("contarBossesDistintos", () => {
  it("soma bosses diferentes ao longo das runs", () => {
    const total = contarBossesDistintos([
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3445, difficulty: NORMAL }],
    ]);

    expect(total).toBe(2);
  });

  // Matar Nek'zali Normal em três semanas seguidas é um boss da season.
  it("não conta o mesmo boss de novo em outra semana", () => {
    const total = contarBossesDistintos([
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3470, difficulty: NORMAL }],
    ]);

    expect(total).toBe(1);
  });

  it("conta o mesmo boss em dificuldades diferentes separadamente", () => {
    const total = contarBossesDistintos([
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3470, difficulty: HEROICO }],
    ]);

    expect(total).toBe(2);
  });

  it("aceita run sem kill nenhum", () => {
    expect(contarBossesDistintos([undefined, []])).toBe(0);
  });
});
