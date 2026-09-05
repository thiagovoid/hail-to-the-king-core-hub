import type { Page } from "playwright";

import type { DataProvider, ProviderResult } from "../types";

// "Patchwerk" (padrão) é parado, sem movimento — dá um dps mais alto que
// o real em raid. "Heavy Movement" se aproxima mais do que a galera
// realmente bate em boss, então a meta fica mais alcançável/motivadora.
export const DEFAULT_FIGHT_STYLE = "HeavyMovement";

export interface RaidbotsCharacterProfile {
  region: string;
  realm: string;
  name: string;
}

export interface RaidbotsQuickSimContext {
  /**
   * Página Playwright já aberta pelo chamador — o provider nunca gerencia o
   * ciclo de vida do browser, pra quem chama poder reusar a mesma página em
   * vários fetch() (um personagem de cada vez) sem reabrir o Chromium.
   */
  page: Page;
  profile: RaidbotsCharacterProfile;
  fightStyle?: string;
}

export type RaidbotsRawQuickSim =
  | {
      status: "ok";
      dps: number;
      spec?: string;
      charClass?: string;
      fightStyle?: string;
      reportUrl: string;
    }
  // O Quick Sim não simula specs de healer: a própria página mostra
  // "Unsupported Spec" em vez de rodar. Isso é a resposta real da
  // ferramenta, não uma falha do fetch — por isso vira raw normalmente,
  // em vez de lançar erro.
  | { status: "unsupported-spec" };

/**
 * O Raidbots não tem API pra rodar simulação sob demanda — isso automatiza
 * o próprio Quick Sim do site (raidbots.com/simbot/quick) via navegador.
 * Pensado pra ser chamado um personagem de cada vez: é um serviço gratuito
 * mantido por eles, então evitamos qualquer coisa parecida com abuso.
 */
export class RaidbotsProvider implements DataProvider<RaidbotsQuickSimContext, RaidbotsRawQuickSim> {
  readonly name = "raidbots";

  async fetch(context: RaidbotsQuickSimContext): Promise<ProviderResult<RaidbotsRawQuickSim>> {
    const raw = await runQuickSim(context.page, context.profile, context.fightStyle ?? DEFAULT_FIGHT_STYLE);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw,
    };
  }
}

async function runQuickSim(
  page: Page,
  profile: RaidbotsCharacterProfile,
  fightStyle: string
): Promise<RaidbotsRawQuickSim> {
  const url = `https://www.raidbots.com/simbot/quick?region=${profile.region}&realm=${encodeURIComponent(
    profile.realm
  )}&name=${encodeURIComponent(profile.name)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Confirma que o personagem carregou da Armory antes de rodar.
  await page.waitForSelector("text=SimC Export", { timeout: 30_000 });

  if ((await page.locator("text=Unsupported Spec").count()) > 0) {
    return { status: "unsupported-spec" };
  }

  // O <select> de fight style só existe no DOM com a seção "Simulation
  // Options" expandida (ela desmonta o conteúdo quando fechada). O Raidbots
  // lembra esse estado (aberto/fechado) via localStorage entre navegações
  // na mesma página — por isso só clica se estiver mesmo fechada, em vez
  // de simplesmente "clicar pra abrir" (isso alternava aberto/fechado).
  const fightStyleSelector = "#AdvancedSimOptions-fightStyle";
  const alreadyExpanded = (await page.locator(fightStyleSelector).count()) > 0;
  if (!alreadyExpanded) {
    await page.click("text=Simulation Options:");
  }
  await page.waitForSelector(fightStyleSelector, { timeout: 15_000 });
  await page.selectOption(fightStyleSelector, fightStyle);

  await page.click("text=Run Quick Sim");
  await page.waitForURL(/\/simbot\/report\//, { timeout: 30_000 });

  const reportUrl = page.url();
  const dataUrl = `${reportUrl.replace(/\/$/, "")}/data.json`;
  const deadline = Date.now() + 3 * 60 * 1000;

  while (Date.now() < deadline) {
    const response = await page.request.get(dataUrl);
    if (response.ok()) {
      const json = await response.json();
      const simPlayer = json?.sim?.players?.[0];
      if (simPlayer?.collected_data?.dps) {
        return {
          status: "ok",
          dps: simPlayer.collected_data.dps.mean,
          spec: json.simbot?.spec,
          charClass: json.simbot?.charClass,
          fightStyle: json.simbot?.fightStyle,
          reportUrl,
        };
      }
    }
    await page.waitForTimeout(5000);
  }

  throw new Error(`Timeout esperando a simulação de ${profile.name} terminar.`);
}
