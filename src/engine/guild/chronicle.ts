import type { WeeklyPerformance } from "../../types/performance";
import type { PlayerPerformanceGoals } from "../../types/goals";
import type { Boss } from "../../types/index";
import { calculateOverallScore } from "../scores";

export interface SeasonMvp {
  playerId: string;
  playerName: string;
  /** Média do Score Geral (Score Engine) do jogador em todas as runs da temporada. */
  avgScore: number;
}

export interface SeasonChronicle {
  seasonName: string;
  /** Total de sessões de raid (runs) registradas na temporada até agora. */
  raids: number;
  /** Soma de pulls de todos os bosses (Normal + Heroica) — proxy de "wipes" do doc. */
  totalPulls: number;
  bossesKilled: number;
  totalBosses: number;
  /** null quando ninguém tem Score Geral suficiente ainda (ver Score Engine). */
  mvp: SeasonMvp | null;
}

/**
 * Chronicle (doc: "5. Chronicle" — "cada temporada deve gerar um capítulo"):
 * um resumo da temporada montado inteiramente a partir de dado que já
 * coletamos, sem nenhuma coleta nova.
 *
 * Dois campos do exemplo do doc ficaram de fora de propósito:
 * - "novos membros": exigiria data de entrada por jogador, que `Player`
 *   não guarda hoje (só `status`, que não tem histórico de quando mudou).
 * - "grandes conquistas": não existe um sistema de achievements ainda
 *   (doc "15. Sistema de Conquistas", fase futura).
 * Preferi um capítulo mais curto e honesto a inventar números pra
 * preencher o template do doc.
 *
 * MVP usa a média do Score Geral do jogador em *todas* as runs da
 * temporada — diferente do Ranking do Core (Team Analytics), que olha só
 * a run mais recente. Aqui o que importa é quem se destacou na temporada
 * inteira, não só na última semana.
 */
export function buildSeasonChronicle(
  seasonName: string,
  weeks: WeeklyPerformance[],
  bossesNormal: Boss[],
  bossesHeroic: Boss[],
  players: Array<{ id: string; name: string }>,
  goalsByPlayerId: Record<string, PlayerPerformanceGoals | undefined>
): SeasonChronicle {
  const raids = weeks.reduce((sum, week) => sum + week.runs.length, 0);

  const allBosses = [...bossesNormal, ...bossesHeroic];
  const totalPulls = allBosses.reduce((sum, boss) => sum + boss.pulls, 0);
  const bossesKilled = allBosses.filter((boss) => boss.status === "killed").length;

  const scoresByPlayer = new Map<string, number[]>();
  for (const week of weeks) {
    for (const run of week.runs) {
      for (const performance of run.players) {
        const { overall } = calculateOverallScore(performance, goalsByPlayerId[performance.playerId]);
        if (overall === null) continue;

        const scores = scoresByPlayer.get(performance.playerId) ?? [];
        scores.push(overall);
        scoresByPlayer.set(performance.playerId, scores);
      }
    }
  }

  const averages = [...scoresByPlayer.entries()]
    .map(([playerId, scores]) => ({
      playerId,
      avgScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  const top = averages[0];
  const mvp: SeasonMvp | null = top
    ? {
        playerId: top.playerId,
        playerName: players.find((player) => player.id === top.playerId)?.name ?? top.playerId,
        avgScore: top.avgScore,
      }
    : null;

  return {
    seasonName,
    raids,
    totalPulls,
    bossesKilled,
    totalBosses: allBosses.length,
    mvp,
  };
}
