import type { Page } from "playwright";

import type { DataProvider, ProviderResult } from "../types";

export interface WoWAnalyzerFightContext {
  /** Página Playwright já aberta pelo chamador — mesmo contrato do Raidbots/Wipefest. */
  page: Page;
  /** Mesmo report/fight da WCL: o WoW Analyzer reaproveita a numeração da WCL. */
  reportCode: string;
  fightId: number;
  /**
   * Nome do personagem — o site resolve o jogador só pelo nome (confirmado:
   * `/report/<code>/<fightId>-x/<Nome>/standard` funciona e o próprio site
   * canonicaliza a URL depois), sem precisar do actorId numérico.
   */
  characterName: string;
}

export interface WoWAnalyzerRawUptime {
  /**
   * % da seção "Always Be Casting" — nome de componente compartilhado entre
   * specs no código do WoWAnalyzer, mas o rótulo embaixo varia por role
   * (Active Time num DPS, Ability Uptime/Healing Uptime num healer). Null
   * quando a seção não apareceu a tempo (spec sem analisador, boss não
   * suportado, ou qualquer outro estado que não seja o checklist normal).
   */
  uptime: number | null;
}

/**
 * Cada spec do WoWAnalyzer é escrita por um voluntário diferente da
 * comunidade, com layout e nomes de métrica próprios — não existe um score
 * único 0-100 como o Wipefest (achado confirmado inspecionando specs reais:
 * DPS e healer têm seções de checklist completamente diferentes). A única
 * coisa universal o suficiente pra entrar no modelo unificado é o percentual
 * da seção "Always Be Casting", sempre a primeira da aba padrão — por isso
 * este provider só extrai isso, não tenta replicar o checklist inteiro.
 */
export class WoWAnalyzerProvider implements DataProvider<WoWAnalyzerFightContext, WoWAnalyzerRawUptime> {
  readonly name = "wowanalyzer";

  async fetch(context: WoWAnalyzerFightContext): Promise<ProviderResult<WoWAnalyzerRawUptime>> {
    const raw = await readUptime(context.page, context.reportCode, context.fightId, context.characterName);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  }
}

async function readUptime(
  page: Page,
  reportCode: string,
  fightId: number,
  characterName: string
): Promise<WoWAnalyzerRawUptime> {
  const url = `https://wowanalyzer.com/report/${reportCode}/${fightId}-x/${encodeURIComponent(characterName)}/standard`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Sem uma mensagem clara de "spec não suportada" pra esperar (diferente do
  // Raidbots/Wipefest) — se a seção não aparecer no prazo, trata como "sem
  // dado" em vez de derrubar o lote inteiro; cobre spec sem analisador,
  // boss não reconhecido, ou qualquer outro estado que não seja o normal.
  const section = page
    .locator("section.expandable")
    .filter({ has: page.locator("header .name", { hasText: /^Always Be Casting$/ }) })
    .first();

  try {
    await section.waitFor({ timeout: 30_000 });
  } catch {
    return { uptime: null };
  }

  const strongText = await section.locator("b, strong", { hasText: "%" }).first().textContent({ timeout: 5_000 }).catch(() => null);
  const match = strongText?.match(/([\d.]+)%/);

  return { uptime: match ? Number(match[1]) : null };
}
