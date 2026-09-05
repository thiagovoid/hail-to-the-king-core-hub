import type { Page } from "playwright";

import type { DataProvider, ProviderResult } from "../types";

export interface WipefestFightContext {
  /** Página Playwright já aberta pelo chamador — mesmo contrato do RaidbotsProvider. */
  page: Page;
  /** Mesmo código de report da WCL: o Wipefest reaproveita o report da WCL, não gera log próprio. */
  reportCode: string;
  /** ID do fight na WCL (o Wipefest usa a mesma numeração). */
  fightId: number;
}

export interface WipefestRawPlayerScore {
  name: string;
  /** Score principal (0-100) mostrado no card do jogador. */
  score: number;
  /** Score de bônus (mecânicas opcionais: ready check, potions, etc.), mostrado à parte. */
  bonus: number;
  itemLevel: number | null;
}

export type WipefestRawFightScores = WipefestRawPlayerScore[];

/**
 * O Wipefest tem uma API (`api.wipefest.gg/report/<code>/fight/<id>`), mas o
 * campo de score que ela devolve não bate com o número renderizado na tela
 * (confirmado: chegou a divergir em 2 pontos num teste real) — provavelmente
 * a página aplica algum ajuste/peso adicional no cliente antes de exibir.
 * Pra não arriscar reimplementar a lógica de scoring deles, isso lê o valor
 * já calculado e renderizado no DOM (`.player-card`), mesmo padrão do
 * RaidbotsProvider: página real, espera renderizar, lê o resultado pronto.
 */
export class WipefestProvider implements DataProvider<WipefestFightContext, WipefestRawFightScores> {
  readonly name = "wipefest";

  async fetch(context: WipefestFightContext): Promise<ProviderResult<WipefestRawFightScores>> {
    const raw = await readFightPlayerCards(context.page, context.reportCode, context.fightId);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  }
}

async function readFightPlayerCards(page: Page, reportCode: string, fightId: number): Promise<WipefestRawFightScores> {
  const url = `https://www.wipefest.gg/report/${reportCode}/fight/${fightId}?fightSummaryTab=players&gameVersion=warcraft-live`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Bosses recém-lançados ou pouco mortos numa dificuldade não têm amostra
  // suficiente pro Wipefest calcular score — a própria página avisa isso em
  // vez de mostrar cards. É uma resposta real da ferramenta, não falha
  // nossa, então vira lista vazia em vez de estourar no waitForSelector.
  const outcome = await Promise.race([
    page.waitForSelector(".player-card", { timeout: 30_000 }).then(() => "cards" as const),
    page
      .waitForSelector("text=Not enough data has been collected", { timeout: 30_000 })
      .then(() => "no-data" as const),
  ]);

  if (outcome === "no-data") return [];

  // SPA: os cards de jogador aparecem antes do score terminar de calcular no
  // cliente — espera todo score principal ter texto não vazio antes de ler.
  await page.waitForFunction(
    () => {
      const scores = document.querySelectorAll(".player-card__score:not(.player-card__score--bonus)");
      return scores.length > 0 && [...scores].every((el) => el.textContent?.trim() !== "");
    },
    { timeout: 30_000 }
  );

  return page.$$eval(".player-card", (cards) =>
    cards.map((card) => {
      const name = card.querySelector(".player-card__name")?.textContent?.trim() ?? "";
      const score = Number(card.querySelector(".player-card__score:not(.player-card__score--bonus)")?.textContent?.trim());
      const bonus = Number(card.querySelector(".player-card__score--bonus")?.textContent?.trim());
      const itemLevelText = card.querySelector(".player-card__item-level .badge")?.textContent?.trim();

      return {
        name,
        score: Number.isFinite(score) ? score : 0,
        bonus: Number.isFinite(bonus) ? bonus : 0,
        itemLevel: itemLevelText ? Number(itemLevelText) : null,
      };
    })
  );
}
