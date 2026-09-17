import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import type { DataProvider } from "../../src/providers/types";
import { weekNumberFromDate } from "../../src/engine/progression";
import type { PreparationChecklist } from "../../src/providers/warcraftlogs/preparation";
import {
  buildChecklistFromReference,
  specKey,
  type PreparationReference,
} from "../../src/providers/warcraftlogs/preparationReference";
import { RAID_ZONE_ID, discoverReports } from "./discover-reports";
import { RaiderIoProvider } from "../../src/providers/raiderio/RaiderIoProvider";
import { buildPlayerPerformance } from "../../src/normalization/buildPlayerPerformance";
import type { PlayerPerformance } from "../../src/types/performance";
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
  /** Força todas as runs num arquivo de semana; sem isso a semana vem da data de cada report. */
  week?: number;
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

  // Uso: vite-node fetch-performance.ts [--week=3] [--days=7] [--start=2026-08-18 --end=2026-08-19] [--reports=codigo1,codigo2] [--discover-characters]
  return {
    week: args.week ? Number(args.week) : undefined,
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
  status: "trial" | "member" | "veteran" | "inactive";
  discord: string | null;
  avatar: string | null;
  raiderIo: { io: null; bestDungeon: null; highestKey: null; realmRank: null; profileUrl: string };
  warcraftLogs: { avgParse: null; bestParse: null; attendance: null; profileUrl: string };
}

async function loadRoster(): Promise<RosterPlayer[]> {
  const raw = await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8");
  return JSON.parse(raw);
}

/**
 * Monta, por jogador, o checklist de Preparação a partir da referência que o
 * coletor do Wowhead gerou pra temporada. Cada jogador é avaliado contra a
 * recomendação da **sua** spec.
 *
 * Referência ausente ou spec sem entrada = nota não calculada (undefined),
 * nunca zero: a lacuna é nossa, não do raider.
 */
async function loadPreparationResolver(
  roster: Array<{ id: string; name: string; class: string; spec: string }>
): Promise<((playerId: string) => PreparationChecklist | undefined) | undefined> {
  let reference: PreparationReference;
  try {
    const raw = await readFile(path.join(ROOT, "data/seasons/midnight-s2/preparation-reference.json"), "utf-8");
    reference = JSON.parse(raw);
  } catch {
    console.warn(
      "Sem preparation-reference.json — a nota de Preparação não será calculada. Rode 'npm run wowhead:fetch-preparation'."
    );
    return undefined;
  }

  const byPlayer = new Map<string, PreparationChecklist>();
  const missingSpecs: string[] = [];
  const unknownSlots = new Set<string>();

  for (const player of roster) {
    const entry = reference.specs[specKey(player.class, player.spec)];
    if (!entry) {
      missingSpecs.push(`${player.name} (${player.class} / ${player.spec})`);
      continue;
    }

    const { checklist, unknownSlotLabels } = buildChecklistFromReference(entry);
    unknownSlotLabels.forEach((label) => unknownSlots.add(label));
    byPlayer.set(player.id, checklist);
  }

  if (missingSpecs.length > 0) {
    console.warn(
      `Sem recomendação do Wowhead pra ${missingSpecs.length} jogador(es) — ficam sem nota de Preparação:\n  ${missingSpecs.join("\n  ")}`
    );
  }
  if (unknownSlots.size > 0) {
    console.warn(
      `Rótulos de slot não reconhecidos no guia (encanto ignorado): ${[...unknownSlots].join(", ")}. ` +
        "Adicione o apelido em src/providers/warcraftlogs/preparationReference.ts."
    );
  }
  if (byPlayer.size === 0) return undefined;

  console.log(`Preparação: checklist montado pra ${byPlayer.size} de ${roster.length} jogador(es).`);
  return (playerId) => byPlayer.get(playerId);
}

