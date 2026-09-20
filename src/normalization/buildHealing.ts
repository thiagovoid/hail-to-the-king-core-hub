/**
 * "Curar corretamente".
 *
 * Curar mais não é curar melhor: quem cura muito costuma estar num raide que
 * apanhou muito, e isso não é mérito do healer. Por isso a régua não é HPS —
 * é quanto do dano que o raide tomou passou pelas mãos daquele healer.
 *
 * Conferido no log de 15/09: os três healers cobriram 25,3%, 21,1% e 18,5%
 * do dano da noite. A conta se auto-equilibra porque, se o time apanha mais,
 * sobem o numerador e o denominador juntos.
 *
 * A segunda metade é o desperdício. Cura que cai em quem já está cheio não
 * salvou ninguém, e o número separa bem: na mesma noite, de 26,7% a 35,7%
 * entre os healers — e Cowsadeer, que curou MAIS, foi quem desperdiçou MAIS.
 * Um número sozinho não conta essa história.
 */

import type { PlayerPerformance } from "../types/performance";

export interface CuraDoJogador {
  /** Cura que chegou a alguém. */
  effective: number;
  /** Cura que caiu em quem já estava cheio. */
  overheal: number;
}

export interface CuraDoJogadorComNota {
  healing: NonNullable<PlayerPerformance["healing"]>;
}

/** Quanto da cura lançada foi pro ralo, 0-100. */
export function calculateDesperdicio(cura: CuraDoJogador): number | undefined {
  const bruto = cura.effective + cura.overheal;
  if (bruto <= 0) return undefined;
  return Math.round((cura.overheal / bruto) * 1000) / 10;
}

/** Fatia do dano do raide que este healer cobriu, 0-100. */
export function calculateCobertura(efetiva: number, danoDoRaide: number): number | undefined {
  if (danoDoRaide <= 0) return undefined;
  return Math.round((efetiva / danoDoRaide) * 1000) / 10;
}

/**
 * Quanto o healer puxou do que caberia a ele, em %.
 *
 * O quinhão esperado é a cobertura somada dos healers dividida por quantos
 * eles eram. Isso se ajusta sozinho quando o raide vai com dois healers em
 * vez de três — uma meta fixa de cobertura quebraria exatamente aí, porque
 * com dois cada um precisa cobrir muito mais.
 */
export function calculateQuinhao(cobertura: number, coberturaDosHealers: number[]): number | undefined {
  if (coberturaDosHealers.length === 0) return undefined;

  const somaDoTime = coberturaDosHealers.reduce((soma, valor) => soma + valor, 0);
  if (somaDoTime <= 0) return undefined;

  const esperado = somaDoTime / coberturaDosHealers.length;
  if (esperado <= 0) return undefined;

  return Math.round((cobertura / esperado) * 1000) / 10;
}

/** Quanto do quinhão puxado a mais que o combinado ainda pontua. */
export const TETO_DO_QUINHAO = 130;

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Monta a dimensão de um healer.
 *
 * `score` combina as duas metades: o quinhão puxado e o aproveitamento, que
 * é o complemento do desperdício.
 *
 * O quinhão tinha teto em 100, com o argumento de que cobrir o dobro do seu
 * quinhão costuma significar que o outro healer faltou. A temporada desmente:
 * a Cowsadeer puxa entre 115% e 163% em SEIS noites seguidas, com os mesmos
 * healers ao lado. Isso não é ausência alheia, é trabalho — e o teto fazia
 * seis noites dela valerem o mesmo que puxar exatamente o combinado.
 *
 * O teto novo é 130: deixa a diferença aparecer sem transformar uma noite de
 * raide massacrado em nota impossível de alcançar.
 */
export function buildHealing(
  cura: CuraDoJogador,
  danoDoRaide: number,
  coberturaDosHealers: number[]
): CuraDoJogadorComNota | undefined {
  const cobertura = calculateCobertura(cura.effective, danoDoRaide);
  const desperdicio = calculateDesperdicio(cura);
  if (cobertura === undefined || desperdicio === undefined) return undefined;

  const quinhao = calculateQuinhao(cobertura, coberturaDosHealers);
  if (quinhao === undefined) return undefined;

  const aproveitamento = 100 - desperdicio;

  return {
    healing: {
      score: arredondar((Math.min(TETO_DO_QUINHAO, quinhao) + aproveitamento) / 2),
      coverage: cobertura,
      share: arredondar(quinhao),
      overheal: desperdicio,
    },
  };
}
