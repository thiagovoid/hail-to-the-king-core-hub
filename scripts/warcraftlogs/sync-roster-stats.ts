import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import type { DataProvider } from "../../src/providers/types";
import { RaiderIoProvider, type RaiderIoRawProfile } from "../../src/providers/raiderio/RaiderIoProvider";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

const wcl = new WarcraftLogsProvider();
const raiderIo = new RaiderIoProvider();
const collector = new DataCollector();

// Adapta o método de zona da WCL (que já engole erro e devolve null) pro
// mesmo formato de DataProvider que o DataCollector espera, só pra ganhar o
// arquivamento em data/raw/ de graça.
const wclZoneRankings: DataProvider<
  { profile: { region: string; realm: string; name: string }; metric: "dps" | "hps" },
  { medianPerformanceAverage?: number; bestPerformanceAverage?: number } | null
> = {
  name: wcl.name,
  fetch: async (context) => ({
    provider: wcl.name,
    fetchedAt: new Date().toISOString(),
    raw: await wcl.fetchZoneRankings(context.profile, RAID_ZONE_ID, context.metric),
  }),
};

interface RosterPlayer {
  id: string;
  name: string;
  role: "tank" | "healer" | "dps";
  warcraftLogs: { avgParse: number | null; bestParse: number | null; attendance: number | null; profileUrl: string };
  raiderIo: { io: number | null; bestDungeon: string | null; highestKey: number | null; realmRank: number | null };
  [key: string]: unknown;
}

interface PerformanceRun {
  players: Array<{ playerId: string }>;
}

async function loadRoster(): Promise<RosterPlayer[]> {
  const raw = await readFile(path.join(ROOT, "data/roster.json"), "utf-8");
  return JSON.parse(raw);
}

async function loadAllRuns(): Promise<PerformanceRun[]> {
  const dir = path.join(ROOT, "data/performance");
  const files = (await readdir(dir)).filter((file) => /^week-\d+\.json$/.test(file));

  const runs: PerformanceRun[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf-8");
    const week = JSON.parse(raw);
    runs.push(...(week.runs ?? []));
  }
  return runs;
}

function pickBestRun(bestRuns: RaiderIoRawProfile["mythic_plus_best_runs"]) {
  if (!bestRuns || bestRuns.length === 0) return null;
  return bestRuns.reduce((best, run) => (run.mythic_level > best.mythic_level ? run : best));
}

async function main() {
  const roster = await loadRoster();
  const allRuns = await loadAllRuns();
  const totalRuns = allRuns.length;

  console.log(`Sincronizando estatísticas de ${roster.length} jogador(es) (${totalRuns} run(s) na temporada)...`);

  const updatedRoster: RosterPlayer[] = [];

  for (const player of roster) {
    let profile;
    try {
      profile = parseWclProfile(player.warcraftLogs.profileUrl);
    } catch {
      console.warn(`Pulando ${player.name}: URL do WarcraftLogs inválida.`);
      updatedRoster.push(player);
      continue;
    }

    const region = profile.region.toLowerCase();
    const realm = profile.realm;
    const metricKey: "dps" | "hps" = player.role === "healer" ? "hps" : "dps";

    const [raiderIoOutcome, zoneRankingOutcome] = await collector.run(
      {
        provider: raiderIo,
        context: {
          region,
          realm,
          name: profile.name,
          fields: ["mythic_plus_scores_by_season:current", "mythic_plus_best_runs", "mythic_plus_ranks"],
        },
        rawKey: `roster-sync/${player.id}`,
      },
      {
        provider: wclZoneRankings,
        context: { profile, metric: metricKey },
        rawKey: `roster-sync/${player.id}-zone-rankings`,
      }
    );

    const raiderIoProfile = raiderIoOutcome.status === "ok" ? raiderIoOutcome.result.raw : null;
    const zoneRankings = zoneRankingOutcome.status === "ok" ? zoneRankingOutcome.result.raw : null;

    const bestRun = pickBestRun(raiderIoProfile?.mythic_plus_best_runs);
    const ioScore = raiderIoProfile?.mythic_plus_scores_by_season?.[0]?.scores?.all;
    const realmRank = raiderIoProfile?.mythic_plus_ranks?.overall?.realm;

    const runsAttended = allRuns.filter((run) => run.players.some((entry) => entry.playerId === player.id)).length;

    updatedRoster.push({
      ...player,
      raiderIo: {
        ...player.raiderIo,
        io: typeof ioScore === "number" && ioScore > 0 ? Math.round(ioScore) : player.raiderIo.io,
        bestDungeon: bestRun?.dungeon ?? player.raiderIo.bestDungeon,
        highestKey: bestRun?.mythic_level ?? player.raiderIo.highestKey,
        realmRank: typeof realmRank === "number" && realmRank > 0 ? realmRank : player.raiderIo.realmRank,
      },
      warcraftLogs: {
        ...player.warcraftLogs,
        avgParse:
          typeof zoneRankings?.medianPerformanceAverage === "number"
            ? Math.round(zoneRankings.medianPerformanceAverage)
            : player.warcraftLogs.avgParse,
        bestParse:
          typeof zoneRankings?.bestPerformanceAverage === "number"
            ? Math.round(zoneRankings.bestPerformanceAverage)
            : player.warcraftLogs.bestParse,
        attendance: totalRuns > 0 ? Math.round((runsAttended / totalRuns) * 100) : player.warcraftLogs.attendance,
      },
    });

    console.log(
      `${player.name}: io=${ioScore ?? "-"} melhorKey=${
        bestRun ? `${bestRun.dungeon} +${bestRun.mythic_level}` : "-"
      } avgParse=${zoneRankings?.medianPerformanceAverage?.toFixed(1) ?? "-"} presença=${
        totalRuns > 0 ? Math.round((runsAttended / totalRuns) * 100) : "-"
      }%`
    );
  }

  await writeFile(path.join(ROOT, "data/roster.json"), `${JSON.stringify(updatedRoster, null, 2)}\n`);

  console.log("data/roster.json atualizado.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
