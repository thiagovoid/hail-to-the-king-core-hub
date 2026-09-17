import type { DataProvider, ProviderResult } from "../types";
import type { WipefestApiFight } from "./insights";

export interface WipefestApiContext {
  /** Mesmo código de report da WCL: o Wipefest reaproveita o log, não gera um próprio. */
  reportCode: string;
  /** ID do fight na WCL (mesma numeração). */
  fightId: number;
}

/**
 * Lê um fight pela API do Wipefest.
 *
 * Substitui a automação de navegador para mecânicas: a API devolve a mesma
 * curadoria que a página renderiza, já em JSON — inclusive `higherIsBetter`,
 * `isBonus` e a tabela de contagem por jogador. Conferido contra a tela: a
 * nota por mecânica e o total batem (Ligiaf: 91 e bônus 7 no fight 17).
 *
 * O `WipefestProvider` (Playwright) continua existindo para o score do card,
 * onde a API era conhecida por divergir — ver o comentário lá.
 */
export class WipefestApiProvider implements DataProvider<WipefestApiContext, WipefestApiFight> {
  readonly name = "wipefest-api";

  async fetch(context: WipefestApiContext): Promise<ProviderResult<WipefestApiFight>> {
    const url = `https://api.wipefest.gg/report/${context.reportCode}/fight/${context.fightId}`;

    const response = await fetch(url, {
      headers: { "user-agent": "HailToTheKingCoreHub/1.0 (+https://hailtotheking.com.br)" },
    });

    if (!response.ok) {
      throw new Error(`Wipefest API respondeu ${response.status} para ${context.reportCode}/fight/${context.fightId}`);
    }

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: (await response.json()) as WipefestApiFight,
    };
  }
}
