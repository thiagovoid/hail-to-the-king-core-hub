/**
 * Performance data for a single player during a raid session.
 */
export interface PlayerPerformance {
  /**
   * Player ID from roster.json.
   */
  playerId: string;

  /**
   * Average DPS during the session.
   * Only applicable to DPS players.
   */
  dps?: number;

  /**
   * Average HPS during the session.
   * Only applicable to healers.
   */
  hps?: number;

  /**
   * Warcraft Logs parse percentile.
   */
  parse?: number;

  /**
   * Item level during the session.
   */
  itemLevel?: number;

  /**
   * Number of deaths during the session.
   */
  deaths: number;

  /**
   * Mechanics-related failures.
   */
  mechanics: {
    errors: number;
  };
}

/**
 * Performance data collected for the entire core during one week.
 */
export interface WeeklyPerformance {
  /**
   * Sequential week number.
   */
  week: number;

  /**
   * Date of the raid session.
   */
  date: string;

  /**
   * Performance data for each player present in the session.
   */
  players: PlayerPerformance[];
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

