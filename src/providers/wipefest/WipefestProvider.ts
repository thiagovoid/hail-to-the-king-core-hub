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

export interface WipefestRawMechanicStat {
  mechanic: string;
  value: number;
}

/** Nome do personagem -> lista de mecânicas com o valor (0-100) daquele jogador específico. */
export type WipefestRawMechanicBreakdown = Record<string, WipefestRawMechanicStat[]>;

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

  /**
   * Breakdown por mecânica de cada jogador — o card de jogador expande ao
   * clicar (sanfona: só um fica aberto por vez, não reflete na URL, então
   * precisa clicar em cada um pra ler). Não pede login, apesar do aviso na
   * própria página ("Logged-in subscribers get access to a breakdown of
   * each player and mechanic") — confirmado clicando de verdade sem sessão.
   */
  async fetchMechanicBreakdown(context: WipefestFightContext): Promise<ProviderResult<WipefestRawMechanicBreakdown>> {
    const raw = await readMechanicBreakdown(context.page, context.reportCode, context.fightId);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  }
}

async function gotoFightPlayersTab(page: Page, reportCode: string, fightId: number): Promise<"cards" | "no-data"> {
  const url = `https://www.wipefest.gg/report/${reportCode}/fight/${fightId}?fightSummaryTab=players&gameVersion=warcraft-live`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Bosses recém-lançados ou pouco mortos numa dificuldade não têm amostra
  // suficiente pro Wipefest calcular score — a própria página avisa isso em
  // vez de mostrar cards. É uma resposta real da ferramenta, não falha
  // nossa, então vira lista/objeto vazio em vez de estourar no waitForSelector.
  return Promise.race([
    page.waitForSelector(".player-card", { timeout: 30_000 }).then(() => "cards" as const),
    page
      .waitForSelector("text=Not enough data has been collected", { timeout: 30_000 })
      .then(() => "no-data" as const),
  ]);
}

async function readFightPlayerCards(page: Page, reportCode: string, fightId: number): Promise<WipefestRawFightScores> {
  const outcome = await gotoFightPlayersTab(page, reportCode, fightId);
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

async function readMechanicBreakdown(
  page: Page,
  reportCode: string,
  fightId: number
): Promise<WipefestRawMechanicBreakdown> {
  const outcome = await gotoFightPlayersTab(page, reportCode, fightId);
  if (outcome === "no-data") return {};

  await page.waitForFunction(
    () => {
      const scores = document.querySelectorAll(".player-card__score:not(.player-card__score--bonus)");
      return scores.length > 0 && [...scores].every((el) => el.textContent?.trim() !== "");
    },
    { timeout: 30_000 }
  );

  const cardCount = await page.locator(".player-card").count();
  const result: WipefestRawMechanicBreakdown = {};

  // Um card por vez: clicar expande (sanfona, fecha o anterior sozinho) —
  // não dá pra ler todo mundo de uma vez como no readFightPlayerCards.
  for (let index = 0; index < cardCount; index++) {
    const card = page.locator(".player-card").nth(index);
    const name = (await card.locator(".player-card__name").textContent())?.trim();
    if (!name) continue;

    await card.click();
    await page.locator(".player-card--expanded .player-card__stat").first().waitFor({ timeout: 10_000 });

    const stats = await page.locator(".player-card--expanded .player-card__stat").evaluateAll((nodes) =>
      nodes.map((node) => ({
        mechanic: node.querySelector(".player-card__stat-label")?.textContent?.trim() ?? "",
        value: Number(node.querySelector(".player-card__stat-value")?.textContent?.trim()),
      }))
    );

    result[name] = stats.filter((stat) => stat.mechanic !== "" && Number.isFinite(stat.value));
  }

  return result;
}
