import type { BossInsights, BossPlayerScore } from "../types/bossInsights";

const modules = import.meta.glob<{ default: BossInsights }>("../../data/boss-insights/*.json", { eager: true });

const insightsBySeasonSlug = new Map<string, BossInsights>();
for (const [filePath, module] of Object.entries(modules)) {
  const slug = filePath.split("/").pop()?.replace(/\.json$/, "") ?? filePath;
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
