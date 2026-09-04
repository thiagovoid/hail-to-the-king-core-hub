import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { DataCollector } from "../../src/services/DataCollector";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";
import { WipefestProvider, type WipefestRawFightScores } from "../../src/providers/wipefest/WipefestProvider";
import { averageWipefestScores } from "../../src/providers/wipefest/normalize";
import type { PlayerPerformance } from "../../src/types/performance";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53;

interface RosterPlayer {
  id: string;
  warcraftLogs: { profileUrl: string };
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

  return {
    week: Number(args.week),
    headed: Boolean(args.headed),
  };
}

async function main() {
  const { week, headed } = parseArgs();
  const weekPadded = String(week).padStart(2, "0");
  const filePath = path.join(ROOT, "data/performance", `week-${weekPadded}.json`);

  const weekData: WeeklyPerformanceFile = JSON.parse(await readFile(filePath, "utf-8"));
  const roster = await loadRoster();
  const players = roster.map((player) => ({
    id: player.id,
    name: parseWclProfile(player.warcraftLogs.profileUrl).name,
  }));

  const wcl = new WarcraftLogsProvider();
  const wipefest = new WipefestProvider();
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

    // Reconsulta a WCL só pra saber quais fights compõem o agregado dessa
    // run (mesmo critério que fetch-performance.ts já usa pro dps/parse) —
    // evita depender de data/raw/, que é gitignorado.
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

    const fightOutcomes = await collector.run(
      ...aggregateFightIds.map((fightId) => ({
        provider: wipefest,
        context: { page, reportCode: run.reportCode!, fightId },
        rawKey: `${run.reportCode}/fight-${fightId}`,
      }))
    );

    const fightsRaw: WipefestRawFightScores[] = [];
    for (const outcome of fightOutcomes) {
      if (outcome.status === "error") {
        console.warn(`  falhou no fight ${outcome.rawKey}: ${outcome.error}`);
        continue;
      }
      fightsRaw.push(outcome.result.raw);
    }

    const averages = averageWipefestScores(fightsRaw, players);

    for (const { playerId, wipefestScore } of averages) {
      const existing = run.players.find((player) => player.playerId === playerId);
      if (existing) {
        existing.wipefestScore = wipefestScore;
      } else {
        run.players.push({ playerId, deaths: 0, wipefestScore });
      }
    }

    console.log(
      `  ${averages.length} jogador(es) com wipefestScore (média de ${aggregateFightIds.length} fight(s) da run).`
    );
  }

  await browser.close();

  await writeFile(filePath, `${JSON.stringify(weekData, null, 2)}\n`);
  console.log(`\n${path.relative(ROOT, filePath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
