export type GoalMetric =
  | 'dps'
  | 'hps'
  | 'parse'
  | 'mechanics'
  | 'deaths';

export type GoalDirection =
  | 'higher'
  | 'lower';

export interface PerformanceGoal {
  metric: GoalMetric;

  /**
   * Target value the player should aim for.
   */
  target: number;

  /**
   * Defines whether a higher or lower value is better.
   */
  direction: GoalDirection;

  /**
   * Human-readable description of the goal.
   */
  description?: string;

  /**
   * Optional source for the target.
   *
   * Example:
   * Raidbots / SimulationCraft / Warcraft Logs
   */
  source?: string;

  /**
   * Optional date when this target was calculated.
   */
  calculatedAt?: string;
}

export interface PlayerPerformanceGoals {
  dps?: PerformanceGoal;
  hps?: PerformanceGoal;
  parse?: PerformanceGoal;
  mechanics?: PerformanceGoal;
  deaths?: PerformanceGoal;
}
