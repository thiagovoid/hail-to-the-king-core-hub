import { formatCompact } from "../../utils/format";
import { contarKills } from "../../providers/warcraftlogs/bossKills";
import type {
  PlayerPerformance,
  PlayerRunPerformance,
  WeeklyPerformance,
} from "../../types/performance";

/**
 * Returns all runs across all weeks, in chronological order
 * (sorted by week, then by date within the week).
 */
function getAllRuns(weeks: WeeklyPerformance[]) {
  return [...weeks]
    .sort((a, b) => a.week - b.week)
    .flatMap((week) =>
      [...week.runs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((run) => ({ week: week.week, run }))
    );
}

/**
 * Returns all performance records for a player across every run,
 * across every week, in chronological order.
 */
export function getPlayerHistory(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerRunPerformance[] {
  return getAllRuns(weeks).flatMap(({ week, run }) =>
    run.players
      .filter((player) => player.playerId === playerId)
      .map((player) => ({
        ...player,
        week,
        date: run.date,
        reportCode: run.reportCode,
      }))
  );
}

/**
 * Média do jogador na temporada, na forma de um PlayerPerformance — assim
 * o mesmo objeto alimenta o resumo, as metas e o Score Geral, e todo número
 * na tela do jogador passa a vir das mesmas runs.
 *
 * Cada métrica é a média das runs em que ela existe (quem não tem parse em
 * 2 das 5 runs tira média das 3 que tem). `itemLevel` é o último registrado,
 * não média: é um estado atual, não um acumulado.
 */
export interface PlayerSeasonAverage extends PlayerPerformance {
  /** Quantas runs entraram na média — o "rastro" do número. */
  runs: number;
  /**
   * Total de bosses que o jogador ajudou a derrubar na temporada, com
   * repetição: estar em três clears de Nek'zali conta três.
   */
  bossesMortos: number;
  /**
   * Total de mortes na temporada. Mortes não pontuam no Score Geral, mas o
   * acumulado é um número que o core quer ver — por isso soma, não média.
   */
  mortesNaSeason: number;
  /**
   * Total de erros mecânicos na temporada.
   *
   * Sai da SOMA do detalhe por mecânica, não de `errors × trys`: o campo
   * `errors` é média arredondada a uma casa, e multiplicar de volta acumula
   * o erro do arredondamento (118 exatos contra 119,3 aproximados, num
   * jogador só).
   */
  errosMecanicosNaSeason: number;
}

export function buildPlayerSeasonAverage(
  playerId: string,
  history: PlayerRunPerformance[]
): PlayerSeasonAverage {
  const average = (values: number[]): number | undefined =>
    values.length === 0 ? undefined : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  const defined = <T>(values: Array<T | undefined>): T[] => values.filter((value): value is T => value !== undefined);

  const mechanicErrors = average(defined(history.map((run) => run.mechanics?.errors)));

  return {
    playerId,
    runs: history.length,
    bossesMortos: contarKills(history.map((run) => run.bossKills)),
    mortesNaSeason: history.reduce((soma, run) => soma + run.deaths, 0),
    errosMecanicosNaSeason: history.reduce(
      (soma, run) => soma + (run.mechanicsDetail ?? []).reduce((total, item) => total + item.tries, 0),
      0
    ),
    dps: average(defined(history.map((run) => run.dps))),
    hps: average(defined(history.map((run) => run.hps))),
    parse: average(defined(history.map((run) => run.parse))),
    deaths: average(history.map((run) => run.deaths)) ?? 0,
    mechanics: mechanicErrors === undefined ? undefined : { errors: mechanicErrors },
    // Preparação é estado, não desempenho: é o que o jogador está usando
    // AGORA. Média não faz sentido — quem arrumou o gear esta semana
    // continuaria penalizado pelas semanas em que estava sem encanto. Vale
    // o saldo da última noite, igual ao item level.
    preparation: defined(history.map((run) => run.preparation)).at(-1),
    itemLevel: defined(history.map((run) => run.itemLevel)).at(-1),
  };
}

/**
 * Returns the most recent performance record for a player.
 */
export function getLatestPerformance(
  weeks: WeeklyPerformance[],
  playerId: string
): PlayerRunPerformance | undefined {
  const history = getPlayerHistory(weeks, playerId);

  return history.at(-1);
}

/**
 * Calculates how close a player is to their performance target.
 *
 * Example:
 * actual = 82,000
 * target = 105,000
 * result = 78
 */
export function calculateEfficiency(
  actual: number,
  target: number
): number {
  if (target <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((actual / target) * 100));
}

/**
 * Calculates percentage evolution between two values.
 *
 * Example:
 * previous = 50,000
 * current = 60,000
 * result = 20
 */
export function calculateEvolution(
  current: number,
  previous?: number
): number | null {
  if (previous === undefined || previous === 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Calculates the evolution of a player's DPS between two runs.
 */
export function calculateDpsEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.dps === undefined || previous?.dps === undefined) {
    return null;
  }

  return calculateEvolution(current.dps, previous.dps);
}

/**
 * Calculates the evolution of a player's HPS between two runs.
 */
export function calculateHpsEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.hps === undefined || previous?.hps === undefined) {
    return null;
  }

  return calculateEvolution(current.hps, previous.hps);
}

