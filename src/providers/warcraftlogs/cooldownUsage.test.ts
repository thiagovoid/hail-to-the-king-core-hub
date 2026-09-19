import { describe, expect, it } from "vitest";

import type { CooldownDaMagia } from "../wowhead/spellCooldown";
import {
  buildCooldownUsage,
  buildDamageShares,
  categoriaEfetiva,
  contaParaNota,
  tempoEmRecarga,
  type EventoDeCast,
  type UsoDeCooldown,
  ehUso,
} from "./cooldownUsage";

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

const STUN: CooldownDaMagia = {
  spellId: 853,
  name: "Hammer of Justice",
  cooldownMs: 45_000,
  charges: 1,
  kind: "utility",
};

const catalogo = new Map([AVATAR, BLUR, DUAS_CARGAS, STUN].map((m) => [m.spellId, m]));

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

  // Stun, silêncio, battle res e invocação de pet não são decisão de atacar
  // nem de se defender. Na primeira coleta real eles caíam em "ofensivo" por
  // descarte e afundavam a média.
  it("deixa habilidade de utilidade fora da conta e do detalhe", () => {
    const [jogador] = buildCooldownUsage(
      [evento(5, AVATAR.spellId, 0), evento(5, STUN.spellId, 0)],
      janelas,
      catalogo
    );

    expect(jogador.abilities.map((a) => a.spellId)).toEqual([AVATAR.spellId]);
    expect(jogador.offensive).toBe(15);
  });

  it("informa o tempo de presença, que serve de denominador do uptime", () => {
    const duasTrys = [
      { id: 1, startTime: 0, endTime: 600_000 },
      { id: 2, startTime: 600_000, endTime: 1_200_000 },
    ];

    const [jogador] = buildCooldownUsage(
      [{ sourceID: 5, abilityGameID: AVATAR.spellId, timestamp: 0, fight: 1 }],
      duasTrys,
      catalogo
    );

    expect(jogador.possibleMs).toBe(600_000);
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

describe("buildDamageShares", () => {
  it("converte dano por habilidade em percentual do total do jogador", () => {
    const shares = buildDamageShares([
      { sourceID: 5, abilities: [{ name: "Eye Beam", total: 250 }, { name: "Chaos Strike", total: 750 }] },
    ]);

    expect(shares.get(5)?.get("eye beam")).toBe(25);
    expect(shares.get(5)?.get("chaos strike")).toBe(75);
  });

  it("ignora jogador sem dano, em vez de dividir por zero", () => {
    expect(buildDamageShares([{ sourceID: 5, abilities: [{ name: "Eye Beam", total: 0 }] }]).size).toBe(0);
  });

  // O caso concreto: Feral Lunge é 0,00% do dano do Gunst. Precisa aparecer
  // com participação zero, não sumir — sumir é indistinguível de buff puro.
  it("registra com zero a habilidade que aparece sem dano nenhum", () => {
    const shares = buildDamageShares([
      {
        sourceID: 12,
        abilities: [{ name: "Crash Lightning", total: 1000 }, { name: "Feral Lunge", total: 0 }],
      },
    ]);

    expect(shares.get(12)?.get("feral lunge")).toBe(0);
  });
});

// O caso que motivou o filtro: na coleta de 15/09 um jogador com 97% de
// uptime ficou com nota 52 porque o único "cooldown ofensivo" detectado foi
// um gap closer que causa dano incidental (Feral Lunge, 8%).
describe("buildCooldownUsage — relevância por participação no dano", () => {
  const janelas = [{ id: 1, startTime: 0, endTime: 600_000 }];
  const GAP_CLOSER: CooldownDaMagia = {
    spellId: 777,
    name: "Feral Lunge",
    cooldownMs: 30_000,
    charges: 1,
    kind: "offensive",
  };
  const comGapCloser = new Map([...catalogo, [GAP_CLOSER.spellId, GAP_CLOSER]]);

  const cast = (spellId: number, timestamp: number): EventoDeCast => ({
    sourceID: 5,
    abilityGameID: spellId,
    timestamp,
    fight: 1,
  });

  it("descarta habilidade que quase não participa do dano", () => {
    const shares = new Map([[5, new Map([["feral lunge", 0.4]])]]);
    const [jogador] = buildCooldownUsage([cast(GAP_CLOSER.spellId, 0)], janelas, comGapCloser, shares);

    expect(jogador.abilities).toEqual([]);
    expect(jogador.offensive).toBeNull();
  });

  it("mantém habilidade que representa dano de verdade", () => {
    const shares = new Map([[5, new Map([["feral lunge", 18]])]]);
    const [jogador] = buildCooldownUsage([cast(GAP_CLOSER.spellId, 0)], janelas, comGapCloser, shares);

    expect(jogador.abilities.map((a) => a.spellId)).toEqual([GAP_CLOSER.spellId]);
    expect(jogador.abilities[0].damageShare).toBe(18);
  });

  // Avatar e Avenging Wrath não causam dano próprio: não aparecem na tabela
  // de dano. Sem a exceção, o filtro jogaria fora os maiores cooldowns
  // ofensivos do jogo.
  it("mantém buff de dano, que não aparece na tabela de dano", () => {
    const comBuff = new Map([[AVATAR.spellId, AVATAR]]);
    // Avatar não tem entrada própria: o jogador causou dano, mas nenhum
    // deles saiu dela. É assim que um buff puro se apresenta no log.
    const shares = new Map([[5, new Map([["chaos strike", 100]])]]);

    const [jogador] = buildCooldownUsage([cast(AVATAR.spellId, 0)], janelas, comBuff, shares);

    expect(jogador.abilities.map((a) => a.name)).toEqual(["Avatar"]);
  });

  // Mitigação não aparece na tabela de dano: filtrar defensivo por dano
  // apagaria a categoria inteira.
  it("nunca filtra cooldown defensivo por participação no dano", () => {
    const shares = new Map([[5, new Map<string, number>()]]);
    const [jogador] = buildCooldownUsage([cast(BLUR.spellId, 0)], janelas, catalogo, shares);

    expect(jogador.defensive).toBe(10);
  });

  it("não filtra nada quando a tabela de dano não foi passada", () => {
    const [jogador] = buildCooldownUsage([cast(GAP_CLOSER.spellId, 0)], janelas, comGapCloser);

    expect(jogador.abilities.map((a) => a.spellId)).toEqual([GAP_CLOSER.spellId]);
  });
});

// Doom Winds, o cooldown de dano do xamã Aperfeiçoamento, não usa a palavra
// "damage" no tooltip — fala em Windfury — e caía em "utility". O jogador
// ficava com "sem cooldown ofensivo medido na noite" tendo 97% de uptime.
describe("categoriaEfetiva", () => {
  const CURTO = 30_000;
  const LONGO = 180_000;

  it("promove utilidade que responde por parte relevante do dano", () => {
    expect(categoriaEfetiva("utility", CURTO, 3.3)).toBe("offensive");
  });

  it("mantém como utilidade a habilidade curta que quase não causa dano", () => {
    expect(categoriaEfetiva("utility", CURTO, 0.2)).toBe("utility");
  });

  // Ascendance é o cooldown do xamã Aperfeiçoamento, mas o dano dela sai com
  // o nome de outras habilidades: só 0,24% fica no nome dela. Feral Lunge é
  // um gap closer com 0,00%. Participação no dano não separa as duas; a
  // recarga separa.
  it("promove utilidade de recarga longa com qualquer dano próprio", () => {
    expect(categoriaEfetiva("utility", LONGO, 0.24)).toBe("offensive");
  });

  // Reincarnation tem 30 minutos de recarga e nenhum dano. Recarga longa
  // sozinha não pode promover, senão battle res vira cooldown de ataque.
  it("não promove recarga longa sem dano nenhum", () => {
    expect(categoriaEfetiva("utility", LONGO, 0)).toBe("utility");
    expect(categoriaEfetiva("utility", LONGO, undefined)).toBe("utility");
  });

  it("não mexe em quem o tooltip já classificou", () => {
    expect(categoriaEfetiva("offensive", CURTO, 0)).toBe("offensive");
    expect(categoriaEfetiva("defensive", CURTO, 50)).toBe("defensive");
  });
});

describe("buildCooldownUsage — promoção de utilidade", () => {
  const janelas = [{ id: 1, startTime: 0, endTime: 600_000 }];
  const DOOM_WINDS: CooldownDaMagia = {
    spellId: 384352,
    name: "Doom Winds",
    cooldownMs: 60_000,
    charges: 1,
    kind: "utility",
  };
  const comDoomWinds = new Map([[DOOM_WINDS.spellId, DOOM_WINDS]]);
  const cast = (spellId: number, timestamp: number): EventoDeCast => ({
    sourceID: 12,
    abilityGameID: spellId,
    timestamp,
    fight: 1,
  });

  it("dá nota ofensiva a quem só tem cooldown que o tooltip não reconheceu", () => {
    const shares = new Map([[12, new Map([["doom winds", 3.3]])]]);
    const [jogador] = buildCooldownUsage([cast(DOOM_WINDS.spellId, 0)], janelas, comDoomWinds, shares);

    expect(jogador.abilities.map((a) => a.name)).toEqual(["Doom Winds"]);
    expect(jogador.offensive).toBe(10);
  });

  it("segue descartando utilidade sem dano", () => {
    const shares = new Map([[12, new Map([["doom winds", 0.1]])]]);
    const [jogador] = buildCooldownUsage([cast(DOOM_WINDS.spellId, 0)], janelas, comDoomWinds, shares);

    expect(jogador.abilities).toEqual([]);
    expect(jogador.offensive).toBeNull();
  });
});

describe("contaParaNota — recarga longa é decisão planejada", () => {
  const uso = (kind: "offensive" | "defensive", damageShare?: number): UsoDeCooldown => ({
    spellId: 1,
    name: "x",
    kind,
    casts: 1,
    timeOnCooldownMs: 0,
    possibleMs: 0,
    efficiency: 0,
    ...(damageShare === undefined ? {} : { damageShare }),
  });

  // Shattering Throw causa 600% de Attack Power mas representa pouco do dano
  // total. Com 3 minutos de recarga, quando usar é decisão, não reflexo.
  it("mantém cooldown longo com pouco dano direto", () => {
    expect(contaParaNota(uso("offensive", 0.9), 180_000, true)).toBe(true);
  });

  // Storm Bolt tem 30s: aperta no meio da rotação, o dano é incidental.
  it("descarta cooldown curto com pouco dano direto", () => {
    expect(contaParaNota(uso("offensive", 0.9), 30_000, true)).toBe(false);
  });

  it("mantém quem não aparece na tabela de dano, em qualquer recarga", () => {
    expect(contaParaNota(uso("offensive"), 30_000, true)).toBe(true);
  });
});

// Immolation Aura saía duas vezes no detalhe do mesmo jogador, com
// aproveitamentos diferentes: são dois spell IDs conforme o talento. Pra
// quem lê a tela é uma habilidade só.
describe("buildCooldownUsage — mesma habilidade com ids diferentes", () => {
  const janelas = [{ id: 1, startTime: 0, endTime: 600_000 }];
  const base = { name: "Immolation Aura", cooldownMs: 30_000, charges: 1, kind: "offensive" as const };
  const A: CooldownDaMagia = { spellId: 258920, ...base };
  const B: CooldownDaMagia = { spellId: 427917, ...base };
  const doisIds = new Map([
    [A.spellId, A],
    [B.spellId, B],
  ]);
  const cast = (spellId: number, timestamp: number): EventoDeCast => ({
    sourceID: 7,
    abilityGameID: spellId,
    timestamp,
    fight: 1,
  });

  it("junta os dois ids numa entrada só", () => {
    const shares = new Map([[7, new Map([["immolation aura", 12]])]]);
    const [jogador] = buildCooldownUsage(
      [cast(A.spellId, 0), cast(B.spellId, 30_000)],
      janelas,
      doisIds,
      shares
    );

    expect(jogador.abilities).toHaveLength(1);
    expect(jogador.abilities[0].casts).toBe(2);
  });

  // Se cada id entrasse com a recarga cheia, o tempo sairia inflado: dois
  // casts no mesmo instante contariam 60s em vez de 30s.
  it("não conta a recarga em dobro pelo id repetido", () => {
    const shares = new Map([[7, new Map([["immolation aura", 12]])]]);
    const [jogador] = buildCooldownUsage(
      [cast(A.spellId, 0), cast(B.spellId, 0)],
      janelas,
      doisIds,
      shares
    );

    expect(jogador.abilities[0].timeOnCooldownMs).toBe(30_000);
  });
});

// Earth Elemental é invocação, não decisão de dano: tem 3 minutos de recarga
// e uma fração de 0,00% do dano. Entrava valendo o mesmo que Ascendance
// (0,24%) e derrubava o jogador de 98 pra 75.
describe("piso de dano dos cooldowns longos", () => {
  const LONGO = 180_000;

  it("promove Ascendance, cujo dano sai com o nome de outras habilidades", () => {
    expect(categoriaEfetiva("utility", LONGO, 0.24)).toBe("offensive");
  });

  it("não promove invocação cujo dano é só arredondamento", () => {
    expect(categoriaEfetiva("utility", LONGO, 0.004)).toBe("utility");
  });

  it("aplica o mesmo piso a quem o tooltip já dizia ser ofensivo", () => {
    const uso = (damageShare: number): UsoDeCooldown => ({
      spellId: 1,
      name: "x",
      kind: "offensive",
      casts: 1,
      timeOnCooldownMs: 0,
      possibleMs: 0,
      efficiency: 0,
      damageShare,
    });

    expect(contaParaNota(uso(0.9), LONGO, true)).toBe(true);
    expect(contaParaNota(uso(0.004), LONGO, true)).toBe(false);
  });
});

describe("ehUso", () => {
  /**
   * Magia com tempo de conjuração emite begincast E cast. Contar os dois
   * consumia duas cargas em vez de uma: o Stormkeeper do jrxamã aparecia com
   * 94 usos numa noite de 47, e a eficiência saía inflada a favor dele.
   */
  it("não conta begincast como uso", () => {
    expect(ehUso({ type: "begincast" })).toBe(false);
    expect(ehUso({ type: "cast" })).toBe(true);
  });

  // Evento sem tipo é dado antigo, de antes desta checagem. Descartá-lo
  // apagaria a nota de Atacar de noites inteiras.
  it("conta evento sem tipo, por compatibilidade", () => {
    expect(ehUso({})).toBe(true);
  });
});

describe("buildCooldownUsage e o begincast", () => {
  it("conta uma conjuração longa como um uso só", () => {
    const catalogo = new Map<number, CooldownDaMagia>([
      [100, { spellId: 100, name: "Conjuração Longa", cooldownMs: 60_000, charges: 1, kind: "offensive" }],
    ]);
    const janelas = [{ id: 1, startTime: 0, endTime: 300_000 }];

    const comBegincast = buildCooldownUsage(
      [
        { timestamp: 10_000, sourceID: 5, abilityGameID: 100, fight: 1, type: "begincast" },
        { timestamp: 12_000, sourceID: 5, abilityGameID: 100, fight: 1, type: "cast" },
      ],
      janelas,
      catalogo
    );

    const soCast = buildCooldownUsage(
      [{ timestamp: 12_000, sourceID: 5, abilityGameID: 100, fight: 1, type: "cast" }],
      janelas,
      catalogo
    );

    expect(comBegincast[0].abilities[0].casts).toBe(1);
    expect(comBegincast[0].abilities[0].casts).toBe(soCast[0].abilities[0].casts);
    expect(comBegincast[0].abilities[0].efficiency).toBe(soCast[0].abilities[0].efficiency);
  });
});
