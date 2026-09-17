import type { DataProvider, ProviderResult } from "../types";

export interface WowheadGuideContext {
  /** URL completa do guia de "Enchants & Consumables" da spec. */
  url: string;
}

/**
 * Guia de gemas/encantos/consumíveis do Wowhead.
 *
 * Diferente do Wipefest e do Raidbots, aqui **não precisa de navegador**: a
 * página é renderizada no servidor e as tabelas vêm no HTML bruto, com os
 * IDs de item nos links. Um `fetch` resolve — o que deixa esse coletor
 * barato e estável o bastante pra rodar em CI sem Playwright.
 *
 * O provider só busca; quem interpreta é `normalize.ts`.
 */
export class WowheadProvider implements DataProvider<WowheadGuideContext, string> {
  readonly name = "wowhead";

  async fetch(context: WowheadGuideContext): Promise<ProviderResult<string>> {
    const response = await fetch(context.url, {
      headers: {
        // Identifica o projeto em vez de fingir ser um navegador qualquer.
        "user-agent": "HailToTheKingCoreHub/1.0 (+https://hailtotheking.com.br)",
        accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`Wowhead respondeu ${response.status} para ${context.url}`);
    }

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: await response.text(),
    };
  }
}
