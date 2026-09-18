/**
 * "Defender corretamente": o que o jogador fez pra não morrer.
 *
 * A nota vem SÓ dos cooldowns defensivos. Mitigação e dano recebido são
 * coletados e exibidos, mas não pontuam — e isso foi decidido olhando o
 * dado, não por gosto:
 *
 * No log de 15/09 a mitigação ficou entre 38% e 48% pro raide inteiro, e os
 * três tanks ocuparam as três últimas posições (38,4%, 41,9%, 42,6%). Ela
 * não mede quem se defende bem: mede armadura e buff de raide, e tank toma
 * mais dano mágico, que armadura não corta. Pontuar isso daria nota quase
 * igual pra todo mundo e puniria justamente quem mais aperta defensivo.
 *
 * Dano recebido bruto também fica fora, por decisão do core: varia dez vezes
 * entre tank e ranged, e o dano EVITÁVEL já é medido por Mecânicas, que usa
 * a curadoria do Wipefest. Somar os dois contaria o mesmo erro duas vezes.
 */

import type { CooldownsDoJogador, UsoDeCooldown } from "../providers/warcraftlogs/cooldownUsage";
import type { PlayerPerformance } from "../types/performance";

export interface DanoRecebido {
  /** Dano que efetivamente entrou. */
  total: number;
  /** Dano que foi cortado antes de entrar (armadura, absorção, cooldown). */
  totalReduced: number;
}

export interface DefesaDoJogador {
  defense: NonNullable<PlayerPerformance["defense"]>;
  defenseDetail: NonNullable<PlayerPerformance["defenseDetail"]>;
}

/**
 * Percentual do dano que vinha na sua direção e não chegou a entrar.
 * Informativo — ver o comentário do topo pra por que não pontua.
 */
export function calculateMitigation(dano: DanoRecebido): number | undefined {
  const vinha = dano.total + dano.totalReduced;
  if (vinha <= 0) return undefined;
  return Math.round((dano.totalReduced / vinha) * 1000) / 10;
}

/** Dano recebido por segundo de luta. Informativo. */
export function calculateDtps(total: number, durationMs: number): number | undefined {
  if (durationMs <= 0 || total < 0) return undefined;
  return Math.round(total / (durationMs / 1000));
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Monta a dimensão. Sem dano recebido não há nada pra mostrar — jogador que
 * não aparece na tabela não esteve na luta.
 *
 * `score` fica null quando nenhum cooldown defensivo foi medido: pode ser
 * que a pessoa não tenha usado, mas também pode ser que a spec dela não
 * tenha nenhum reconhecido. Null sai da média ponderada em vez de virar
 * zero — a regra do Score Engine pra dimensão sem dado.
 */
export function buildDefense(
  dano: DanoRecebido | undefined,
  durationMs: number,
  cooldowns: CooldownsDoJogador | undefined
): DefesaDoJogador | undefined {
  if (!dano) return undefined;

  const mitigation = calculateMitigation(dano);
  const dtps = calculateDtps(dano.total, durationMs);
  if (mitigation === undefined || dtps === undefined) return undefined;

  const defensivos: UsoDeCooldown[] = (cooldowns?.abilities ?? []).filter(
    (habilidade) => habilidade.kind === "defensive"
  );
  const notaCooldowns = cooldowns?.defensive ?? null;

  return {
    defense: {
      // A nota É a média dos cooldowns defensivos. Um campo só, pra não
      // parecer que são duas coisas diferentes na tela.
      score: notaCooldowns === null ? null : arredondar(notaCooldowns),
      mitigation,
      dtps,
    },
    // Do pior aproveitado pro melhor: o topo da lista é o que treinar.
    defenseDetail: defensivos
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
