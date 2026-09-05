import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

import { DataCollector } from "../../src/services/DataCollector";
import { sameCharacterName } from "../../src/providers/warcraftlogs/normalize";
import { WipefestProvider, type WipefestFightContext, type WipefestRawMechanicBreakdown } from "../../src/providers/wipefest/WipefestProvider";
import type { DataProvider } from "../../src/providers/types";
import type { BossInsights, BossInsightsByDifficulty, BossPlayerScore } from "../../src/types/bossInsights";
import type { Boss } from "../../src/types/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface RosterPlayer {
  id: string;
  name: string;
}

interface SeasonFile {
  bossesNormal?: Boss[];
  bossesHeroic?: Boss[];
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.season) {
    throw new Error("Uso: vite-node fetch-boss-insights.ts --season=midnight-s2 [--headed]");
  }

  return { season: String(args.season), headed: Boolean(args.headed) };
}

/** O boss guarda o link da WCL com o fight já resolvido — mesmo code/fightId que o Wipefest reaproveita. */
function parseWclReportLink(url: string | null): { reportCode: string; fightId: number } | null {
  if (!url) return null;
  const match = url.match(/reports\/([A-Za-z0-9]+)\?fight=(\d+)/);
  if (!match) return null;
  return { reportCode: match[1], fightId: Number(match[2]) };
}

// DataCollector só chama provider.fetch() (o contrato DataProvider) — esse
// adaptador deixa o fetchMechanicBreakdown (um segundo tipo de busca que a
// classe expõe além da interface) passar pela mesma máquina de
// collector/raw-storage, mesmo padrão já usado pro fetchZoneRankings da WCL.
function asMechanicBreakdownProvider(wipefest: WipefestProvider): DataProvider<WipefestFightContext, WipefestRawMechanicBreakdown> {
  return {
    name: wipefest.name,
    fetch: (context) => wipefest.fetchMechanicBreakdown(context),
  };
}

async function fetchBossScores(
  wipefest: WipefestProvider,
  collector: DataCollector,
  page: Page,
  bosses: Boss[],
  players: RosterPlayer[],
  rawKeyPrefix: string,
  previous: BossInsightsByDifficulty
): Promise<BossInsightsByDifficulty> {
  const wipefestMechanics = asMechanicBreakdownProvider(wipefest);
  // Começa a partir do placar já salvo (não de {}): um boss cujo re-scrape
  // falhar nesta rodada mantém o placar anterior em vez de sumir do arquivo
  // final — mesmo princípio de "nunca sobrescrever dados antigos" que o
  // Snapshot System já documenta, aplicado aqui como merge incremental
  // (mesmo padrão de fallback que sync-roster-stats.ts usa pro roster).
  const result: BossInsightsByDifficulty = { ...previous };

  for (const boss of bosses) {
    if (boss.status !== "killed") continue;

    const ref = parseWclReportLink(boss.links.warcraftLogs);
    if (!ref) {
      console.log(`Pulando ${boss.name}: sem link da WCL com fight resolvido.`);
      continue;
    }

    console.log(`${boss.name} (${ref.reportCode}/fight/${ref.fightId})...`);

    const [outcome] = await collector.run({
      provider: wipefest,
      context: { page, reportCode: ref.reportCode, fightId: ref.fightId },
      rawKey: `${rawKeyPrefix}/${boss.id}`,
    });

    if (outcome.status === "error") {
      console.warn(`  falhou: ${outcome.error} — mantendo o placar salvo anteriormente para ${boss.name}.`);
      continue;
    }

    // Passe separado: clica em cada player-card pra ler o breakdown por
    // mecânica (não dá pra ler isso sem clicar, é estado interno da página,
    // não reflete na URL) — bem mais lento que o passe de score.
    const [mechanicsOutcome] = await collector.run({
      provider: wipefestMechanics,
      context: { page, reportCode: ref.reportCode, fightId: ref.fightId },
      rawKey: `${rawKeyPrefix}/${boss.id}-mechanics`,
    });

    if (mechanicsOutcome.status === "error") {
      console.warn(`  falhou o breakdown de mecânicas: ${mechanicsOutcome.error} — mantendo o breakdown salvo anteriormente.`);
    }
    const mechanicsByName = mechanicsOutcome.status === "ok" ? mechanicsOutcome.result.raw : {};
    // Placar anterior deste boss (se houver), pra recuperar o breakdown de
    // mecânica de um jogador quando o passe de mecânicas desta rodada falhou
    // ou não achou o card dele — mesmo princípio de merge do placar como um
    // todo, aplicado por jogador.
    const previousScores = previous[boss.id] ?? [];

    const scores: BossPlayerScore[] = [];
    for (const player of players) {
      const entry = outcome.result.raw.find((p) => sameCharacterName(p.name, player.name));
      if (!entry) continue;

      const mechanicsKey = Object.keys(mechanicsByName).find((name) => sameCharacterName(name, player.name));
      const mechanics = mechanicsKey
        ? mechanicsByName[mechanicsKey]
        : previousScores.find((previousEntry) => previousEntry.playerId === player.id)?.mechanics;

      scores.push({
        playerId: player.id,
        score: entry.score,
        bonus: entry.bonus,
        itemLevel: entry.itemLevel,
        ...(mechanics ? { mechanics } : {}),
      });
    }

    result[boss.id] = scores;
    console.log(`  ${scores.length} jogador(es) (${Object.keys(mechanicsByName).length} com breakdown de mecânicas).`);
  }

  return result;
}

async function loadExistingOutput(outPath: string): Promise<BossInsights> {
  try {
    await access(outPath);
  } catch {
    return { bossesNormal: {}, bossesHeroic: {} };
  }
  return JSON.parse(await readFile(outPath, "utf-8")) as BossInsights;
}

async function main() {
  const { season, headed } = parseArgs();

  const seasonDir = path.join(ROOT, "data/seasons", season);
  const seasonData: SeasonFile = JSON.parse(await readFile(path.join(seasonDir, "config.json"), "utf-8"));
  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));

  const outPath = path.join(seasonDir, "boss-insights.json");
  const existing = await loadExistingOutput(outPath);

  const wipefest = new WipefestProvider();
  const collector = new DataCollector();

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  console.log("Normal:");
  const bossesNormal = await fetchBossScores(
    wipefest,
    collector,
    page,
    seasonData.bossesNormal ?? [],
    roster,
    `boss-insights/${season}/normal`,
    existing.bossesNormal ?? {}
  );

  console.log("\nHeroica:");
  const bossesHeroic = await fetchBossScores(
    wipefest,
    collector,
    page,
    seasonData.bossesHeroic ?? [],
    roster,
    `boss-insights/${season}/heroic`,
    existing.bossesHeroic ?? {}
  );

  await browser.close();

  const output: BossInsights = { bossesNormal, bossesHeroic };

  await mkdir(seasonDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\n${path.relative(ROOT, outPath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
