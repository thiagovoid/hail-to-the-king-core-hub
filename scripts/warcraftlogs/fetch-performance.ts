import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import { saveRaw } from "../../src/services/RawStorage";
import type { DataProvider } from "../../src/providers/types";
import { RaiderIoProvider } from "../../src/providers/raiderio/RaiderIoProvider";
import {
  WarcraftLogsProvider,
  type WarcraftLogsRankingContext,
  type WarcraftLogsRawRankings,
  type WclReportRef,
} from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import {
  buildRunPlayers,
  calculateAggregateDurationMs,
  classNameToSlug,
  parseWclProfile,
  sameCharacterName,
  selectAggregateFights,
  slugifyId,
  toBrazilDateString,
  translateRace,
  type WclPlayerDetail,
  type WclProfile,
} from "../../src/providers/warcraftlogs/normalize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const GUILD_NAME = "Hail to the King";
const GUILD_SERVER_SLUG = "nemesis";
const GUILD_SERVER_REGION = "US";

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

const wcl = new WarcraftLogsProvider();
const raiderIo = new RaiderIoProvider();
const collector = new DataCollector();

// DataCollector only ever calls `provider.fetch()` (the DataProvider
// contract) — this adapter lets the ranking pass (`wcl.fetchRankings`, a
// second raw-fetch flavor the class exposes beyond the interface) go through
// the same collector/raw-storage machinery as the main report fetch.
const wclRankings: DataProvider<WarcraftLogsRankingContext, WarcraftLogsRawRankings> = {
  name: wcl.name,
  fetch: (context) => wcl.fetchRankings(context),
};

interface Args {
  week: number;
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

  if (!args.week) {
    throw new Error(
      "Uso: vite-node fetch-performance.ts --week=3 [--days=7] [--start=2026-08-18 --end=2026-08-19] [--reports=codigo1,codigo2] [--discover-characters]"
    );
  }

  return {
    week: Number(args.week),
    days: Number(args.days ?? 7),
    start: args.start ? new Date(String(args.start)).getTime() : undefined,
    end: args.end ? new Date(String(args.end)).getTime() : undefined,
    extraReportCodes: args.reports
      ? String(args.reports).split(",").map((code) => code.trim()).filter(Boolean)
      : [],
    // Desligado por padrão: reports sem guild marcada às vezes são cópias
    // duplicadas da mesma sessão (várias pessoas subindo o próprio log).
    discoverByCharacter: Boolean(args["discover-characters"]),
  };
}

interface RosterPlayer {
  id: string;
  name: string;
  class: string;
  race: string;
  spec: string;
  heroSpec: string | null;
  role: "tank" | "healer" | "dps";
  type: "main" | "alt";
  discord: string | null;
  avatar: string | null;
  raiderIo: { io: null; bestDungeon: null; highestKey: null; realmRank: null; profileUrl: string };
  warcraftLogs: { avgParse: null; bestParse: null; attendance: null; profileUrl: string };
  externalLinks: { raiderIo: string; raidbots: string; archon: string; warcraftLogs: string; wipefest: string };
}

async function loadRoster(): Promise<RosterPlayer[]> {
  const raw = await readFile(path.join(ROOT, "data/roster.json"), "utf-8");
  return JSON.parse(raw);
}

