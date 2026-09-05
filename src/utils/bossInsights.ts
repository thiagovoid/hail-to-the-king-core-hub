import type { BossInsights, BossPlayerScore } from "../types/bossInsights";

const modules = import.meta.glob<{ default: BossInsights }>("../../data/seasons/*/boss-insights.json", { eager: true });

const insightsBySeasonSlug = new Map<string, BossInsights>();
for (const [filePath, module] of Object.entries(modules)) {
  // .../data/seasons/<slug>/boss-insights.json — o slug é o nome da pasta,
  // não mais o nome do arquivo (cada season agora tem sua própria pasta).
  const slug = filePath.split("/").at(-2) ?? filePath;
  insightsBySeasonSlug.set(slug, module.default);
}

/**
 * Scoreboard for one boss, or [] when the Wipefest scrape hasn't run yet for
 * that season/difficulty/boss — the page renders the same either way, just
 * without the scoreboard section.
 */
export function getBossScores(
  seasonSlug: string,
  difficulty: "normal" | "heroic",
  bossId: string
): BossPlayerScore[] {
  const insights = insightsBySeasonSlug.get(seasonSlug);
  if (!insights) return [];

  const bucket = difficulty === "normal" ? insights.bossesNormal : insights.bossesHeroic;
  return bucket[bossId] ?? [];
}
