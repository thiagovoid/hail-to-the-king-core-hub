import type { DataProvider, ProviderResult } from "../providers/types";
import { saveRaw } from "./RawStorage";

export interface CollectorTask<TContext, TRaw> {
  provider: DataProvider<TContext, TRaw>;
  context: TContext;
  /** Path (without .json) under data/raw/<provider.name>/ for this result. */
  rawKey: string;
}

export type CollectorOutcome<TRaw> =
  | { status: "ok"; provider: string; rawKey: string; result: ProviderResult<TRaw> }
  | { status: "error"; provider: string; rawKey: string; error: string };

export interface DataCollectorOptions {
  /**
   * Minimum delay between tasks, in ms. A pacing hook, not a real per-provider
   * rate-limit budget (WCL's limit is points-based, not request-count-based) —
   * revisit with real budget tracking if/when volume grows enough to matter.
   */
  minDelayMs?: number;
}

/**
 * The Acquisition Layer: runs providers, keeps one failure from taking down
 * the whole batch, and archives every successful raw result before returning.
 */
export class DataCollector {
  constructor(private readonly options: DataCollectorOptions = {}) {}

  async run<TContext, TRaw>(
    tasks: Array<CollectorTask<TContext, TRaw>>
  ): Promise<Array<CollectorOutcome<TRaw>>> {
    const outcomes: Array<CollectorOutcome<TRaw>> = [];

    for (const [index, task] of tasks.entries()) {
      if (index > 0 && this.options.minDelayMs) {
        await delay(this.options.minDelayMs);
      }

      try {
        const result = await task.provider.fetch(task.context);
        await saveRaw(task.provider.name, task.rawKey, result.raw);
        outcomes.push({
          status: "ok",
          provider: task.provider.name,
          rawKey: task.rawKey,
          result,
        });
      } catch (error) {
        outcomes.push({
          status: "error",
          provider: task.provider.name,
          rawKey: task.rawKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return outcomes;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
