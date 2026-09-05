import type { WeeklyHighlights } from "../../../src/types/index";
import { sortByWeek } from "../index";

// Mesmo padrão de snapshot do data/weekly/performance/: um arquivo por
// semana, nunca sobrescrito — cada rodada de destaques vira seu próprio registro.
const modules = import.meta.glob<{ default: WeeklyHighlights }>("./week-*.json", {
  eager: true,
});

export const weeklyHighlightsWeeks: WeeklyHighlights[] = sortByWeek(modules);

/** Destaques da semana mais recente, ou undefined se nenhuma foi publicada ainda. */
export function getLatestWeeklyHighlights(): WeeklyHighlights | undefined {
  return weeklyHighlightsWeeks.at(-1);
}
