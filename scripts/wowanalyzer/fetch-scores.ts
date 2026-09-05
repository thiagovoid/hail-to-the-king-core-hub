import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { DataCollector } from "../../src/services/DataCollector";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { WoWAnalyzerProvider, type WoWAnalyzerRawUptime } from "../../src/providers/wowanalyzer/WoWAnalyzerProvider";
import { averageUptime } from "../../src/providers/wowanalyzer/normalize";
import type { PlayerPerformance } from "../../src/types/performance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53;

interface RosterPlayer {
  id: string;
  name: string;
}

interface WeeklyPerformanceFile {
  week: number;
  runs: Array<{ date: string; reportCode?: string; players: PlayerPerformance[] }>;
}

async function loadRoster(): Promise<RosterPlayer[]> {
  const raw = await readFile(path.join(ROOT, "data/roster.json"), "utf-8");
  return JSON.parse(raw);
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.week) {
    throw new Error("Uso: vite-node fetch-scores.ts --week=3 [--headed]");
  }

  return { week: Number(args.week), headed: Boolean(args.headed) };
}

async function main() {
  const { week, headed } = parseArgs();
  const weekPadded = String(week).padStart(2, "0");
  const filePath = path.join(ROOT, "data/performance", `week-${weekPadded}.json`);

  const weekData: WeeklyPerformanceFile = JSON.parse(await readFile(filePath, "utf-8"));
  const roster = await loadRoster();

  const wcl = new WarcraftLogsProvider();
  const wowAnalyzer = new WoWAnalyzerProvider();
  const collector = new DataCollector();

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  for (const run of weekData.runs) {
    if (!run.reportCode) {
      console.log(`Pulando run de ${run.date}: sem reportCode (lançada manualmente).`);
      continue;
    }

    console.log(`Run ${run.date} (${run.reportCode})...`);

    // Mesmo truque do script do Wipefest: reconsulta a WCL só pra saber
    // quais fights compõem o agregado dessa run, sem depender de data/raw/.
    const [tablesOutcome] = await collector.run({
      provider: wcl,
      context: { reportCode: run.reportCode, validEncounterIds },
      rawKey: run.reportCode,
    });

    if (tablesOutcome.status === "error") {
      console.warn(`  falhou ao buscar fights do report: ${tablesOutcome.error}`);
      continue;
    }

    const { aggregateFightIds } = tablesOutcome.result.raw;

    for (const player of roster) {
      const outcomes = await collector.run(
        ...aggregateFightIds.map((fightId) => ({
          provider: wowAnalyzer,
          context: { page, reportCode: run.reportCode!, fightId, characterName: player.name },
          rawKey: `${run.reportCode}/fight-${fightId}/${player.id}`,
        }))
      );

      const fightsRaw: WoWAnalyzerRawUptime[] = [];
      for (const outcome of outcomes) {
        if (outcome.status === "error") {
          console.warn(`  falhou no fight ${outcome.rawKey}: ${outcome.error}`);
          continue;
        }
        fightsRaw.push(outcome.result.raw);
      }

      const uptime = averageUptime(fightsRaw);
      if (uptime === null) continue;

      const existing = run.players.find((entry) => entry.playerId === player.id);
      if (existing) {
        existing.uptime = uptime;
      } else {
        run.players.push({ playerId: player.id, deaths: 0, uptime });
      }

      console.log(`  ${player.name}: uptime ${uptime}% (média de ${fightsRaw.length}/${aggregateFightIds.length} fight(s)).`);
    }
  }

  await browser.close();

  await writeFile(filePath, `${JSON.stringify(weekData, null, 2)}\n`);
  console.log(`\n${path.relative(ROOT, filePath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
