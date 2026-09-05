import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import type { Boss } from "../../types/index";
import { calculateAttendance, calculateEvolution, getPlayerHistory } from "../metrics";
import { buildSeasonChronicle } from "./chronicle";

export interface HallOfFameEntry {
  key: "bestParse" | "fewestDeaths" | "bestAttendance" | "bestEvolution" | "mvp";
  label: string;
  winner: { playerId: string; playerName: string; value: string } | null;
}

export interface HallOfFame {
  entries: HallOfFameEntry[];
}

// Categorias que precisam de pelo menos 2 runs pra significar algo (uma
// única run com 0 mortes ou uma única leitura de parse não é uma "melhor
// evolução" ou uma "menor média" real) — mesmo critério que
// calculateConsistency já usa.
const MIN_RUNS_FOR_TREND = 2;

/**
 * Hall da Fama (doc: "4.3 Hall da Fama") — reconhecimentos calculados a
 * partir de dado que já coletamos, sem nada editorial.
 *
 * Fora do doc original de propósito: "Mais Mythic+" e "Mais temporadas
 * ativas" (não temos contagem de M+ por jogador nem mais de uma temporada
 * registrada ainda), "Membro mais antigo" (Player não guarda data de
 * entrada) e "Melhor mentor" (não existe tracking de mentoria). Cada uma
 * dessas fica pra quando o dado que ela precisa existir de verdade — mesmo
 * princípio do Score Engine com Cooldowns/Preparação.
 */
export function buildHallOfFame(
  seasonName: string,
  weeks: WeeklyPerformance[],
  bossesNormal: Boss[],
  bossesHeroic: Boss[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>
): HallOfFame {
  return {
    entries: [
      bestParseEntry(weeks, players),
      fewestDeathsEntry(weeks, players),
      bestAttendanceEntry(weeks, players),
      bestEvolutionEntry(weeks, players),
      mvpEntry(seasonName, weeks, bossesNormal, bossesHeroic, players, goalsByPlayerId),
    ],
  };
}

function bestParseEntry(weeks: WeeklyPerformance[], players: Array<{ id: string; name: string }>): HallOfFameEntry {
  let best: { playerId: string; playerName: string; parse: number } | null = null;

  for (const player of players) {
    const parses = getPlayerHistory(weeks, player.id)
      .map((run) => run.parse)
      .filter((parse): parse is number => parse !== undefined);
    if (parses.length === 0) continue;

    const maxParse = Math.max(...parses);
    if (!best || maxParse > best.parse) {
      best = { playerId: player.id, playerName: player.name, parse: maxParse };
    }
  }

  return {
    key: "bestParse",
    label: "Melhor Parse",
    winner: best ? { playerId: best.playerId, playerName: best.playerName, value: `${best.parse}` } : null,
  };
}

function fewestDeathsEntry(weeks: WeeklyPerformance[], players: Array<{ id: string; name: string }>): HallOfFameEntry {
  let best: { playerId: string; playerName: string; avgDeaths: number } | null = null;

  for (const player of players) {
    const history = getPlayerHistory(weeks, player.id);
    if (history.length < MIN_RUNS_FOR_TREND) continue;

    const avgDeaths = history.reduce((sum, run) => sum + run.deaths, 0) / history.length;
    if (!best || avgDeaths < best.avgDeaths) {
      best = { playerId: player.id, playerName: player.name, avgDeaths };
    }
  }

  return {
    key: "fewestDeaths",
    label: "Menos Mortes",
    winner: best
      ? { playerId: best.playerId, playerName: best.playerName, value: `${best.avgDeaths.toFixed(1)} / run` }
      : null,
  };
}

function bestAttendanceEntry(weeks: WeeklyPerformance[], players: Array<{ id: string; name: string }>): HallOfFameEntry {
  let best: { playerId: string; playerName: string; attendance: number } | null = null;

  for (const player of players) {
    const attendance = calculateAttendance(weeks, player.id);
    if (attendance <= 0) continue;
    if (!best || attendance > best.attendance) {
      best = { playerId: player.id, playerName: player.name, attendance };
    }
  }

  return {
    key: "bestAttendance",
    label: "Maior Attendance",
    winner: best
      ? { playerId: best.playerId, playerName: best.playerName, value: `${best.attendance}%` }
      : null,
  };
}

function bestEvolutionEntry(weeks: WeeklyPerformance[], players: Array<{ id: string; name: string }>): HallOfFameEntry {
  let best: { playerId: string; playerName: string; evolution: number } | null = null;

  for (const player of players) {
    const history = getPlayerHistory(weeks, player.id);
    if (history.length < MIN_RUNS_FOR_TREND) continue;

    const first = history[0].parse;
    const last = history.at(-1)!.parse;
    if (first === undefined || last === undefined) continue;

    const evolution = calculateEvolution(last, first);
    if (evolution === null) continue;
    if (!best || evolution > best.evolution) {
      best = { playerId: player.id, playerName: player.name, evolution };
    }
  }

  return {
    key: "bestEvolution",
    label: "Melhor Evolução (Parse)",
    winner: best
      ? {
          playerId: best.playerId,
          playerName: best.playerName,
          value: `${best.evolution > 0 ? "+" : ""}${best.evolution}%`,
        }
      : null,
  };
}

function mvpEntry(
  seasonName: string,
  weeks: WeeklyPerformance[],
  bossesNormal: Boss[],
  bossesHeroic: Boss[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>
): HallOfFameEntry {
  // Reaproveita o mesmo cálculo do Chronicle em vez de duplicar a lógica de
  // média de Score Geral por jogador.
  const { mvp } = buildSeasonChronicle(seasonName, weeks, bossesNormal, bossesHeroic, players, goalsByPlayerId);

  return {
    key: "mvp",
    label: "MVP da Temporada",
    winner: mvp ? { playerId: mvp.playerId, playerName: mvp.playerName, value: `Score ${mvp.avgScore}` } : null,
  };
}
