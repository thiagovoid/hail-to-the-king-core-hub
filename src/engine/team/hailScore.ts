/**
 * Hail Score — a nota do core como um todo, noite a noite.
 *
 * É a média dos Scores Gerais de quem jogou naquela noite. Usar a mesma
 * régua do score individual é o que faz os dois números fecharem entre si:
 * quando um jogador melhora, o Hail Score do core sobe junto, e ninguém precisa
 * explicar por que o painel diz uma coisa e a página da pessoa diz outra.
 *
 * A guild se chama Hail to the King, então a escada de títulos é a própria
 * gamificação: o core não persegue "78 pontos", persegue o trono.
 */

import type { PerformanceRun, WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import { calculateOverallScore, type FuncaoDoJogador } from "../scores";

/**
 * Diz a função de cada jogador. Vem de fora porque o week-NN.json guarda
 * desempenho, não cadastro — e sem isso o Hail Score mediria tank e healer
 * com a régua de dps.
 */
export type FuncaoPorJogador = (playerId: string) => FuncaoDoJogador | undefined;

export interface TituloDoHailScore {
  /** Piso da faixa, 0-100. */
  minimo: number;
  nome: string;
  /** Uma linha pra tela explicar o que a faixa significa. */
  descricao: string;
}

/**
 * Do mais baixo pro mais alto. A escada é curta de propósito: faixa demais
 * faz a subida virar ruído, e o salto de título deixa de ser notícia.
 */
export const TITULOS_DO_HAIL_SCORE: TituloDoHailScore[] = [
  { minimo: 0, nome: "Escudeiro", descricao: "O core está aprendendo o tier." },
  { minimo: 40, nome: "Cavaleiro", descricao: "Execução firme, com arestas visíveis." },
  { minimo: 60, nome: "Nobre", descricao: "O core cumpre o combinado na maior parte das noites." },
  { minimo: 75, nome: "Regente", descricao: "Pouca coisa separa o core do topo." },
  { minimo: 90, nome: "Rei", descricao: "Hail to the King." },
];

export function tituloDoHailScore(valor: number): TituloDoHailScore {
  // Do topo pra baixo: a primeira faixa cujo piso o valor alcança é a dele.
  return [...TITULOS_DO_HAIL_SCORE].reverse().find((faixa) => valor >= faixa.minimo) ?? TITULOS_DO_HAIL_SCORE[0];
}

/**
 * O Hail Score de uma noite. Null quando nenhum jogador daquela run teve score —
 * noite sem dado não vira zero, pela mesma razão que uma dimensão sem dado
 * sai da média em vez de pesar contra.
 */
export function hailScoreDaRun(
  run: PerformanceRun,
  targets: CorePerformanceTargets,
  funcaoDe?: FuncaoPorJogador
): number | null {
  const notas = run.players
    .map((player) => calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall)
    .filter((nota): nota is number => nota !== null);

  if (notas.length === 0) return null;

  return Math.round(notas.reduce((soma, nota) => soma + nota, 0) / notas.length);
}

export interface PontoDoHailScore {
  date: string;
  value: number;
}

/** A série do Hail Score ao longo da temporada, em ordem cronológica. */
export function serieDoHailScore(
  weeks: WeeklyPerformance[],
  targets: CorePerformanceTargets,
  funcaoDe?: FuncaoPorJogador
): PontoDoHailScore[] {
  return weeks
    .flatMap((week) => week.runs)
    .map((run) => ({ date: run.date, nota: hailScoreDaRun(run, targets, funcaoDe) }))
    .filter((ponto): ponto is { date: string; nota: number } => ponto.nota !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((ponto) => ({ date: ponto.date, value: ponto.nota }));
}
