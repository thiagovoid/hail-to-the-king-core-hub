import { describe, expect, it } from "vitest";

import { buildNightDetail, buildTrashShare, type LutaDeBoss } from "./buildNightDetail";

const luta = (
  id: number,
  presentes: number[],
  extras: Partial<LutaDeBoss> = {}
): LutaDeBoss => ({
  id,
  encounterID: 100,
  kill: false,
  durationMs: 200_000,
  endTime: 200_000,
  friendlyPlayers: presentes,
  ...extras,
});

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
      [luta(1, [10, 20]), luta(2, [10, 20])],
      [],
      // Na try 2 o outro bateu e o 10 não: a try teve atividade, ele não.
      dano({ 1: { 10: 5000, 20: 4000 }, 2: { 20: 4000 } })
    );

    expect(detalhe.get(10)?.tries.idle).toBe(1);
    expect(detalhe.get(20)?.tries.idle).toBe(0);
  });

  // Em 27/08 isso dava "ocioso" pros 14 jogadores da noite: a try não tinha
  // tabela de dano nenhuma. Raide inteiro parado não acontece — try sem dado
  // acontece.
  it("não conta ociosidade numa try em que ninguém bateu", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20]), luta(2, [10, 20])],
      [],
      dano({ 1: { 10: 5000, 20: 3000 }, 2: {} })
    );

    expect(detalhe.get(10)?.tries.idle).toBe(0);
    expect(detalhe.get(20)?.tries.idle).toBe(0);
  });

  it("conta ociosidade quando os outros bateram e você não", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [],
      dano({ 1: { 10: 5000, 20: 0 } })
    );

    expect(detalhe.get(20)?.tries.idle).toBe(1);
    expect(detalhe.get(10)?.tries.idle).toBe(0);
  });

  /**
   * Em 27/08 uma try durou 20 segundos com treze dentro e uma só batendo:
   * alguém puxou errado e o grupo resetou. Contada como luta, ela dava
   * "atravessou uma try sem bater em nada" pra doze pessoas de uma vez.
   */
  it("não conta pull cancelada em segundos como try", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20, 30], { durationMs: 20_000 })],
      [],
      dano({ 1: { 10: 5000, 20: 0, 30: 0 } })
    );

    expect(detalhe.get(20)?.tries.idle).toBe(0);
    expect(detalhe.get(30)?.tries.idle).toBe(0);
  });

  // O reset visto pelo outro lado: durou o bastante, mas quase ninguém
  // chegou a bater.
  it("não conta try longa em que quase ninguém bateu", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20, 30, 40])],
      [],
      dano({ 1: { 10: 5000, 20: 0, 30: 0, 40: 0 } })
    );

    expect(detalhe.get(20)?.tries.idle).toBe(0);
  });

  it("conta quem morreu e ainda foi o maior dano da try", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [{ fight: 1, targetID: 10, timestamp: 0 }],
      dano({ 1: { 10: 9000, 20: 1000 } })
    );

    expect(detalhe.get(10)?.tries.topDamageDead).toBe(1);
    expect(detalhe.get(20)?.tries.topDamageDead).toBe(0);
  });

  it("não conta quem liderou o dano e sobreviveu", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [{ fight: 1, targetID: 20, timestamp: 0 }],
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
      [{ fight: 1, targetID: 10, timestamp: 0 }],
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
    expect(buildNightDetail([], [{ fight: 1, targetID: 10, timestamp: 0 }], new Map()).size).toBe(0);
  });

  /**
   * O ponto inteiro do custo de morte: "pode wipar, galera" não é erro de
   * ninguém. Contar morte crua puniria quem cumpre a call.
   */
  it("não cobra nada pela morte colada no fim da try", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20], { durationMs: 200_000, endTime: 200_000 })],
      [
        // Morreu a 2 segundos do fim: a call de wipe.
        { fight: 1, targetID: 10, timestamp: 198_000 },
        // Morreu no começo: o raide lutou 190s sem ele.
        { fight: 1, targetID: 20, timestamp: 10_000 },
      ],
      new Map()
    );

    expect(detalhe.get(10)?.deathCost).toMatchObject({ seconds: 2, share: 1 });
    expect(detalhe.get(20)?.deathCost).toMatchObject({ seconds: 190, share: 95 });
  });

  // 300 trys de progressão com call de wipe no fim custam perto de zero.
  it("mantém o custo baixo por muitas trys de progressão", () => {
    const trys = Array.from({ length: 20 }, (_, i) =>
      luta(i + 1, [10], { durationMs: 100_000, endTime: 100_000 })
    );
    const mortes = trys.map((t) => ({ fight: t.id, targetID: 10, timestamp: 97_000 }));

    const detalhe = buildNightDetail(trys, mortes, new Map());

    // Vinte mortes, e o custo é 3% da noite.
    expect(detalhe.get(10)?.deathCost.seconds).toBe(60);
    expect(detalhe.get(10)?.deathCost.share).toBe(3);
  });

  it("conta separado a morte em try que virou kill", () => {
    const detalhe = buildNightDetail(
      [
        luta(1, [10], { kill: true, durationMs: 100_000, endTime: 100_000 }),
        luta(2, [10], { durationMs: 100_000, endTime: 200_000 }),
      ],
      [
        { fight: 1, targetID: 10, timestamp: 50_000 },
        { fight: 2, targetID: 10, timestamp: 150_000 },
      ],
      new Map()
    );

    // O boss caiu sem ele uma vez.
    expect(detalhe.get(10)?.deathCost.inKills).toBe(1);
  });

  it("zera o custo de quem não morreu", () => {
    const detalhe = buildNightDetail([luta(1, [10])], [], new Map());
    expect(detalhe.get(10)?.deathCost).toEqual({ seconds: 0, share: 0, inKills: 0 });
  });

  it("entrega o topo a todos os empatados", () => {
    const detalhe = buildNightDetail(
      [luta(1, [10, 20])],
      [
        { fight: 1, targetID: 10, timestamp: 0 },
        { fight: 1, targetID: 20, timestamp: 0 },
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

describe("a assinatura das mortes", () => {
  /** Uma try de 200s, começando em 0 e terminando em 200_000. */
  const trys = [luta(1, [1, 2, 3])];
  const danoNormal = dano({ 1: { 1: 100, 2: 100, 3: 100 } });

  const assinatura = (mortes: Array<{ fight: number; targetID: number; timestamp: number }>) =>
    buildNightDetail(trys, mortes, danoNormal).get(1)?.deathSignature;

  it("conta speedrun quando a morte vem nos primeiros 30 segundos", () => {
    expect(
      assinatura([
        { fight: 1, targetID: 1, timestamp: 20_000 },
        { fight: 1, targetID: 2, timestamp: 150_000 },
      ])?.speedrun
    ).toBe(1);
  });

  it("não conta speedrun quando a morte vem depois", () => {
    expect(
      assinatura([
        { fight: 1, targetID: 1, timestamp: 90_000 },
        { fight: 1, targetID: 2, timestamp: 150_000 },
      ])?.speedrun
    ).toBe(0);
  });

  it("conta fantasma quando o tempo morto passa do tempo vivo", () => {
    const cedo = assinatura([
      { fight: 1, targetID: 1, timestamp: 80_000 },
      { fight: 1, targetID: 2, timestamp: 150_000 },
    ]);
    const tarde = assinatura([
      { fight: 1, targetID: 1, timestamp: 150_000 },
      { fight: 1, targetID: 2, timestamp: 160_000 },
    ]);

    expect(cedo?.fantasma).toBe(1);
    expect(tarde?.fantasma).toBe(0);
  });

  /** Ser o primeiro de um só é ser também o último: a piada é a fila. */
  it("não conta primeiro a cair quando a morte foi a única da try", () => {
    expect(assinatura([{ fight: 1, targetID: 1, timestamp: 50_000 }])?.primeiroACair).toBe(0);
  });

  it("entrega primeiro a cair aos empatados no mesmo instante", () => {
    const mortes = [
      { fight: 1, targetID: 1, timestamp: 50_000 },
      { fight: 1, targetID: 2, timestamp: 50_000 },
      { fight: 1, targetID: 3, timestamp: 90_000 },
    ];

    const detalhe = buildNightDetail(trys, mortes, danoNormal);
    expect(detalhe.get(1)?.deathSignature.primeiroACair).toBe(1);
    expect(detalhe.get(2)?.deathSignature.primeiroACair).toBe(1);
    expect(detalhe.get(3)?.deathSignature.primeiroACair).toBe(0);
  });

  /**
   * Todo wipe termina com todo mundo no chão. Sem exigir que a pessoa tenha
   * caído PRIMEIRO, a medalha disparava em 92 das 113 noites da temporada —
   * dizendo só "você estava num wipe".
   */
  it("exige ter aberto o placar pro efeito dominó", () => {
    const mortes = [
      { fight: 1, targetID: 1, timestamp: 194_000 },
      { fight: 1, targetID: 2, timestamp: 196_000 },
    ];

    const detalhe = buildNightDetail(trys, mortes, danoNormal);
    expect(detalhe.get(1)?.deathSignature.efeitoDomino).toBe(1);
    expect(detalhe.get(2)?.deathSignature.efeitoDomino).toBe(0);
  });

  it("não conta dominó quando o boss caiu", () => {
    const kill = [luta(1, [1, 2, 3], { kill: true })];
    const mortes = [
      { fight: 1, targetID: 1, timestamp: 194_000 },
      { fight: 1, targetID: 2, timestamp: 196_000 },
    ];

    expect(buildNightDetail(kill, mortes, danoNormal).get(1)?.deathSignature.efeitoDomino).toBe(0);
  });

  /**
   * Numa pull cancelada de 20 segundos todo mundo vira "speedrun ao
   * cemitério", e a piada perde a graça quando acusa o grupo inteiro.
   */
  it("ignora try que não vale como luta", () => {
    const cancelada = [luta(1, [1, 2, 3], { durationMs: 20_000, endTime: 20_000 })];
    const mortes = [
      { fight: 1, targetID: 1, timestamp: 5_000 },
      { fight: 1, targetID: 2, timestamp: 9_000 },
    ];

    const detalhe = buildNightDetail(cancelada, mortes, danoNormal).get(1)?.deathSignature;
    expect(detalhe).toEqual({ primeiroACair: 0, efeitoDomino: 0, speedrun: 0, fantasma: 0 });
  });

  /** Quem atravessou a noite de pé não tem assinatura nenhuma. */
  it("devolve tudo zerado pra quem não morreu", () => {
    expect(assinatura([{ fight: 1, targetID: 2, timestamp: 50_000 }])).toEqual({
      primeiroACair: 0,
      efeitoDomino: 0,
      speedrun: 0,
      fantasma: 0,
    });
  });
});
