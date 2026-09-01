/**
 * Performance data for a single player during one raid run (one night).
 */
export interface PlayerPerformance {
  /**
   * Player ID from roster.json.
   */
  playerId: string;

  /**
   * Average DPS during the run.
   * Only applicable to DPS players.
   */
  dps?: number;

  /**
   * Average HPS during the run.
   * Only applicable to healers.
   */
  hps?: number;

  /**
   * Warcraft Logs parse percentile.
   * Only available for kills logged on a public report.
   */
  parse?: number;

  /**
   * Item level during the run.
   */
  itemLevel?: number;

  /**
   * Number of deaths during the run.
   */
  deaths: number;

  /**
   * Mechanics-related failures.
   * Not tracked automatically; filled in manually when available.
   */
  mechanics?: {
    errors: number;
  };
}

/**
 * One raid night (one Warcraft Logs report) inside a raid week.
 * A week can have multiple runs (e.g. Tuesday + Thursday).
 */
export interface PerformanceRun {
  /**
   * Date of this specific run.
   */
  date: string;

  /**
   * Warcraft Logs report code this run was generated from, when known.
   */
  reportCode?: string;

  /**
   * Performance data for each player present in this run.
   */
  players: PlayerPerformance[];
}

/**
 * Performance data collected for the entire core during one raid week.
 * A week groups every run (raid night) that happened within it.
 */
export interface WeeklyPerformance {
  /**
   * Sequential week number.
   */
  week: number;

  /**
   * Raid runs that happened during this week, in chronological order.
   */
  runs: PerformanceRun[];
}

/**
 * A player's performance for a single run, with the run's own
 * week/date/report attached — used for flattened history views
 * (player history, core-wide series) where each run is a data point.
 */
export interface PlayerRunPerformance extends PlayerPerformance {
  week: number;
  date: string;
  reportCode?: string;
}

/**
 * Performance goals for an individual player.
 */
export interface PerformanceGoal {
  /**
   * Player ID from roster.json.
   */
  playerId: string;

  /**
   * DPS goal.
   */
  dps?: {
    target: number;
  };

  /**
   * Maximum acceptable number of mechanic errors.
   */
  mechanics?: {
    maxErrors: number;
  };
}