function getUploaderUserIds(): number[] {
  return (process.env.WCL_UPLOADER_USER_IDS ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

// Monta um rascunho de entrada pro roster.json com o que a WCL e o Raider.io
// sabem. "type" entra como "alt" por padrão (senão não aparece em /membros/).
// Discord/heroSpec ficam vazios pra alguém completar depois. "spec" fica em
// inglês (como a WCL retorna) — precisa traduzir ao revisar.
async function buildRosterDraft(
  character: { name: string; class: string; spec: string; role: "tank" | "healer" | "dps"; server: string; region: string },
  existingIds: Set<string>
): Promise<RosterPlayer> {
  const region = character.region.toLowerCase();
  const realm = character.server.toLowerCase().replace(/\s+/g, "-");
  const profileSlug = encodeURIComponent(character.name);

  const raiderIoResult = await collector.run([
    {
      provider: raiderIo,
      context: { region, realm, name: character.name },
      rawKey: `roster-draft/${slugifyId(character.name, new Set())}`,
    },
  ]);
  const raiderIoProfile = raiderIoResult[0].status === "ok" ? raiderIoResult[0].result.raw : null;

  const race = translateRace(raiderIoProfile?.race);
  const avatar = raiderIoProfile?.thumbnail_url ?? "";

  return {
    id: slugifyId(character.name, existingIds),
    name: character.name,
    class: classNameToSlug(character.class),
    race,
    spec: character.spec,
    heroSpec: null,
    role: character.role,
    type: "alt",
    discord: null,
    avatar: avatar || null,
    raiderIo: {
      io: null,
      bestDungeon: null,
      highestKey: null,
      realmRank: null,
      profileUrl: `https://raider.io/characters/${region}/${realm}/${profileSlug}`,
    },
    warcraftLogs: {
      avgParse: null,
      bestParse: null,
      attendance: null,
      profileUrl: `https://www.warcraftlogs.com/character/${region}/${realm}/${profileSlug}`,
    },
    externalLinks: {
      raiderIo: `https://raider.io/characters/${region}/${realm}/${profileSlug}`,
      raidbots: "",
      archon: "",
      warcraftLogs: "",
      wipefest: "",
    },
  };
}

async function main() {
  const { week, days, start, end, extraReportCodes, discoverByCharacter } = parseArgs();
  const roster = await loadRoster();

  const endTime = end ?? Date.now();
  const startTime = start ?? endTime - days * 24 * 60 * 60 * 1000;

  console.log(`Buscando reports entre ${new Date(startTime).toISOString()} e ${new Date(endTime).toISOString()}...`);

  const [guildId, validEncounterIds] = await Promise.all([
    wcl.resolveGuildId(GUILD_NAME, GUILD_SERVER_SLUG, GUILD_SERVER_REGION),
    wcl.fetchRaidEncounterIds(RAID_ZONE_ID),
  ]);

  const guildReports = await wcl.fetchGuildReports(guildId, startTime, endTime, RAID_ZONE_ID);

  const extraReports: WclReportRef[] = [];
  for (const code of extraReportCodes) {
    if (guildReports.some((report) => report.code === code)) continue;
    const meta = await wcl.fetchReportMeta(code);
    if (meta?.zone?.id === RAID_ZONE_ID) extraReports.push(meta);
  }

  const uploaderUserIds = getUploaderUserIds();
  const uploaderReports: WclReportRef[] = [];
  for (const userID of uploaderUserIds) {
    uploaderReports.push(...(await wcl.fetchUserReports(userID, startTime, endTime, RAID_ZONE_ID)));
  }

  const reportsByCode = new Map<string, WclReportRef>();
  for (const report of [...guildReports, ...uploaderReports, ...extraReports]) {
    reportsByCode.set(report.code, report);
  }

  // Descoberta por personagem: acha reports pessoais/unlisted que nenhuma
  // busca por guildID/userID enxerga. Só aceito automaticamente se o dono for
  // uma conta confiável (WCL_UPLOADER_USER_IDS) — sem isso, é modo investigação.
  const trustedUploaderIds = new Set(uploaderUserIds);
  const trustedDiscovered: WclReportRef[] = [];
  const untrustedDiscovered: WclReportRef[] = [];

  if (trustedUploaderIds.size > 0 || discoverByCharacter) {
    for (const player of roster) {
      const profile = parseWclProfile(player.warcraftLogs.profileUrl);
      const playerReports = await wcl.fetchCharacterRecentReports(profile);

      for (const report of playerReports) {
        if (report.zone?.id !== RAID_ZONE_ID) continue;
        if (report.startTime < startTime || report.startTime > endTime) continue;
        if (reportsByCode.has(report.code)) continue;
        if (trustedDiscovered.some((r) => r.code === report.code)) continue;
        if (untrustedDiscovered.some((r) => r.code === report.code)) continue;

        if (report.owner?.id && trustedUploaderIds.has(report.owner.id)) {
          trustedDiscovered.push(report);
        } else if (discoverByCharacter) {
          untrustedDiscovered.push(report);
        }
      }
    }
  }

  for (const report of [...trustedDiscovered, ...untrustedDiscovered]) {
    reportsByCode.set(report.code, report);
  }

  const reports = [...reportsByCode.values()];
  console.log(
    `${reports.length} report(s) de raid encontrados (${guildReports.length} pela guild, ${uploaderReports.length} por conta de upload conhecida, ${extraReports.length} manuais, ${trustedDiscovered.length} descobertos de contas confiáveis, ${untrustedDiscovered.length} descobertos de contas não verificadas).`
  );

  if (untrustedDiscovered.length > 0) {
    console.warn(
      "Atenção: reports de contas não verificadas incluídos (--discover-characters). Confirme que não são cópias duplicadas de outra pessoa antes de usar esses dados (pode contar mortes em dobro)."
    );
  }

  const weekPadded = String(week).padStart(2, "0");
  await saveRaw("warcraftlogs", `_discovery/week-${weekPadded}`, {
    window: { startTime, endTime },
    guildReports,
    uploaderReports,
    extraReports,
    trustedDiscovered,
    untrustedDiscovered,
  });

  // Pass 1: fights + tables de cada report, via DataCollector (arquiva em
  // data/raw/warcraftlogs/<code>.json). Falha num report não derruba o resto.
  const tablesOutcomes = await collector.run(
    reports.map((report) => ({
      provider: wcl,
      context: { reportCode: report.code, validEncounterIds },
      rawKey: report.code,
    }))
  );

  interface ReportContext {
    report: WclReportRef;
    killedEncounterIds: number[];
    aggregateFightIds: number[];
    aggregateDurationMs: number;
    aggregateTables: Awaited<ReturnType<WarcraftLogsProvider["fetchFightTables"]>>;
    fullTables: Awaited<ReturnType<WarcraftLogsProvider["fetchFightTables"]>>;
  }

  const reportContexts: ReportContext[] = [];
  const seenCharacters = new Map<
    string,
    { name: string; class: string; spec: string; role: "tank" | "healer" | "dps"; server: string; region: string }
  >();

  for (const [index, outcome] of tablesOutcomes.entries()) {
    if (outcome.status === "error") {
      console.warn(`Falha ao buscar dados do report ${reports[index].code}: ${outcome.error}`);
      continue;
    }

    const tables = outcome.result.raw;
    const aggregateFights = selectAggregateFights(tables.raidFights, tables.killedFights);
    const aggregateDurationMs = calculateAggregateDurationMs(aggregateFights);
    const playerDetails = tables.fullTables.summary.data.playerDetails ?? {};

    const roleBuckets: Array<[ "tank" | "healer" | "dps", WclPlayerDetail[] | undefined ]> = [
      ["tank", playerDetails.tanks],
      ["dps", playerDetails.dps],
      ["healer", playerDetails.healers],
    ];

    for (const [role, list] of roleBuckets) {
      for (const member of list ?? []) {
        if (!seenCharacters.has(member.name)) {
          seenCharacters.set(member.name, {
            name: member.name,
            class: member.type,
            spec: member.specs?.[0]?.name ?? "",
            role,
            server: member.server,
            region: member.region,
          });
        }
      }
    }

    reportContexts.push({
      report: reports[index],
      killedEncounterIds: [...new Set(tables.killedFights.map((fight) => fight.encounterID))],
      aggregateFightIds: tables.aggregateFightIds,
      aggregateDurationMs,
      aggregateTables: tables.aggregateTables,
      fullTables: tables.fullTables,
    });
  }

  // Jogadores que apareceram numa run mas não estão no roster.json ainda
  // ganham um rascunho de cadastro.
  const knownWclNames = new Set(
    roster.map((player) => parseWclProfile(player.warcraftLogs.profileUrl).name.toLowerCase())
  );
  const newCharacters = [...seenCharacters.values()].filter(
    (character) => !knownWclNames.has(character.name.toLowerCase())
  );

  let effectiveRoster = roster;

  if (newCharacters.length > 0) {
    const existingIds = new Set(roster.map((player) => player.id));
    const drafts: RosterPlayer[] = [];
    for (const character of newCharacters) {
      const draft = await buildRosterDraft(character, existingIds);
      existingIds.add(draft.id);
      drafts.push(draft);
    }

    effectiveRoster = [...roster, ...drafts];
    await writeFile(path.join(ROOT, "data/roster.json"), `${JSON.stringify(effectiveRoster, null, 2)}\n`);

    console.log(
      `${drafts.length} jogador(es) novo(s) encontrado(s) no log, adicionados como rascunho em data/roster.json: ${drafts
        .map((d) => `${d.name} (${d.id})`)
        .join(", ")}.`
    );
    console.log('Revise esses rascunhos: spec está em inglês, e faltam discord/heroSpec/type (assumido "alt").');
  }

  const rosterProfiles = effectiveRoster.map((player) => ({
    id: player.id,
    role: player.role,
    profile: parseWclProfile(player.warcraftLogs.profileUrl),
  }));

  // Pass 2: rankings (parse), agora com effectiveRoster já completo.
  const rankingOutcomes = await collector.run(
    reportContexts.map((ctx) => ({
      provider: wclRankings,
      context: {
        reportCode: ctx.report.code,
        aggregateFightIds: ctx.aggregateFightIds,
        killedEncounterIds: ctx.killedEncounterIds,
        players: rosterProfiles.map(({ profile, role }) => ({
          profile,
          metric: (role === "healer" ? "hps" : "dps") as "dps" | "hps",
        })),
      },
      rawKey: `${ctx.report.code}-rankings`,
    }))
  );

  const runsByReportCode = new Map<string, { date: string; reportCode: string; players: ReturnType<typeof buildRunPlayers> }>();

  for (const [index, ctx] of reportContexts.entries()) {
    const rankingOutcome = rankingOutcomes[index];
    const rankings = rankingOutcome.status === "ok" ? rankingOutcome.result.raw.rankings : [];
    if (rankingOutcome.status === "error") {
      console.warn(`Falha ao buscar rankings do report ${ctx.report.code}: ${rankingOutcome.error}`);
    }

    const runPlayers = buildRunPlayers({
      reportCode: ctx.report.code,
      aggregateFightIds: ctx.aggregateFightIds,
      aggregateDurationMs: ctx.aggregateDurationMs,
      aggregateTables: ctx.aggregateTables,
      fullTables: ctx.fullTables,
      rankings,
      players: rosterProfiles,
    });

    runsByReportCode.set(ctx.report.code, {
      date: toBrazilDateString(ctx.report.startTime),
      reportCode: ctx.report.code,
      players: runPlayers,
    });
  }

  const fileName = `week-${weekPadded}.json`;
  const outPath = path.join(ROOT, "data/performance", fileName);

  // Mescla com o arquivo existente: uma run nova soma às que já tinha.
  let existingRuns: Array<{ date: string; reportCode?: string; players: unknown[] }> = [];
  try {
    const raw = await readFile(outPath, "utf-8");
    existingRuns = JSON.parse(raw).runs ?? [];
  } catch {
    existingRuns = [];
  }

  const runsByKey = new Map<string, { date: string; reportCode?: string; players: unknown[] }>();
  for (const run of existingRuns) {
    runsByKey.set(run.reportCode ?? run.date, run);
  }
  for (const [reportCode, run] of runsByReportCode) {
    runsByKey.set(reportCode, run);
  }

  const runs = [...runsByKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  const output = { week, runs };

  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `Gerado ${path.relative(ROOT, outPath)} com ${runs.length} run(s) (${runsByReportCode.size} atualizada(s)/nova(s) nessa execução).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
