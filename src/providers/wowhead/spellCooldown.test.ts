import { describe, expect, it } from "vitest";

import {
  COOLDOWN_MINIMO_MS,
  classifyCooldown,
  extractCharges,
  extractCooldownMs,
  parseSpellTooltip,
} from "./spellCooldown";

// Textos reduzidos dos tooltips reais devolvidos por
// nether.wowhead.com/tooltip/spell/{id} (conferidos em 18/09).
const AVATAR = {
  name: "Avatar",
  tooltip:
    "<b>Avatar</b><br>Talent<br>Instant<br>1.5 min cooldown<br>Requires Warrior<br>" +
    "Transform into a colossus, increasing all damage you deal by 20%.",
};

const BLUR = {
  name: "Blur",
  tooltip:
    "<b>Blur</b><br>Instant<br>1 min cooldown<br>1 Charge<br>Requires Demon Hunter<br>" +
    "Reduces all damage taken by 25% for 10 sec.",
};

const EYE_BEAM = {
  name: "Eye Beam",
  tooltip:
    "<b>Eye Beam</b><br>Talent<br>30 Fury<br>Channeled (2 sec cast)<br>30 sec cooldown<br>" +
    "Blasts all enemies in front of you.",
};

const CHAOS_STRIKE = {
  name: "Chaos Strike",
  tooltip: "<b>Chaos Strike</b><br>40 Fury<br>Instant<br>Requires Demon Hunter<br>Slice your target.",
};

describe("extractCooldownMs", () => {
  it("lê recarga em segundos", () => {
    expect(extractCooldownMs("30 sec cooldown")).toBe(30_000);
  });

  it("lê recarga fracionada em minutos", () => {
    expect(extractCooldownMs("1.5 min cooldown")).toBe(90_000);
  });

  it("aceita 'recharge' no lugar de 'cooldown'", () => {
    expect(extractCooldownMs("20 sec recharge")).toBe(20_000);
  });

  it("devolve undefined quando a magia não tem recarga", () => {
    expect(extractCooldownMs("40 Fury Instant Slice your target")).toBeUndefined();
  });

  // O tooltip traz vários números antes da recarga (custo, alcance, cast
  // time). Pegar o primeiro número da string daria 40, não 30.
  it("não confunde custo de recurso com recarga", () => {
    expect(extractCooldownMs("30 Fury 20 yd range 2 sec cast 30 sec cooldown")).toBe(30_000);
  });
});

describe("extractCharges", () => {
  it("assume uma carga quando o tooltip não menciona cargas", () => {
    expect(extractCharges("1.5 min cooldown")).toBe(1);
  });

  it("lê a quantidade declarada", () => {
    expect(extractCharges("30 sec cooldown 2 Charges")).toBe(2);
  });
});

describe("classifyCooldown", () => {
  it("trata mitigação de dano recebido como defensivo", () => {
    expect(classifyCooldown("Reduces all damage taken by 25% for 10 sec.")).toBe("defensive");
  });

  it("trata absorção como defensivo", () => {
    expect(classifyCooldown("Absorbing 500 damage.")).toBe("defensive");
  });

  // Avatar e Metamorphosis não causam dano direto — não dá pra classificar
  // olhando a tabela de dano da WCL, só pelo efeito descrito.
  it("trata buff puro de dano como ofensivo", () => {
    expect(classifyCooldown("increasing all damage you deal by 20%")).toBe("offensive");
  });

  // "damage you deal" contém "damage" mas não é mitigação: o sinal precisa
  // ser o dano RECEBIDO, senão todo cooldown ofensivo vira defensivo.
  it("não confunde dano causado com dano recebido", () => {
    expect(classifyCooldown("Deals 400 Fire damage to all enemies.")).toBe("offensive");
  });

  it("não classifica como ataque o que não causa nem previne dano", () => {
    expect(classifyCooldown("Teleports you a short distance forward.")).toBe("utility");
  });
});

describe("parseSpellTooltip", () => {
  it("monta a entrada completa de um cooldown ofensivo", () => {
    expect(parseSpellTooltip(107574, AVATAR)).toEqual({
      spellId: 107574,
      name: "Avatar",
      cooldownMs: 90_000,
      charges: 1,
      kind: "offensive",
    });
  });

  it("monta a entrada completa de um cooldown defensivo", () => {
    expect(parseSpellTooltip(198589, BLUR)).toEqual({
      spellId: 198589,
      name: "Blur",
      cooldownMs: 60_000,
      charges: 1,
      kind: "defensive",
    });
  });

  it("aceita habilidade exatamente no piso de 30s", () => {
    expect(parseSpellTooltip(198013, EYE_BEAM)?.cooldownMs).toBe(COOLDOWN_MINIMO_MS);
  });

  it("descarta habilidade de rotação, que não tem recarga", () => {
    expect(parseSpellTooltip(344862, CHAOS_STRIKE)).toBeUndefined();
  });

  it("descarta recarga curta demais pra ser decisão tática", () => {
    const preenchimento = { name: "Filler", tooltip: "8 sec cooldown Deals damage." };
    expect(parseSpellTooltip(1, preenchimento)).toBeUndefined();
  });

  it("descarta tooltip vazio em vez de inventar habilidade", () => {
    expect(parseSpellTooltip(1, {})).toBeUndefined();
  });
});

