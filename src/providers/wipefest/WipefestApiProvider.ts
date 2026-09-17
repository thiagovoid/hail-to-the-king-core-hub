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

export interface WipefestApiReportFight {
  id: number;
  /** encounterID da WCL. 0 = trash, que a própria API já separa. */
  boss: number;
  name: string;
  kill: boolean;
  /** 3 = Normal, 4 = Heroico (mesma escala da WCL). */
  difficulty: number;
}

export interface WipefestApiReport {
  fights?: WipefestApiReportFight[];
}

/**
 * Lista os fights de um report. Evita uma ida à WarcraftLogs só pra saber
 * quais trys existem — e, com isso, a coleta de mecânicas roda sem
 * credencial nenhuma.
 */
export async function fetchWipefestReport(reportCode: string): Promise<WipefestApiReport> {
  const response = await fetch(`https://api.wipefest.gg/report/${reportCode}`, {
    headers: { "user-agent": "HailToTheKingCoreHub/1.0 (+https://hailtotheking.com.br)" },
  });

  if (!response.ok) {
    throw new Error(`Wipefest API respondeu ${response.status} para o report ${reportCode}`);
  }

  return (await response.json()) as WipefestApiReport;
}
