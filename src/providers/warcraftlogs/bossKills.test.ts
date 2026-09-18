import { describe, expect, it } from "vitest";

import { buildBossKills, contarKills, type TryDeKill } from "./bossKills";
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

  // Dois clears do mesmo boss na mesma noite são dois kills: a chave é a
  // TRY, não o boss.
  it("conta duas vezes o boss que caiu duas vezes na mesma noite", () => {
    const resultado = buildBossKills(
      [cast(5, 1), cast(5, 2)],
      [kill(1, 3470, HEROICO), kill(2, 3470, HEROICO)]
    );

    expect(resultado.get(5)).toHaveLength(2);
  });

  // O que não pode repetir é a mesma try: o jogador lança dezenas de vezes
  // dentro dela e isso é um kill só.
  it("não conta a mesma try duas vezes por causa de vários casts", () => {
    const resultado = buildBossKills(
      [cast(5, 1), cast(5, 1), cast(5, 1)],
      [kill(1, 3470, HEROICO)]
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

describe("contarKills", () => {
  it("soma os kills ao longo das runs", () => {
    const total = contarKills([
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3445, difficulty: NORMAL }],
    ]);

    expect(total).toBe(2);
  });

  // Mede participação em kill, não progressão: estar em três clears de
  // Nek'zali conta três.
  it("conta de novo o mesmo boss derrubado em outra semana", () => {
    const total = contarKills([
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3470, difficulty: NORMAL }],
      [{ encounterID: 3470, difficulty: NORMAL }],
    ]);

    expect(total).toBe(3);
  });

  it("aceita run sem kill nenhum", () => {
    expect(contarKills([undefined, []])).toBe(0);
  });
});
