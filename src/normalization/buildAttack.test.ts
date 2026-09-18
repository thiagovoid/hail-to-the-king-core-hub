import { describe, expect, it } from "vitest";

import type { CooldownsDoJogador } from "../providers/warcraftlogs/cooldownUsage";
import { buildAttack, calculateUptime } from "./buildAttack";

const cooldowns = (abilities: CooldownsDoJogador["abilities"]): CooldownsDoJogador => {
  const media = (kind: "offensive" | "defensive") => {
    const filtradas = abilities.filter((a) => a.kind === kind);
    return filtradas.length ? filtradas.reduce((s, a) => s + a.efficiency, 0) / filtradas.length : null;
  };
  return { sourceID: 1, abilities, offensive: media("offensive"), defensive: media("defensive") };
};

const uso = (
  name: string,
  efficiency: number,
  kind: "offensive" | "defensive" = "offensive",
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

describe("calculateUptime", () => {
  it("converte tempo ativo em percentual da luta", () => {
    expect(calculateUptime(450_000, 600_000)).toBe(75);
  });

  // O agregado da noite pode somar trys que não entraram na duração — sem
  // teto, a nota daria crédito por tempo que não existiu.
  it("limita a 100%", () => {
    expect(calculateUptime(700_000, 600_000)).toBe(100);
  });

  it("devolve undefined sem duração de luta", () => {
    expect(calculateUptime(450_000, 0)).toBeUndefined();
  });
});

describe("buildAttack", () => {
  it("faz a média das duas metades", () => {
    const resultado = buildAttack(80, cooldowns([uso("Avatar", 60)]));

    expect(resultado?.attack).toEqual({ score: 70, uptime: 80, cooldowns: 60 });
  });

  // Spec sem cooldown ofensivo, ou jogador que não apertou nenhum: fingir
  // zero numa metade que não dá pra medir afundaria a nota sem motivo.
  it("usa só o uptime quando não há cooldown ofensivo medido", () => {
    const resultado = buildAttack(80, cooldowns([uso("Blur", 40, "defensive")]));

    expect(resultado?.attack).toEqual({ score: 80, uptime: 80, cooldowns: null });
  });

  it("aceita jogador sem nenhum dado de cooldown", () => {
    expect(buildAttack(80, undefined)?.attack.score).toBe(80);
  });

  // Uptime é a metade que existe pra todo mundo; sem ela não há dimensão.
  it("não produz nota sem uptime", () => {
    expect(buildAttack(undefined, cooldowns([uso("Avatar", 60)]))).toBeUndefined();
  });

  it("deixa os cooldowns defensivos fora da conta ofensiva", () => {
    const resultado = buildAttack(80, cooldowns([uso("Avatar", 60), uso("Blur", 20, "defensive")]));

    expect(resultado?.attack.cooldowns).toBe(60);
    expect(resultado?.attackDetail.map((d) => d.name)).toEqual(["Avatar"]);
  });

  // O topo da lista é o que a pessoa tem pra treinar.
  it("lista os cooldowns do pior aproveitado pro melhor", () => {
    const resultado = buildAttack(
      80,
      cooldowns([uso("Bem usado", 90), uso("Mal usado", 30), uso("Mediano", 60)])
    );

    expect(resultado?.attackDetail.map((d) => d.name)).toEqual(["Mal usado", "Mediano", "Bem usado"]);
  });

  it("leva casts e spellId pro detalhe, pra tela conseguir explicar a nota", () => {
    const resultado = buildAttack(80, cooldowns([uso("Avatar", 45, "offensive", 7)]));

    expect(resultado?.attackDetail[0]).toEqual({
      spellId: "Avatar".length,
      name: "Avatar",
      casts: 7,
      efficiency: 45,
    });
  });
});
