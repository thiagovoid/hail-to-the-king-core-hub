/**
 * "Atacar corretamente": junta as duas metades que a métrica pede — uptime
 * e cooldowns ofensivos — numa nota só.
 *
 * Por que as duas juntas, e não só cooldowns: dá pra ter 100% de cooldown
 * em recarga e ainda assim ficar parado entre eles. E dá pra ter uptime
 * cheio apertando só o preenchimento, sem nunca gastar o cooldown grande.
 * Cada metade cobre o buraco da outra.
 */

import type { CooldownsDoJogador, UsoDeCooldown } from "../providers/warcraftlogs/cooldownUsage";
import type { PlayerPerformance } from "../types/performance";

export interface AtaqueDoJogador {
  attack: NonNullable<PlayerPerformance["attack"]>;
  attackDetail: NonNullable<PlayerPerformance["attackDetail"]>;
}

/** Uptime cru da tabela da WCL: tempo ativo sobre a duração somada das trys. */
export function calculateUptime(activeTimeMs: number, aggregateDurationMs: number): number | undefined {
  if (aggregateDurationMs <= 0 || activeTimeMs < 0) return undefined;
  // O agregado da noite pode passar de 100% quando o jogador aparece em
  // trys que não entraram na duração somada. Teto em 100 — acima disso a
  // nota viraria crédito por tempo que não existiu.
  return Math.min(100, Math.round((activeTimeMs / aggregateDurationMs) * 1000) / 10);
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Monta a dimensão. Sem uptime não há nota: é a metade que existe pra todo
 * mundo. Sem cooldown ofensivo usado (spec que não tem, ou jogador que não
 * apertou nenhum), a nota é o uptime sozinho — melhor do que fingir zero
 * numa metade que não dá pra medir.
 */
export function buildAttack(
  uptime: number | undefined,
  cooldowns: CooldownsDoJogador | undefined
): AtaqueDoJogador | undefined {
  if (uptime === undefined) return undefined;

  const ofensivos: UsoDeCooldown[] = (cooldowns?.abilities ?? []).filter(
    (habilidade) => habilidade.kind === "offensive"
  );

  const notaCooldowns = cooldowns?.offensive ?? null;
  const score = notaCooldowns === null ? uptime : (uptime + notaCooldowns) / 2;

  return {
    attack: {
      score: arredondar(score),
      uptime: arredondar(uptime),
      cooldowns: notaCooldowns === null ? null : arredondar(notaCooldowns),
    },
    // Do pior aproveitado pro melhor: o topo da lista é o que treinar.
    attackDetail: ofensivos
      .slice()
      .sort((a, b) => a.efficiency - b.efficiency)
      .map((habilidade) => ({
        spellId: habilidade.spellId,
        name: habilidade.name,
        casts: habilidade.casts,
        efficiency: habilidade.efficiency,
      })),
  };
}