/**
 * Calculates the evolution of a player's Warcraft Logs parse.
 */
export function calculateParseEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (current.parse === undefined || previous?.parse === undefined) {
    return null;
  }

  return current.parse - previous.parse;
}

/**
 * Calculates the change in mechanic errors.
 *
 * Positive value means more errors.
 * Negative value means fewer errors.
 */
export function calculateMechanicEvolution(
  current: PlayerPerformance,
  previous?: PlayerPerformance
): number | null {
  if (
    current.mechanics?.errors === undefined ||
    previous?.mechanics?.errors === undefined
  ) {
    return null;
  }

  return current.mechanics.errors - previous.mechanics.errors;
}

/**
 * Formats a numeric DPS/HPS value for display.
 *
 * Example:
 * 82000 -> "82.0k"
 * 105000 -> "105.0k"
 */
export function formatPerformanceValue(
  value?: number
): string {
  if (value === undefined) {
    return "-";
  }

  return formatCompact(value);
}

/**
 * Calculates progress toward a performance goal.
 *
 * Higher:
 *   actual >= target → 100%
 *
 * Lower:
 *   actual <= target → 100%
 *
 * For lower goals where target is zero:
 *   actual === 0 → 100%
 *   actual > 0    → 0%
 */
export function calculateGoalProgress(
  actual: number,
  target: number,
  direction: 'higher' | 'lower'
): number {
  if (actual < 0 || target < 0) {
    return 0;
  }

  if (direction === 'higher') {
    if (target === 0) {
      return 100;
    }

    return Math.min(
      100,
      Math.round((actual / target) * 100)
    );
  }

  if (actual <= target) {
    return 100;
  }

  if (target === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((target / actual) * 100)
  );
}

/**
 * Builds a performance series for a specific metric across all
 * players in the core, one data point per raid run (not per week).
 *
 * Players without data for a given run simply do not receive a
 * data point for that run.
 */
export function getCorePerformanceSeries(
  weeks: WeeklyPerformance[],
  players: { id: string; name: string }[],
  metric: 'dps' | 'parse' | 'deaths' | 'mechanics'
) {
  const runs = getAllRuns(weeks);

  return players
    .map((player) => {
      const playerId = player.id;

      const data = runs.flatMap(({ run }) => {
        const performance = run.players.find(
          (item) => item.playerId === playerId
        );

        if (!performance) {
          return [];
        }

        let value: number | undefined;

        switch (metric) {
          case 'dps':
            value = performance.dps;
            break;

          case 'parse':
            value = performance.parse;
            break;

          case 'deaths':
            value = performance.deaths;
            break;

          case 'mechanics':
            value = performance.mechanics?.errors;
            break;
        }

        if (value === undefined) {
          return [];
        }

        return [
          {
            date: run.date,
            value,
          },
        ];
      });

      return {
        playerId,
        playerName: player.name,
        data,
      };
    })
    .filter((series) => series.data.length > 0);
}

/**
 * Tendência de uma série (ex: o dps do jogador run a run): quanto ela subiu
 * ou caiu no período, em % da média. Positivo = melhorando.
 *
 * Substituiu a antiga "consistência" (coeficiente de variação), que media
 * regularidade e por isso **punia quem evolui**: um jogador que saiu de 17k
 * para 130k ao longo da temporada pontuava pior que um estável em 42k —
 * o oposto do que o doc de Visão pede ("o foco deve ser evolução").
 *
 * Usa regressão linear por mínimos quadrados, não primeiro-vs-último: assim
 * uma única noite ruim no fim não inverte o sinal, e todos os pontos pesam.
 * O resultado é a variação modelada entre a primeira e a última run
 * (inclinação × período), normalizada pela média pra ser comparável entre
 * jogadores de dps muito diferente.
 *
 * Precisa de pelo menos 2 pontos; null caso contrário (e também quando a
 * média é 0, onde "% de variação" não significa nada).
 */
export function calculateTrend(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (mean === 0) {
    return null;
  }

  const meanIndex = (n - 1) / 2;
  let covariance = 0;
  let varianceIndex = 0;

  for (const [index, value] of values.entries()) {
    covariance += (index - meanIndex) * (value - mean);
    varianceIndex += (index - meanIndex) ** 2;
  }

  const slopePerRun = covariance / varianceIndex;
  const modelledChange = slopePerRun * (n - 1);

  return Math.round((modelledChange / Math.abs(mean)) * 100);
}

/**
 * Percentage of recorded raid runs a player appears in, across every week.
 * Based on actual performance data (who WCL saw in each run), the same
 * source scripts/warcraftlogs/sync-roster-stats.ts already computes inline
 * to fill roster.json's static `warcraftLogs.attendance` field — this is
 * the same calculation, available for the engine to call directly instead
 * of only living in that one script.
 */
export function calculateAttendance(
  weeks: WeeklyPerformance[],
  playerId: string
): number {
  const runs = getAllRuns(weeks);
  if (runs.length === 0) {
    return 0;
  }

  const attended = runs.filter(({ run }) =>
    run.players.some((player) => player.playerId === playerId)
  ).length;

  return Math.round((attended / runs.length) * 100);
}

