import { describe, expect, it } from "vitest";

import type { CooldownsDoJogador } from "../providers/warcraftlogs/cooldownUsage";
import { buildDefense, calculateDtps, calculateMitigation } from "./buildDefense";

const uso = (
  name: string,
  efficiency: number,
  kind: "offensive" | "defensive" = "defensive",
  casts = 5
): CooldownsDoJogador["abilities"][number] => ({
  spellId: name.length,
  name,
  kind,
  casts,
  efficiency,
  timeOnCooldownMs: 0,
  possibleMs: 0,
});

const cooldowns = (abilities: CooldownsDoJogador["abilities"]): CooldownsDoJogador => {
  const media = (kind: "offensive" | "defensive") => {
    const filtradas = abilities.filter((a) => a.kind === kind);
    return filtradas.length ? filtradas.reduce((s, a) => s + a.efficiency, 0) / filtradas.length : null;
  };
  return { sourceID: 1, possibleMs: 600_000, abilities, offensive: media("offensive"), defensive: media("defensive") };
};

describe("calculateMitigation", () => {
  it("mede o que foi cortado sobre o que vinha", () => {
    expect(calculateMitigation({ total: 600, totalReduced: 400 })).toBe(40);
  });

  it("devolve undefined quando nada veio na direção do jogador", () => {
    expect(calculateMitigation({ total: 0, totalReduced: 0 })).toBeUndefined();
  });
});

describe("calculateDtps", () => {
  it("divide o dano recebido pelo tempo de luta", () => {
    expect(calculateDtps(600_000, 600_000)).toBe(1000);
  });

  it("devolve undefined sem tempo de luta", () => {
    expect(calculateDtps(600_000, 0)).toBeUndefined();
  });
});

describe("buildDefense", () => {
  const dano = { total: 600_000, totalReduced: 400_000 };

  it("tira a nota da média dos cooldowns defensivos", () => {
    const resultado = buildDefense(dano, 600_000, cooldowns([uso("Shield Wall", 70), uso("Rallying Cry", 50)]));

    expect(resultado?.defense.score).toBe(60);
  });

  it("carrega mitigação e DTPS como contexto, sem pontuar", () => {
    const resultado = buildDefense(dano, 600_000, cooldowns([uso("Shield Wall", 70)]));

    expect(resultado?.defense.mitigation).toBe(40);
    expect(resultado?.defense.dtps).toBe(1000);
    expect(resultado?.defense.score).toBe(70);
  });

  // Pode ser que a pessoa não tenha usado, mas também pode ser que a spec
  // dela não tenha nenhum reconhecido. Null sai da média ponderada do Score
  // Engine; zero afundaria a nota de quem talvez não tenha culpa.
  it("deixa a nota nula quando nenhum cooldown defensivo foi medido", () => {
    const resultado = buildDefense(dano, 600_000, cooldowns([uso("Avatar", 90, "offensive")]));

    expect(resultado?.defense.score).toBeNull();
    expect(resultado?.defense.mitigation).toBe(40);
  });

  it("não produz dimensão pra quem não aparece na tabela de dano recebido", () => {
    expect(buildDefense(undefined, 600_000, cooldowns([uso("Shield Wall", 70)]))).toBeUndefined();
  });

  it("deixa os cooldowns ofensivos fora da conta defensiva", () => {
    const resultado = buildDefense(dano, 600_000, cooldowns([uso("Shield Wall", 70), uso("Avatar", 10, "offensive")]));

    expect(resultado?.defense.score).toBe(70);
    expect(resultado?.defenseDetail.map((d) => d.name)).toEqual(["Shield Wall"]);
  });

  it("lista os cooldowns do pior aproveitado pro melhor", () => {
    const resultado = buildDefense(
      dano,
      600_000,
      cooldowns([uso("Bem usado", 90), uso("Mal usado", 20), uso("Mediano", 55)])
    );

    expect(resultado?.defenseDetail.map((d) => d.name)).toEqual(["Mal usado", "Mediano", "Bem usado"]);
  });
});