// Casos tirados da primeira coleta real (log de 15/09), em que a
// classificação de duas vias mandou todos eles pra "ofensivo".
describe("classifyCooldown — casos que a coleta real errou", () => {
  const caso = (texto: string) => classifyCooldown(texto);

  it("cura própria de item é defensiva, não ofensiva", () => {
    expect(caso("Healthstone Item Effect Instant 1 min cooldown Instantly restores 25% health")).toBe(
      "defensive"
    );
  });

  it("vida temporária de raide é defensiva", () => {
    expect(
      caso("Lets loose a rallying cry, granting all party or raid members 10% temporary and maximum health")
    ).toBe("defensive");
  });

  it("cura em aliado é defensiva", () => {
    expect(caso("Heals a friendly target for an amount equal to 100% your maximum health.")).toBe(
      "defensive"
    );
  });

  it("battle res não é cooldown de ataque nem de defesa", () => {
    expect(
      caso("Petition the Light on behalf of a fallen ally, restoring spirit to body and allowing them to reenter battle")
    ).toBe("utility");
  });

  it("stun puro não é cooldown de ataque", () => {
    expect(caso("Stuns the target for 6 sec.")).toBe("utility");
  });

  it("invocação de pet não é cooldown de ataque", () => {
    expect(caso("Raises a ghoul to fight by your side.")).toBe("utility");
  });

  it("controle de grupo sem dano não é cooldown de ataque", () => {
    expect(
      caso("Shadowy tendrils coil around all enemies within 15 yards, pulling them to the target's location and Silencing them")
    ).toBe("utility");
  });

  // "causing them to wander disoriented ... Damage may cancel the effect":
  // as duas palavras aparecem, mas em orações diferentes, e a habilidade não
  // dá dano nenhum.
  it("não confunde 'dano cancela o efeito' com habilidade que causa dano", () => {
    expect(
      caso("Targets in a cone in front of you are blinded, causing them to wander disoriented for 5 sec. Damage may cancel the effect.")
    ).toBe("utility");
  });

  it("stun que também causa dano é ofensivo", () => {
    expect(
      caso("Sends a wave of force in a frontal cone, causing (20% of Attack Power) damage and stunning all enemies")
    ).toBe("offensive");
  });

  // Shield Charge dá dano E concede Shield Block. Na prática é decisão de
  // quando apertar pra atacar.
  it("híbrida que causa dano conta como ofensiva", () => {
    expect(
      caso("Charge to an enemy with your shield, granting you Shield Block and dealing (840% of Attack Power) Physical damage")
    ).toBe("offensive");
  });

  it("dano em área sobre o chão é ofensivo", () => {
    expect(caso("Corrupts the targeted ground, causing Shadow damage over 10 sec to targets")).toBe(
      "offensive"
    );
  });
});

// Death and Decay caiu em "utility" na segunda coleta real porque o guarda
// de fim de frase (`[^.]`) barrava o ponto decimal de "8.3% of Attack Power".
describe("classifyCooldown — ponto decimal no meio da frase", () => {
  it("enxerga o dano mesmo com número quebrado no meio", () => {
    expect(
      classifyCooldown("Corrupts the targeted ground, causing [(8.3% of Attack Power) * 11] Shadow damage over 10 sec")
    ).toBe("offensive");
  });

  it("continua barrando quando o ponto é fim de frase de verdade", () => {
    expect(classifyCooldown("Stuns the target for 6 sec. Damage may cancel the effect.")).toBe("utility");
  });
});

// Sem esquiva e aparo, nenhum cooldown de tank era reconhecido como
// defensivo: Dancing Rune Weapon não usa a palavra "damage" em lugar nenhum.
describe("classifyCooldown — cooldowns de evasão", () => {
  it("trata aparo como defensivo", () => {
    expect(
      classifyCooldown("Summons a rune weapon that mirrors your melee attacks and bolsters your defenses. While active, you gain 30% parry chance.")
    ).toBe("defensive");
  });

  it("trata esquiva como defensiva", () => {
    expect(classifyCooldown("Increases your dodge chance by 100% for 8 sec.")).toBe("defensive");
  });
});
