import { describe, expect, it } from "vitest";

import { buildNightDetail, buildTrashShare, type LutaDeBoss } from "./buildNightDetail";

const luta = (
  id: number,
  presentes: number[],
  extras: Partial<LutaDeBoss> = {}
): LutaDeBoss => ({ id, encounterID: 100, kill: false, friendlyPlayers: presentes, ...extras });

const dano = (porTry: Record<number, Record<number, number>>) =>
  new Map(
    Object.entries(porTry).map(([fightId, atores]) => [
      Number(fightId),
      new Map(Object.entries(atores).map(([actorId, valor]) => [Number(actorId), valor])),
    ])
  );

describe("buildNightDetail", () => {
  it("conta presença contra o total de trys da noite", () => {
    const detalhe = buildNightDetail([luta(1, [10, 20]), luta(2, [10])], [], new Map());

    expect(detalhe.get(10)?.tries).toMatchObject({ present: 2, total: 2 });
    expect(detalhe.get(20)?.tries).toMatchObject({ present: 1, total: 2 });
  });

  // Reserva que ficou no log sem entrar em pull nenhuma não é "zero dano":
  // é gente que não jogou.
  it("ignora quem não esteve em try nenhuma", () => {
    const detalhe = buildNightDetail([luta(1, [10])], [], new Map());

    expect(detalhe.has(10)).toBe(true);
    expect(detalhe.has(99)).toBe(false);
  });

  it("marca quem faltou na primeira try e quem sumiu antes da última", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10]), luta(2, [10, 20]), luta(3, [20])],
      [],
      new Map()
    );

    expect(detalhe.get(20)?.tries).toMatchObject({ lateStart: true, earlyExit: false });
    expect(detalhe.get(10)?.tries).toMatchObject({ lateStart: false, earlyExit: true });
  });

  it("não marca nada pra quem atravessou a noite inteira", () => {
    const detalhe = buildNightDetail([luta(1, [10]), luta(2, [10])], [], new Map());
    expect(detalhe.get(10)?.tries).toMatchObject({ lateStart: false, earlyExit: false });
  });

  it("conta try com zero dano como ociosa", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10]), luta(2, [10])],
      [],
      dano({ 1: { 10: 5000 }, 2: {} })
    );

    expect(detalhe.get(10)?.tries.idle).toBe(1);
  });

  it("conta quem morreu e ainda foi o maior dano da try", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [{ fight: 1, targetID: 10 }],
      dano({ 1: { 10: 9000, 20: 1000 } })
    );

    expect(detalhe.get(10)?.tries.topDamageDead).toBe(1);
    expect(detalhe.get(20)?.tries.topDamageDead).toBe(0);
  });

  it("não conta quem liderou o dano e sobreviveu", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [{ fight: 1, targetID: 20 }],
      dano({ 1: { 10: 9000, 20: 1000 } })
    );

    expect(detalhe.get(10)?.tries.topDamageDead).toBe(0);
  });

  it("agrupa trys por boss, com kill e sem morte", () => {
    const detalhe = buildNightDetail(
      [
        luta(1, [10], { encounterID: 100 }),
        luta(2, [10], { encounterID: 100, kill: true }),
        luta(3, [10], { encounterID: 200, kill: true }),
      ],
      [{ fight: 1, targetID: 10 }],
      new Map()
    );

    const porBoss = detalhe.get(10)!.bossTries;
    expect(porBoss).toHaveLength(2);

    // Morreu na try 1 do primeiro boss: matou, mas não foi impecável.
    expect(porBoss.find((b) => b.encounterID === 100)).toMatchObject({
      tries: 2,
      killed: true,
      flawless: false,
    });
    expect(porBoss.find((b) => b.encounterID === 200)).toMatchObject({
      tries: 1,
      killed: true,
      flawless: true,
    });
  });

  // Atravessar dez wipes sem morrer é mérito, mas "Invicto" é sobre derrubar
  // o boss — sem kill não há o que ter sido invicto contra.
  it("não marca impecável num boss que não caiu", () => {
    const detalhe = buildNightDetail([luta(1, [10]), luta(2, [10])], [], new Map());
    expect(detalhe.get(10)!.bossTries[0]).toMatchObject({ killed: false, flawless: false });
  });

  it("devolve vazio quando a noite não teve try de boss", () => {
    expect(buildNightDetail([], [{ fight: 1, targetID: 10 }], new Map()).size).toBe(0);
  });

  it("entrega o topo a todos os empatados", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [
        { fight: 1, targetID: 10 },
        { fight: 1, targetID: 20 },
      ],
      dano({ 1: { 10: 5000, 20: 5000 } })
    );

    expect(detalhe.get(10)?.tries.topDamageDead).toBe(1);
    expect(detalhe.get(20)?.tries.topDamageDead).toBe(1);
  });
});

describe("buildTrashShare", () => {
  it("reparte o dano do trash em porcentagem", () => {
    const share = buildTrashShare(
      new Map([
        [10, 750],
        [20, 250],
      ]),
      true
    );

    expect(share?.get(10)).toBe(75);
    expect(share?.get(20)).toBe(25);
  });

  // Num log que começa na pull do boss todo mundo tem zero, e zero ali não
  // quer dizer que a pessoa estava de bobeira.
  it("devolve undefined quando a noite não gravou trash", () => {
    expect(buildTrashShare(new Map([[10, 100]]), false)).toBeUndefined();
  });

  it("devolve undefined quando o trash existiu mas ninguém bateu", () => {
    expect(buildTrashShare(new Map([[10, 0]]), true)).toBeUndefined();
  });
});
