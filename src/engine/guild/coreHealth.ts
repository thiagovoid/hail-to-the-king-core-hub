import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import type { Boss } from "../../types/index";
import { calculateAttendance } from "../metrics";
import { buildCoreRanking } from "../team";

export type HealthStatus = "green" | "yellow" | "red" | "unknown";

export interface CoreHealthCategory {
  key: "performance" | "attendance" | "progression";
  label: string;
  status: HealthStatus;
  /** Short human-readable reason behind the status, shown as a tooltip/subtitle. */
  detail: string;
}

export interface CoreHealth {
  categories: CoreHealthCategory[];
}

/**
 * Core Health (doc: "8.4 Core Health"): a traffic-light read of how the core
 * is doing, built entirely from engines that already exist — no new
 * collection, just a verdict layered on top.
 *
 * Scoped to 3 categories, not the 6 the doc lists. Recruitment and Activity
 * have no data source at all yet (Recruitment as a domain doesn't exist;
 * "Activity" was never defined beyond Attendance). Roster is left out too:
 * a meaningful roster-health signal needs a target composition (how many
 * tanks/healers a full raid needs) that's guild-specific config we don't
 * have — better to leave it out than invent a threshold nobody agreed to.
 * Add these back once their inputs actually exist, same pattern as the
 * Score Engine's Cooldowns/Preparação.
 */
export function calculateCoreHealth(
  weeks: WeeklyPerformance[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>,
  bossesNormal: Boss[],
  bossesHeroic: Boss[]
): CoreHealth {
  return {
    categories: [
      performanceCategory(weeks, players, goalsByPlayerId),
      attendanceCategory(weeks, players),
      progressionCategory(bossesNormal, bossesHeroic),
    ],
  };
}

function bandPercent(value: number | null, thresholds: { green: number; yellow: number }): HealthStatus {
  if (value === null) return "unknown";
  if (value >= thresholds.green) return "green";
  if (value >= thresholds.yellow) return "yellow";
  return "red";
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// Mesma faixa 80/50 usada pelo Score Engine (PerformanceScoreCard) — mantém
// o "o que é verde/amarelo/vermelho" consistente em todo o site.
function performanceCategory(
  weeks: WeeklyPerformance[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>
): CoreHealthCategory {
  const ranking = buildCoreRanking(weeks, players, goalsByPlayerId);
  const scores = ranking.map((entry) => entry.overall).filter((value): value is number => value !== null);
  const avgScore = average(scores);

  return {
    key: "performance",
    label: "Performance",
    status: bandPercent(avgScore, { green: 80, yellow: 50 }),
    detail:
      avgScore === null
        ? "Sem Score geral suficiente ainda"
        : `Score geral médio do core: ${avgScore}/100 (${scores.length} jogador(es))`,
  };
}

function attendanceCategory(weeks: WeeklyPerformance[], players: Array<{ id: string; name: string }>): CoreHealthCategory {
  const avgAttendance = average(players.map((player) => calculateAttendance(weeks, player.id)));

  return {
    key: "attendance",
    label: "Attendance",
    status: bandPercent(avgAttendance, { green: 80, yellow: 50 }),
    detail: avgAttendance === null ? "Sem runs registradas ainda" : `Presença média do roster: ${avgAttendance}%`,
  };
}

// Sinal de "travado" em vez de % de progressão: 20% na primeira semana de
// tier não é doença, é normal — pulls acumulados sem kill no boss atual é
// que indica um problema real de progressão.
const STALLED_PULLS = 10;
const SLOW_PULLS = 5;

function progressionCategory(bossesNormal: Boss[], bossesHeroic: Boss[]): CoreHealthCategory {
  // Progride pra heroica assim que houver qualquer pull lá — reflete a
  // frente de combate ativa do core, não a mais fácil disponível.
  const activeBosses = bossesHeroic.some((boss) => boss.pulls > 0) ? bossesHeroic : bossesNormal;
  const currentBoss = activeBosses.find((boss) => boss.status !== "killed");

  if (!currentBoss) {
    return {
      key: "progression",
      label: "Progressão",
      status: "green",
      detail: "Progressão atual concluída",
    };
  }

  const status: HealthStatus =
    currentBoss.pulls >= STALLED_PULLS ? "red" : currentBoss.pulls >= SLOW_PULLS ? "yellow" : "green";

  return {
    key: "progression",
    label: "Progressão",
    status,
    detail: `${currentBoss.name}: ${currentBoss.pulls} pull(s) sem kill`,
  };
}
