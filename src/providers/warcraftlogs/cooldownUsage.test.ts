import { describe, expect, it } from "vitest";

import type { CooldownDaMagia } from "../wowhead/spellCooldown";
import { buildCooldownUsage, tempoEmRecarga, type EventoDeCast } from "./cooldownUsage";

const AVATAR: CooldownDaMagia = {
  spellId: 107574,
  name: "Avatar",
  cooldownMs: 90_000,
  charges: 1,
  kind: "offensive",
};

const BLUR: CooldownDaMagia = {
  spellId: 198589,
  name: "Blur",
  cooldownMs: 60_000,
  charges: 1,
  kind: "defensive",
};

const DUAS_CARGAS: CooldownDaMagia = { ...AVATAR, spellId: 999, name: "Duas Cargas", charges: 2 };

const catalogo = new Map([AVATAR, BLUR, DUAS_CARGAS].map((m) => [m.spellId, m]));

describe("tempoEmRecarga", () => {
  const luta = { startTime: 0, endTime: 600_000 };

  it("conta a recarga inteira de um uso no meio da luta", () => {
    expect(tempoEmRecarga([100_000], luta, 90_000, 1)).toBe(90_000);
  });

  it("não conta nada quando a habilidade nunca foi usada", () => {
    expect(tempoEmRecarga([], luta, 90_000, 1)).toBe(0);
  });

  // Quem aperta o cooldown nos últimos segundos gastou o uso mas deixou a
  // habilidade parada a luta toda — a régua precisa enxergar isso.
  it("corta a recarga no fim da luta", () => {
    expect(tempoEmRecarga([580_000], luta, 90_000, 1)).toBe(20_000);
  });

  it("soma usos sucessivos sem contar o mesmo intervalo duas vezes", () => {
    // 0s e 90s: a segunda recarga começa exatamente quando a primeira acaba.
    expect(tempoEmRecarga([0, 90_000], luta, 90_000, 1)).toBe(180_000);
  });

  // Log com talento que reduz recarga traz mais casts do que o cooldown
  // genérico do tooltip permite. Não pode virar tempo inflado.
  it("não conta em dobro quando o log usa antes da recarga terminar", () => {
    expect(tempoEmRecarga([0, 30_000], luta, 90_000, 1)).toBe(120_000);
  });

  it("aceita eventos fora de ordem", () => {
    expect(tempoEmRecarga([90_000, 0], luta, 90_000, 1)).toBe(180_000);
  });

  it("ignora cast fora da janela da try", () => {
    expect(tempoEmRecarga([700_000], luta, 90_000, 1)).toBe(0);
  });

  describe("cargas", () => {
    // Com 2 cargas, gastar uma ainda deixa a outra pronta — mas a habilidade
    // só volta ao topo depois de recarregar, e esse tempo conta.
    it("conta a recarga de uma carga só", () => {
      expect(tempoEmRecarga([100_000], luta, 90_000, 2)).toBe(90_000);
    });

    // É aqui que o modelo de "livre a partir de X" erraria: duas cargas
    // gastas de uma vez deixam a habilidade em recarga pelo dobro do tempo.
    it("dobra o tempo quando as duas cargas são gastas juntas", () => {
      expect(tempoEmRecarga([100_000, 100_000], luta, 90_000, 2)).toBe(180_000);
    });
  });
});

describe("buildCooldownUsage", () => {
  const janelas = [{ id: 1, startTime: 0, endTime: 600_000 }];

  const evento = (sourceID: number, abilityGameID: number, timestamp: number): EventoDeCast => ({
    sourceID,
    abilityGameID,
    timestamp,
    fight: 1,
  });

  it("separa eficiência ofensiva de defensiva", () => {
    const [jogador] = buildCooldownUsage(
      [evento(5, AVATAR.spellId, 0), evento(5, BLUR.spellId, 0)],
      janelas,
      catalogo
    );

    // 90s de 600s = 15%; 60s de 600s = 10%.
    expect(jogador.offensive).toBe(15);
    expect(jogador.defensive).toBe(10);
  });

  it("devolve null na categoria sem nenhum cooldown usado", () => {
    const [jogador] = buildCooldownUsage([evento(5, AVATAR.spellId, 0)], janelas, catalogo);

    expect(jogador.offensive).toBe(15);
    expect(jogador.defensive).toBeNull();
  });

  // Rotação é a maior parte dos eventos do log. Se entrasse no cálculo, a
  // média de "cooldowns" viraria média de tudo que a pessoa aperta.
  it("ignora habilidade que não está no catálogo de cooldowns", () => {
    const [jogador] = buildCooldownUsage(
      [evento(5, AVATAR.spellId, 0), evento(5, 12345, 1_000)],
      janelas,
      catalogo
    );

    expect(jogador.abilities.map((a) => a.spellId)).toEqual([AVATAR.spellId]);
  });

  // Quem entrou no meio da noite não pode ser medido contra as trys em que
  // estava fora do raide.
  it("só considera as trys em que o jogador aparece", () => {
    const duasTrys = [
      { id: 1, startTime: 0, endTime: 600_000 },
      { id: 2, startTime: 600_000, endTime: 1_200_000 },
    ];

    const [jogador] = buildCooldownUsage(
      [{ sourceID: 5, abilityGameID: AVATAR.spellId, timestamp: 0, fight: 1 }],
      duasTrys,
      catalogo
    );

    expect(jogador.abilities[0].possibleMs).toBe(600_000);
    expect(jogador.offensive).toBe(15);
  });

  it("acumula a mesma habilidade ao longo de várias trys", () => {
    const duasTrys = [
      { id: 1, startTime: 0, endTime: 600_000 },
      { id: 2, startTime: 600_000, endTime: 1_200_000 },
    ];

    const [jogador] = buildCooldownUsage(
      [
        { sourceID: 5, abilityGameID: AVATAR.spellId, timestamp: 0, fight: 1 },
        { sourceID: 5, abilityGameID: AVATAR.spellId, timestamp: 600_000, fight: 2 },
      ],
      duasTrys,
      catalogo
    );

    expect(jogador.abilities[0].casts).toBe(2);
    expect(jogador.abilities[0].timeOnCooldownMs).toBe(180_000);
    expect(jogador.abilities[0].possibleMs).toBe(1_200_000);
  });

  it("ignora evento de try que não está na lista de janelas", () => {
    const fora = { sourceID: 5, abilityGameID: AVATAR.spellId, timestamp: 0, fight: 99 };
    expect(buildCooldownUsage([fora], janelas, catalogo)).toEqual([]);
  });

  // Ancorado na tela do WoW Analyzer que serviu de referência: Avatar,
  // 7 casts, aparece como 84,54%. 7 × 90s ÷ 745s = 84,6%.
  it("reproduz a ordem de grandeza da tela de referência do WoW Analyzer", () => {
    const luta = [{ id: 1, startTime: 0, endTime: 745_000 }];
    const casts = [0, 90_000, 180_000, 270_000, 360_000, 450_000, 540_000].map((t) =>
      evento(5, AVATAR.spellId, t)
    );

    const [jogador] = buildCooldownUsage(casts, luta, catalogo);

    expect(jogador.offensive).toBeCloseTo(84.6, 0);
  });
});
