/**
 * Funções utilitárias para loot de raid.
 */

import type { Loot, LootFilters, LootStats } from "@/types/index";

/**
 * Filtra a lista de loots aplicando os filtros de semana, jogador e boss simultaneamente.
 * Filtros null/undefined/empty são ignorados.
 * Retorna todos os itens quando `filters` é `{}`.
 */
export function filterLoots(loots: Loot[], filters: LootFilters): Loot[] {
  return loots.filter((loot) => {
    if (filters.week !== null && filters.week !== undefined) {
      if (loot.week !== filters.week) return false;
    }
    if (filters.player !== null && filters.player !== undefined && filters.player !== "") {
      if (loot.player !== filters.player) return false;
    }
    if (filters.boss !== null && filters.boss !== undefined && filters.boss !== "") {
      if (loot.boss !== filters.boss) return false;
    }
    return true;
  });
}

/**
 * Agrupa os loots por jogador e calcula estatísticas:
 * - totalLoots: total de itens recebidos
 * - lastLootDate: data do loot mais recente (ISO 8601)
 * - avgPerMonth: média de loots por mês (span mínimo de 1 mês)
 *
 * Usa `loot.player` tanto como playerId quanto como playerName.
 */
export function computeLootStats(loots: Loot[]): LootStats[] {
  // Agrupa por player
  const grouped = new Map<string, Loot[]>();
  for (const loot of loots) {
    const existing = grouped.get(loot.player);
    if (existing) {
      existing.push(loot);
    } else {
      grouped.set(loot.player, [loot]);
    }
  }

  const stats: LootStats[] = [];

  for (const [player, playerLoots] of grouped) {
    const totalLoots = playerLoots.length;

    // Ordena as datas para encontrar a mais recente e a mais antiga
    const sortedDates = playerLoots
      .map((l) => l.date)
      .sort((a, b) => a.localeCompare(b));

    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    // Calcula o span em meses (mínimo 1 para evitar divisão por zero)
    const spanMonths = Math.max(1, diffInMonths(earliestDate, latestDate));
    const avgPerMonth = Math.round((totalLoots / spanMonths) * 100) / 100;

    stats.push({
      playerId: player,
      playerName: player,
      totalLoots,
      lastLootDate: latestDate ?? null,
      avgPerMonth,
    });
  }

  return stats;
}

/**
 * Calcula a diferença em meses entre duas datas ISO 8601.
 * Retorna 0 quando as datas são iguais.
 */
function diffInMonths(from: string, to: string): number {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const yearDiff = toDate.getFullYear() - fromDate.getFullYear();
  const monthDiff = toDate.getMonth() - fromDate.getMonth();

  return yearDiff * 12 + monthDiff;
}
