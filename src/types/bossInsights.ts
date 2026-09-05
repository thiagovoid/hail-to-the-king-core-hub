/**
 * Provider-native feature data, kept deliberately separate from the Unified
 * Model (PlayerPerformance): this isn't an aggregate metric fed into the
 * Score/Team engines, it's a per-boss "information hub" snapshot — each
 * player's Wipefest score for that specific boss kill — meant to be
 * displayed as-is next to the boss it belongs to.
 */
export interface BossPlayerScore {
  /** Player ID from roster.json. */
  playerId: string;
  /** Wipefest's main score (0-100) for this player on this boss kill. */
  score: number;
  /** Wipefest's bonus score (optional mechanics: ready check, potions, etc.). */
  bonus: number;
  /** Item level at the time of this kill, or null if not read. */
  itemLevel: number | null;
}

/** Boss id -> per-player scores, one bucket per difficulty (bosses share the same id across Normal/Heroic). */
export type BossInsightsByDifficulty = Record<string, BossPlayerScore[]>;

export interface BossInsights {
  bossesNormal: BossInsightsByDifficulty;
  bossesHeroic: BossInsightsByDifficulty;
}