async function loadSeasonStart(): Promise<string> {
  const raw = await readFile(path.join(ROOT, "data/seasons/midnight-s2/config.json"), "utf-8");
  const seasonStart: string | undefined = JSON.parse(raw).config?.seasonStart;
  if (!seasonStart) {
    throw new Error("config.seasonStart ausente em data/seasons/midnight-s2/config.json — necessário pra numerar as semanas.");
  }
  return seasonStart;
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

  const raiderIoResult = await collector.run({
    provider: raiderIo,
    context: { region, realm, name: character.name },
    rawKey: `roster-draft/${slugifyId(character.name, new Set())}`,
  });
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
    // Um rascunho de roster criado por esse script é, por definição, um
    // personagem novo aparecendo nos logs — trial é o status correto até
    // alguém da liderança revisar.
    status: "trial",
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
  };
}

async function main() {
  const { week, days, start, end, extraReportCodes, discoverByCharacter } = parseArgs();
  const roster = await loadRoster();

  const seasonStart = await loadSeasonStart();
  const resolvePreparationChecklist = await loadPreparationResolver(roster);

  const endTime = end ?? Date.now();
  const startTime = start ?? endTime - days * 24 * 60 * 60 * 1000;

  console.log(`Buscando reports entre ${new Date(startTime).toISOString()} e ${new Date(endTime).toISOString()}...`);

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);
  const { reports } = await discoverReports({ wcl, roster, startTime, endTime, extraReportCodes, discoverByCharacter });

  // Pass 1: fights + tables de cada report, via DataCollector (arquiva em
  // data/raw/warcraftlogs/<code>.json). Falha num report não derruba o resto.
  const tablesOutcomes = await collector.run(
    ...reports.map((report) => ({
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
    const aggregateFights = selectAggregateFights(tables.raidFights);
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
    await writeFile(path.join(ROOT, "data/guild/roster.json"), `${JSON.stringify(effectiveRoster, null, 2)}\n`);

    console.log(
      `${drafts.length} jogador(es) novo(s) encontrado(s) no log, adicionados como rascunho em data/guild/roster.json: ${drafts
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
    ...reportContexts.map((ctx) => ({
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

  const runsByReportCode = new Map<string, { date: string; reportCode: string; players: PlayerPerformance[] }>();

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
      resolvePreparationChecklist,
    });

    // Passa pela Normalization Layer explícita mesmo só com a WCL contribuindo
    // hoje — é o ponto único onde Wipefest/WoW Analyzer vão entrar depois,
    // sem precisar mexer de novo na montagem do week-NN.json.
    const players = runPlayers.map(({ playerId, deaths, ...warcraftLogs }) =>
      buildPlayerPerformance({ playerId, deaths, warcraftLogs })
    );

    runsByReportCode.set(ctx.report.code, {
      date: toBrazilDateString(ctx.report.startTime),
      reportCode: ctx.report.code,
      players,
    });
  }

  // Agrupa por semana: com --week tudo vai pro mesmo arquivo; sem, cada run
  // cai na semana da própria data (o cron cobre janelas que podem cruzar a
  // terça de virada, então um lote pode alimentar dois arquivos).
  const runsByWeek = new Map<number, typeof runsByReportCode>();
  for (const [reportCode, run] of runsByReportCode) {
    const runWeek = week ?? weekNumberFromDate(run.date, seasonStart);
    const bucket = runsByWeek.get(runWeek) ?? new Map();
    bucket.set(reportCode, run);
    runsByWeek.set(runWeek, bucket);
  }

  if (runsByWeek.size === 0) {
    console.log("Nenhuma run nova pra gravar.");
    return;
  }

  for (const [runWeek, weekRuns] of [...runsByWeek.entries()].sort(([a], [b]) => a - b)) {
    const weekPadded = String(runWeek).padStart(2, "0");
    const outPath = path.join(ROOT, "data/weekly/performance", `week-${weekPadded}.json`);

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
    for (const [reportCode, run] of weekRuns) {
      runsByKey.set(reportCode, run);
    }

    const runs = [...runsByKey.values()].sort((a, b) => a.date.localeCompare(b.date));
    await writeFile(outPath, `${JSON.stringify({ week: runWeek, runs }, null, 2)}\n`);

    console.log(
      `Gerado ${path.relative(ROOT, outPath)} com ${runs.length} run(s) (${weekRuns.size} atualizada(s)/nova(s) nessa execução).`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
