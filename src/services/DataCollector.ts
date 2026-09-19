import type { DataProvider, ProviderResult } from "../providers/types";
import { loadRaw, saveRaw } from "./RawStorage";

export interface CollectorTask<TContext, TRaw> {
  provider: DataProvider<TContext, TRaw>;
  context: TContext;
  /** Path (without .json) under data/raw/<provider.name>/ for this result. */
  rawKey: string;
}

export type CollectorOutcome<TRaw> =
  | {
      status: "ok";
      provider: string;
      rawKey: string;
      result: ProviderResult<TRaw>;
      /** Veio do arquivo em vez da rede. Ver `reuseArchived`. */
      fromArchive?: boolean;
    }
  | { status: "error"; provider: string; rawKey: string; error: string };

export interface DataCollectorOptions {
  /**
   * Minimum delay between tasks, in ms. A pacing hook, not a real per-provider
   * rate-limit budget (WCL's limit is points-based, not request-count-based) —
   * revisit with real budget tracking if/when volume grows enough to matter.
   */
  minDelayMs?: number;
  /**
   * Reaproveitar o arquivo bruto quando ele já existe, em vez de ir à rede.
   *
   * É o que separa **recalcular** de **recoletar**. Uma regra nova sobre dado
   * antigo não precisa de uma única chamada externa: o relatório de uma noite
   * de raid não muda depois que a noite acabou.
   *
   * Desligado por padrão — coleta continua sendo coleta. Quem liga é o modo
   * de build (`--reuse`), e quem precisa do dado de novo (o log foi
   * reprocessado, a coleta mudou de forma) roda sem ele.
   */
  reuseArchived?: boolean;
}

/**
 * The Acquisition Layer: runs providers, keeps one failure from taking down
 * the whole batch, and archives every successful raw result before returning.
 */
export class DataCollector {
  constructor(private options: DataCollectorOptions = {}) {}

  /**
   * Liga o reaproveitamento do arquivo depois da construção.
   *
   * Existe porque quem decide isso é uma flag de linha de comando, lida
   * dentro do `main()`, enquanto o coletor é montado no topo do módulo.
   */
  reuseArchivedFiles(): void {
    this.options.reuseArchived = true;
  }

  // Rest parameter (not a single array param) so a mixed-type batch — e.g.
  // one Raider.IO task + one WCL task in the same run() call — keeps each
  // task's own TRaw in the returned tuple, instead of collapsing them into
  // a shared union. Homogeneous batches still work fine via `run(...tasks)`.
  async run<T extends ReadonlyArray<CollectorTask<any, any>>>(
    ...tasks: T
  ): Promise<{ [K in keyof T]: T[K] extends CollectorTask<any, infer TRaw> ? CollectorOutcome<TRaw> : never }> {
    const outcomes: Array<CollectorOutcome<unknown>> = [];

    for (const [index, task] of tasks.entries()) {
      if (this.options.reuseArchived) {
        const arquivado = await loadRaw<unknown>(task.provider.name, task.rawKey);
        if (arquivado !== null) {
          outcomes.push({
            status: "ok",
            provider: task.provider.name,
            rawKey: task.rawKey,
            result: { provider: task.provider.name, fetchedAt: "arquivo", raw: arquivado },
            fromArchive: true,
          });
          continue;
        }
      }

      // A pausa é entre IDAS À REDE. Tarefa resolvida pelo arquivo não gasta
      // orçamento de API e não tem por que esperar.
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

    return outcomes as { [K in keyof T]: T[K] extends CollectorTask<any, infer TRaw> ? CollectorOutcome<TRaw> : never };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
