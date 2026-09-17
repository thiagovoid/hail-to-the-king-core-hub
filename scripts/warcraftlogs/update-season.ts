import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { toBrazilDateString } from "../../src/providers/warcraftlogs/normalize";
import {
  WCL_DIFFICULTY,
  applyReportToBosses,
  mergeRecentLogs,
  type ProgressionReport,
} from "../../src/engine/progression";
import type { Boss, SiteConfig } from "../../src/types/index";
import { RAID_ZONE_ID, discoverReports } from "./discover-reports";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface SeasonFile {
  config: SiteConfig;
  bossesNormal: Boss[];
  bossesHeroic: Boss[];
  recentLogs?: Array<{ date: string; url: string; title: string }>;
}

interface Args {
  season: string;
  days: number;
  start?: number;
  end?: number;
  extraReportCodes: string[];
  discoverByCharacter: boolean;
}

function parseArgs(): Args {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  // Uso: vite-node update-season.ts [--season=midnight-s2] [--days=7] [--start=YYYY-MM-DD --end=YYYY-MM-DD] [--reports=a,b] [--discover-characters]
  return {
    season: String(args.season ?? "midnight-s2"),
    days: Number(args.days ?? 7),
    start: args.start ? new Date(String(args.start)).getTime() : undefined,
    end: args.end ? new Date(String(args.end)).getTime() : undefined,
    extraReportCodes: args.reports
      ? String(args.reports).split(",").map((code) => code.trim()).filter(Boolean)
      : [],
    discoverByCharacter: Boolean(args["discover-characters"]),
  };
}

/**
 * Atualiza a temporada a partir dos logs da WCL:
 * - pulls/kills de cada boss (Normal e Heroica) até a primeira kill, via
 *   engine/progression (regra pura, testada) — depois da kill o boss tomba;
 * - "Últimos Logs" da home do core, um por report;
 * - `lastUpdated`.
 *
 * Só olha reports a partir de `config.progressionAutoSince`: o que veio
 * antes já está somado à mão em `pulls`, e recontar dobraria o número.
 */
async function main() {
  const { season, days, start, end, extraReportCodes, discoverByCharacter } = parseArgs();

  const seasonPath = path.join(ROOT, "data/seasons", season, "config.json");
  const seasonFile: SeasonFile = JSON.parse(await readFile(seasonPath, "utf-8"));
  const roster: Array<{ warcraftLogs: { profileUrl: string } }> = JSON.parse(
    await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8")
  );

  const autoSince = seasonFile.config.progressionAutoSince;
  if (!autoSince) {
    throw new Error(`config.progressionAutoSince ausente em ${path.relative(ROOT, seasonPath)}.`);
  }
  const autoSinceMs = Date.parse(`${autoSince}T00:00:00-03:00`);

  const wcl = new WarcraftLogsProvider();

  const endTime = end ?? Date.now();
  const startTime = start ?? endTime - days * 24 * 60 * 60 * 1000;
  console.log(`Buscando reports entre ${new Date(startTime).toISOString()} e ${new Date(endTime).toISOString()}...`);

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);
  const { reports } = await discoverReports({ wcl, roster, startTime, endTime, extraReportCodes, discoverByCharacter });

  // Ordem cronológica importa: a primeira kill tem que ser a primeira mesmo.
  const ordered = [...reports].sort((a, b) => a.startTime - b.startTime);

  let bossesNormal = seasonFile.bossesNormal;
  let bossesHeroic = seasonFile.bossesHeroic;
  const changed = new Set<string>();
  const unmapped = new Set<number>();

  for (const report of ordered) {
    if (report.startTime < autoSinceMs) {
      console.log(`Pulando ${report.code} (${toBrazilDateString(report.startTime)}): anterior a progressionAutoSince=${autoSince}.`);
      continue;
    }

    const fights = await wcl.fetchReportFights(report.code);
    const progressionReport: ProgressionReport = {
      code: report.code,
      date: toBrazilDateString(report.startTime),
      fights: fights.filter((fight) => validEncounterIds.has(fight.encounterID)),
    };

    const normal = applyReportToBosses(bossesNormal, progressionReport, WCL_DIFFICULTY.normal);
    const heroic = applyReportToBosses(bossesHeroic, progressionReport, WCL_DIFFICULTY.heroic);
    bossesNormal = normal.bosses;
    bossesHeroic = heroic.bosses;

    for (const id of [...normal.changedBossIds.map((b) => `${b} (Normal)`), ...heroic.changedBossIds.map((b) => `${b} (Heroica)`)]) {
      changed.add(id);
    }
    for (const id of [...normal.unmappedEncounterIds, ...heroic.unmappedEncounterIds]) unmapped.add(id);

    console.log(
      `${report.code} (${progressionReport.date}): ${progressionReport.fights.length} fight(s) de raid — mudou: ${
        [...normal.changedBossIds, ...heroic.changedBossIds].join(", ") || "nada"
      }.`
    );
  }

  if (unmapped.size > 0) {
    // Sem mapeamento não dá pra atribuir pull a boss — melhor avisar alto do
    // que chutar pela ordem e tombar um número errado como histórico.
    const encounters = await wcl.fetchRaidEncounters(RAID_ZONE_ID);
    const names = new Map(encounters.map((encounter) => [encounter.id, encounter.name]));
    console.warn("\nEncontros sem `encounterId` mapeado em config.json — pulls desses bosses NÃO foram contados:");
    for (const id of unmapped) {
      console.warn(`  encounterId ${id} → ${names.get(id) ?? "(nome desconhecido)"}`);
    }
    console.warn("Preencha `encounterId` nos bosses correspondentes (Normal e Heroica) e rode de novo.\n");
  }

  const recentLogs = mergeRecentLogs(
    seasonFile.recentLogs ?? [],
    ordered.map((report) => ({ code: report.code, date: toBrazilDateString(report.startTime) })),
    seasonFile.config.currentRaid
  );

  const output: SeasonFile = {
    ...seasonFile,
    config: { ...seasonFile.config, lastUpdated: new Date().toISOString() },
    bossesNormal,
    bossesHeroic,
    recentLogs,
  };

  await writeFile(seasonPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `\n${path.relative(ROOT, seasonPath)} atualizado: ${changed.size} boss(es) alterado(s)${
      changed.size ? ` (${[...changed].join(", ")})` : ""
    }, ${recentLogs.length} log(s) recentes.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
