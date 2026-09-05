import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

import { DataCollector } from "../../src/services/DataCollector";
import { sameCharacterName } from "../../src/providers/warcraftlogs/normalize";
import { WipefestProvider } from "../../src/providers/wipefest/WipefestProvider";
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

async function fetchBossScores(
  wipefest: WipefestProvider,
  collector: DataCollector,
  page: Page,
  bosses: Boss[],
  players: RosterPlayer[],
  rawKeyPrefix: string
): Promise<BossInsightsByDifficulty> {
  const result: BossInsightsByDifficulty = {};

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
      console.warn(`  falhou: ${outcome.error}`);
      continue;
    }

    const scores: BossPlayerScore[] = [];
    for (const player of players) {
      const entry = outcome.result.raw.find((p) => sameCharacterName(p.name, player.name));
      if (!entry) continue;
      scores.push({ playerId: player.id, score: entry.score, bonus: entry.bonus, itemLevel: entry.itemLevel });
    }

    result[boss.id] = scores;
    console.log(`  ${scores.length} jogador(es).`);
  }

  return result;
}

async function main() {
  const { season, headed } = parseArgs();

  const seasonData: SeasonFile = JSON.parse(await readFile(path.join(ROOT, "data/seasons", `${season}.json`), "utf-8"));
  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/roster.json"), "utf-8"));

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
    `boss-insights/${season}/normal`
  );

  console.log("\nHeroica:");
  const bossesHeroic = await fetchBossScores(
    wipefest,
    collector,
    page,
    seasonData.bossesHeroic ?? [],
    roster,
    `boss-insights/${season}/heroic`
  );

  await browser.close();

  const output: BossInsights = { bossesNormal, bossesHeroic };

  const outDir = path.join(ROOT, "data/boss-insights");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${season}.json`);
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\n${path.relative(ROOT, outPath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
