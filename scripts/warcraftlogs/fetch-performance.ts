import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import { loadRaw, saveRaw } from "../../src/services/RawStorage";
import type { DataProvider } from "../../src/providers/types";
import { RaiderIoProvider } from "../../src/providers/raiderio/RaiderIoProvider";
import { buildPlayerPerformance } from "../../src/normalization/buildPlayerPerformance";
import {
  buildParseByPlayer,
  type WclReportRankings,
} from "../../src/providers/warcraftlogs/reportRankings";
import {
  buildCooldownUsage,
  ehUso,
  buildDamageShares,
  type CooldownsDoJogador,
  type EventoDeCast,
} from "../../src/providers/warcraftlogs/cooldownUsage";
import {
  CATALOGO_VAZIO,
  catalogToMap,
  mergeCatalog,
  spellsFaltando,
  type CooldownCatalogFile,
} from "../../src/providers/wowhead/cooldownCatalog";
import { fetchSpellCooldowns } from "../../src/providers/wowhead/spellTooltip";
import type { DanoRecebido } from "../../src/normalization/buildDefense";
import { RECARGA_DAS_INTERRUPCOES } from "../../src/normalization/buildAjudar";
import {
  buildNightDetail,
  buildTrashShare,
  type DetalheDaNoite,
} from "../../src/normalization/buildNightDetail";
import { buildUtility, type UtilidadeDoJogador } from "../../src/normalization/buildUtility";
import { buildBossKills, type BossMorto } from "../../src/providers/warcraftlogs/bossKills";
import type { PreparationChecklist } from "../../src/providers/warcraftlogs/preparation";
import {
  buildChecklistFromReference,
  specKey,
  type PreparationReference,
} from "../../src/providers/warcraftlogs/preparationReference";
import type { PlayerPerformance } from "../../src/types/performance";
import {
  WarcraftLogsProvider,
  type WarcraftLogsRankingContext,
  type WarcraftLogsRawRankings,
  type WclReportRef,
  type EventoDeUtilidade,
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
  type WclFight,
  type WclPlayerDetail,
  type WclProfile,
} from "../../src/providers/warcraftlogs/normalize";
import {
  computeWeekNumber,
  updateBossProgression,
  updateRecentLogs,
  type SeasonConfigFile,
} from "../../src/normalization/buildSeasonProgression";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const GUILD_NAME = "Hail to the King";
const GUILD_SERVER_SLUG = "nemesis";
const GUILD_SERVER_REGION = "US";

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso
const SEASON_SLUG = "midnight-s2";

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
  week?: number;
  days: number;
  start?: number;
  end?: number;
  extraReportCodes: string[];
  discoverByCharacter: boolean;
  includeGuildReports: boolean;
  /**
   * Reconstruir a partir do que já está arquivado, sem tocar na rede.
   *
   * É o que separa recalcular de recoletar: regra nova sobre noite antiga
   * não precisa de uma única chamada externa. Relatório sem arquivo ainda é
   * buscado — senão uma noite nova nunca entraria.
   */
  reuse: boolean;
}

function parseArgs(): Args {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  return {
    // Sem --week: calculado sozinho a partir de raidWeekAnchor (ver
    // computeWeekNumber) — permite rodar num cron sem input manual.
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
    // Desligado por padrão: busca por guild pega qualquer report marcado com
    // a guild, mesmo de gente que não é do core (pug, grupo social etc.) —
    // decisão do projeto é confiar só no upload pessoal do Thiago
    // (WCL_UPLOADER_USER_IDS). Ligar manualmente só em modo investigação.
    includeGuildReports: Boolean(args["include-guild-reports"]),
    reuse: Boolean(args.reuse),
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
  type: "main" | "alt" | "replace";
  pertenceA?: string | null;
  status: "trial" | "member" | "veteran" | "inactive";
  discord: string | null;
  avatar: string | null;
  raiderIo: { io: null; bestDungeon: null; highestKey: null; realmRank: null; profileUrl: string };
  warcraftLogs: { avgParse: null; bestParse: null; attendance: null; profileUrl: string };
}

/**
 * Personagens que aparecem nos logs mas não entram no roster.
 *
 * Sem isto, quem foi removido à mão volta como rascunho na próxima coleta —
 * aconteceu ao recoletar noites antigas, que trouxeram de volta os quatro
 * personagens que a limpeza de roster tinha removido.
 */
async function loadRosterExclusions(): Promise<Set<string>> {
  try {
    const raw = await readFile(path.join(ROOT, "data/guild/roster-exclusions.json"), "utf-8");
    const nomes: string[] = JSON.parse(raw).nomes ?? [];
    return new Set(nomes.map((nome) => nome.toLowerCase()));
  } catch {
    return new Set();
  }
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
  roster: RosterPlayer[]
): Promise<((playerId: string) => PreparationChecklist | undefined) | undefined> {
  let reference: PreparationReference;
  try {
    const raw = await readFile(path.join(ROOT, "data/seasons", SEASON_SLUG, "preparation-reference.json"), "utf-8");
    reference = JSON.parse(raw);
  } catch {
    console.warn(
      "Sem preparation-reference.json — a nota de Preparação não será calculada. Rode 'npm run wowhead:fetch-preparation'."
    );
    return undefined;
  }

  const byPlayer = new Map<string, PreparationChecklist>();
  const missingSpecs: string[] = [];

  for (const player of roster) {
    const entry = reference.specs[specKey(player.class, player.spec)];
    if (!entry) {
      missingSpecs.push(`${player.name} (${player.class} / ${player.spec})`);
      continue;
    }

    const { checklist } = buildChecklistFromReference(entry);
    byPlayer.set(player.id, checklist);
  }

  if (missingSpecs.length > 0) {
    console.warn(
      `Sem recomendação do Wowhead pra ${missingSpecs.length} jogador(es) — ficam sem nota de Preparação:\n  ${missingSpecs.join("\n  ")}`
    );
  }
  if (byPlayer.size === 0) return undefined;

  console.log(`Preparação: checklist montado pra ${byPlayer.size} de ${roster.length} jogador(es).`);
  return (playerId) => byPlayer.get(playerId);
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

/**
 * Um report pode cair no cálculo automático de semana de uma janela larga
 * mesmo já pertencendo a outra week-NN.json (ex: report de terça sendo
 * redescoberto junto com o de quinta da semana seguinte). Sem essa checagem,
 * a mesma noite de raid contaria dobrado nas médias do core.
 */
async function findReportCodesInOtherWeeks(performanceDir: string, currentFileName: string): Promise<Set<string>> {
  const codes = new Set<string>();
  let files: string[];
  try {
    files = (await readdir(performanceDir)).filter(
      (file) => /^week-\d+\.json$/.test(file) && file !== currentFileName
    );
  } catch {
    return codes;
  }

  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(performanceDir, file), "utf-8")) as {
        runs?: Array<{ reportCode?: string }>;
      };
      for (const run of raw.runs ?? []) {
        if (run.reportCode) codes.add(run.reportCode);
      }
    } catch {
      // Arquivo ilegível não deveria acontecer, mas não vale travar o
      // script inteiro por causa disso — só não conta pra dedup.
    }
  }

  return codes;
}

async function main() {
  const { week: weekArg, days, start, end, extraReportCodes, discoverByCharacter, includeGuildReports, reuse } = parseArgs();

  if (reuse) {
    collector.reuseArchivedFiles();
    console.log(
      "Modo --reuse: reconstruindo do arquivo bruto. Só vai à WCL por relatório sem arquivo.\n"
    );
  }

  const roster = await loadRoster();

  /**
   * Meta de sim do Raidbots por jogador — base da dimensão Entregar.
   *
   * Vai junto com a noite em vez de ser lida do roster na hora de exibir: o
   * sim sobe conforme a pessoa se equipa, e comparar o dano de agosto com o
   * sim de setembro diria que ela piorou quando ela melhorou.
   */
  const simDeDpsPorJogador = new Map<string, number>();
  for (const jogador of roster) {
    const alvo = (jogador as { performanceGoals?: { dps?: { target?: number } } }).performanceGoals
      ?.dps?.target;
    if (typeof alvo === "number" && alvo > 0) simDeDpsPorJogador.set(jogador.id, alvo);
  }
  const resolvePreparationChecklist = await loadPreparationResolver(roster);

  const seasonPath = path.join(ROOT, "data/seasons", SEASON_SLUG, "config.json");
  const season: SeasonConfigFile = JSON.parse(await readFile(seasonPath, "utf-8"));

  const endTime = end ?? Date.now();
  const startTime = start ?? endTime - days * 24 * 60 * 60 * 1000;
  const week = weekArg ?? computeWeekNumber(season.config.raidWeekAnchor, endTime);

  console.log(`Buscando reports entre ${new Date(startTime).toISOString()} e ${new Date(endTime).toISOString()}...`);
  if (weekArg === undefined) {
    console.log(`--week não informado, calculado automaticamente: semana ${week}.`);
  }

  /**
   * Os encontros do tier. Muda uma vez por temporada, então fica arquivado —
   * sem isso, `--reuse` ia à rede antes mesmo de chegar no bruto das noites,
   * e a promessa de recalcular sem rede não se cumpria.
   */
  const CHAVE_DOS_ENCONTROS = `_zona/${RAID_ZONE_ID}-encontros`;
  const encontrosArquivados = reuse
    ? await loadRaw<number[]>(wcl.name, CHAVE_DOS_ENCONTROS)
    : null;

  const validEncounterIds = encontrosArquivados
    ? new Set(encontrosArquivados)
    : await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);

  if (!encontrosArquivados) {
    await saveRaw(wcl.name, CHAVE_DOS_ENCONTROS, [...validEncounterIds]);
  }

  /**
   * Descoberta de relatório é ida à rede que o `--reuse` não precisa fazer
   * quando os códigos vieram na mão: reconstruir a semana 5 não depende de
   * perguntar à WCL quais logs existem, e sim do bruto que já está no disco.
   */
  const pulaDescoberta = reuse && extraReportCodes.length > 0;

  if (pulaDescoberta) {
    console.log(`Descoberta pulada: ${extraReportCodes.length} relatório(s) informado(s) na mão.`);
  }

  const guildId = includeGuildReports && !pulaDescoberta
    ? await wcl.resolveGuildId(GUILD_NAME, GUILD_SERVER_SLUG, GUILD_SERVER_REGION)
    : 0;

  const guildReports = includeGuildReports && !pulaDescoberta
    ? await wcl.fetchGuildReports(guildId, startTime, endTime, RAID_ZONE_ID)
    : [];

  const extraReports: WclReportRef[] = [];
  for (const code of extraReportCodes) {
    if (guildReports.some((report) => report.code === code)) continue;

    // No modo reuse o bruto já diz tudo que o meta diria — e o `startTime`
    // real vem de lá, não de uma consulta.
    if (pulaDescoberta) {
      const bruto = await loadRaw<{ reportStartTime?: number }>(wcl.name, code);
      // Sem o epoch do relatório a noite inteira iria pro dia errado do
      // histórico — melhor perguntar à WCL do que datar errado em silêncio.
      if (bruto?.reportStartTime) {
        extraReports.push({ code, startTime: bruto.reportStartTime, zone: { id: RAID_ZONE_ID } });
        continue;
      }
      if (bruto) {
        console.warn(
          `Bruto de ${code} é anterior ao arquivamento da data — buscando o metadado na WCL.`
        );
      }
    }

    const meta = await wcl.fetchReportMeta(code);
    if (meta?.zone?.id === RAID_ZONE_ID) extraReports.push(meta);
  }

  const uploaderUserIds = pulaDescoberta ? [] : getUploaderUserIds();
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
  if (!includeGuildReports) {
    console.log("Busca por guild desligada (padrão) — usando só a conta de upload conhecida. Ver --include-guild-reports.");
  }
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
    /** Todo fight (kill ou wipe) de boss válido, pra detectar progressão. */
    raidFights: WclFight[];
    /** Tabelas das lutas de trash. Null quando o log não gravou trash. */
    trashTables: Awaited<ReturnType<WarcraftLogsProvider["fetchFightTables"]>> | null;
    /** Toda morte da noite, com a try em que aconteceu. */
    deathEvents: Array<{
      fight: number;
      targetID: number;
      timestamp: number;
      /** O que deu o golpe final — dá causa à morte, não só hora. */
      killingAbilityGameID?: number;
    }>;
    /** Dano por ator em cada try, como pares (o arquivo bruto não guarda Map). */
    damagePerFight: Array<{ fightId: number; entries: Array<{ actorId: number; total: number }> }>;
    /**
     * O que antes o script buscava por conta própria e nunca era arquivado.
     *
     * Agora tudo vem do MESMO bruto — é o que faz `--reuse` recalcular sem
     * tocar na rede. Relatório arquivado antes desta mudança não tem esses
     * campos, e aí o script busca (ver `garantirDadosDoReport`).
     */
    actorNames: Array<[number, string]>;
    castEvents: EventoDeCast[];
    damageAbilities: Array<{ sourceID: number; abilities: Array<{ name?: string; total?: number }> }>;
    damageTaken: Array<{ id?: number; name?: string; total?: number; totalReduced?: number }>;
    reportRankings: WclReportRankings | null;
    /** Interrupções e dispels da noite. Ver buildUtility. */
    interrupts: EventoDeUtilidade[];
    dispels: EventoDeUtilidade[];
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
    // Todas as trys da noite, não só os kills: agregar apenas kill mascarava
    // os wipes. Ver selectAggregateFights.
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
      raidFights: tables.raidFights,
      // Default vazio: relatório arquivado antes desta coleta existir não
      // tem esses campos, e recoletar tudo de novo não pode ser condição
      // pra build passar.
      trashTables: tables.trashTables ?? null,
      deathEvents: tables.deathEvents ?? [],
      damagePerFight: tables.damagePerFight ?? [],
      actorNames: tables.actorNames ?? [],
      castEvents: tables.castEvents ?? [],
      damageAbilities: tables.damageAbilities ?? [],
      damageTaken: tables.damageTaken ?? [],
      reportRankings: tables.reportRankings ?? null,
      interrupts: tables.interrupts ?? [],
      dispels: tables.dispels ?? [],
    });
  }

  // Jogadores que apareceram numa run mas não estão no roster.json ainda
  // ganham um rascunho de cadastro.
  const knownWclNames = new Set(
    roster.map((player) => parseWclProfile(player.warcraftLogs.profileUrl).name.toLowerCase())
  );
  // A exclusão vem antes do rascunho: quem foi tirado do roster à mão não
  // pode voltar só porque aparece num log recoletado.
  const excluidos = await loadRosterExclusions();
  const newCharacters = [...seenCharacters.values()].filter(
    (character) =>
      !knownWclNames.has(character.name.toLowerCase()) &&
      !excluidos.has(character.name.toLowerCase())
  );

  const ignorados = [...seenCharacters.values()].filter((c) => excluidos.has(c.name.toLowerCase()));
  if (ignorados.length > 0) {
    console.log(`Ignorados por roster-exclusions.json: ${ignorados.map((c) => c.name).join(", ")}`);
  }

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

  // ----- "Atacar corretamente": cooldowns ofensivos -----
  //
  // Precisa de EVENTOS, não de tabela agregada: a tabela de Casts vem
  // truncada em 5 habilidades por jogador e nenhum cooldown aparece nela.
  // São ~53 mil eventos por noite a 14 pontos de API (0,4% do limite por
  // hora) — medido antes de entrar no cron.
  const catalogPath = path.join(ROOT, "data/seasons", SEASON_SLUG, "cooldown-catalog.json");
  let catalogo: CooldownCatalogFile = CATALOGO_VAZIO;
  try {
    catalogo = JSON.parse(await readFile(catalogPath, "utf8")) as CooldownCatalogFile;
  } catch {
    console.log("Catálogo de cooldowns ainda não existe — será criado nesta coleta.");
  }

  const cooldownsPorReport = new Map<string, Map<string, CooldownsDoJogador>>();
  const danoRecebidoPorReport = new Map<string, Map<string, DanoRecebido>>();
  const bossKillsPorReport = new Map<string, Map<string, BossMorto[]>>();
  // Denominador da cobertura de cura: sem ele, "curou muito" e "curou bem"
  // ficam indistinguíveis.
  const danoDoRaidePorReport = new Map<string, number>();
  // A noite try a try, o trash e a spec de cada um. Ver buildNightDetail.
  const noitePorReport = new Map<string, Map<string, DetalheDaNoite>>();
  const trashPorReport = new Map<string, Map<string, number>>();
  const specsPorReport = new Map<string, Map<string, NonNullable<PlayerPerformance["specs"]>>>();
  const utilidadePorReport = new Map<string, Map<string, UtilidadeDoJogador>>();

  for (const ctx of reportContexts) {
    try {
      /**
       * Tudo sai do bruto. O `??` busca na rede só pra relatório arquivado
       * antes desta coleta existir — recoletar tudo de novo não pode ser
       * condição pra build passar.
       */
      const atores = ctx.actorNames.length
        ? new Map(ctx.actorNames)
        : await wcl.fetchActorNames(ctx.report.code);
      const eventos = ctx.castEvents.length
        ? ctx.castEvents
        : await wcl.fetchCastEvents(ctx.report.code, ctx.raidFights);

      // Sem o mapa de atores, os eventos viram números soltos: o sourceID
      // não liga a ninguém e a noite inteira sai sem cooldown, sem erro
      // nenhum. Aconteceu com o log de 09/09 — 73 mil casts e zero
      // jogadores — e passou despercebido porque a nota de Atacar continua
      // saindo (só com o uptime).
      if (atores.size === 0) {
        throw new Error("masterData não devolveu ator nenhum — sem isso não dá pra ligar cast a jogador");
      }

      // Só quem aparece nos eventos: buscar o dano de ator que não lançou
      // nada é ida de rede à toa.
      const atoresComCast = [...new Set(eventos.map((evento) => evento.sourceID))].filter((id) =>
        atores.has(id)
      );
      const danoPorHabilidade = ctx.damageAbilities.length
        ? ctx.damageAbilities
        : await wcl.fetchDamageAbilities(ctx.report.code, ctx.aggregateFightIds, atoresComCast);

      // Toda magia nova do log é consultada uma vez no Wowhead e o veredito
      // fica gravado — inclusive "não é cooldown". Sem esse registro, as
      // ~180 magias de rotação de cada noite seriam reconsultadas toda
      // semana pra chegar sempre à mesma conclusão.
      const faltando = spellsFaltando(catalogo, eventos.map((evento) => evento.abilityGameID));
      if (faltando.length > 0) {
        console.log(`Consultando ${faltando.length} magia(s) nova(s) no Wowhead...`);
        const vereditos = await fetchSpellCooldowns(faltando);
        catalogo = mergeCatalog(catalogo, vereditos, new Date().toISOString());
      }

      // Sem a participação no dano, uma habilidade situacional define a
      // nota: na coleta de 15/09 um jogador com 97% de uptime ficou com 52
      // porque o único "cooldown ofensivo" detectado foi um gap closer.
      // As interrupções entram à mão porque o catálogo do Wowhead corta
      // abaixo de 30s — e Kick tem 15s, Wind Shear 12s. Sem elas, "Ajudar"
      // ficaria sem a utilidade que o core mais usa. Ver buildAjudar.
      const comInterrupcoes = new Map([
        ...catalogToMap(catalogo),
        ...RECARGA_DAS_INTERRUPCOES,
      ]);

      const usos = buildCooldownUsage(
        eventos,
        ctx.raidFights,
        comInterrupcoes,
        buildDamageShares(danoPorHabilidade)
      );

      // Os eventos só trazem sourceID; o roster só conhece nome.
      const porJogador = new Map<string, CooldownsDoJogador>();
      for (const uso of usos) {
        const nome = atores.get(uso.sourceID);
        if (!nome) continue;
        const perfil = rosterProfiles.find((jogador) => sameCharacterName(jogador.profile.name, nome));
        if (perfil) porJogador.set(perfil.id, uso);
      }

      // Dano recebido: a metade informativa de "Defender". Vem da tabela
      // agregada mesmo — aqui só interessa o total por jogador, não a quebra
      // por habilidade, então a truncagem em 5 não atrapalha.
      const recebidoPorJogador = new Map<string, DanoRecebido>();
      const danoRecebido = ctx.damageTaken.length
        ? ctx.damageTaken
        : await wcl.fetchDamageTaken(ctx.report.code, ctx.aggregateFightIds);
      for (const entrada of danoRecebido) {
        if (!entrada.name) continue;
        const perfil = rosterProfiles.find((jogador) =>
          sameCharacterName(jogador.profile.name, entrada.name!)
        );
        if (!perfil) continue;
        recebidoPorJogador.set(perfil.id, {
          total: entrada.total ?? 0,
          totalReduced: entrada.totalReduced ?? 0,
        });
      }
      danoRecebidoPorReport.set(ctx.report.code, recebidoPorJogador);
      danoDoRaidePorReport.set(
        ctx.report.code,
        [...recebidoPorJogador.values()].reduce((soma, dano) => soma + dano.total, 0)
      );

      // Bosses mortos com a pessoa presente. Sai dos MESMOS eventos de cast
      // já baixados: quem lançou algo na try do kill estava nela. Zero
      // requisição a mais.
      // Dificuldade nula existe no dado da WCL e não dá pra contar: sem ela
      // não dá pra dizer se o boss caiu no Normal ou no Heroico, e os dois
      // são kills diferentes.
      const killsDaNoite = ctx.raidFights
        .filter((fight) => fight.kill && fight.difficulty !== null)
        .map((fight) => ({
          difficulty: fight.difficulty as number,
          id: fight.id,
          startTime: fight.startTime,
          endTime: fight.endTime,
          encounterID: fight.encounterID,
        }));

      const killsPorAtor = buildBossKills(eventos, killsDaNoite);
      const killsPorJogador = new Map<string, BossMorto[]>();
      for (const [sourceID, mortos] of killsPorAtor) {
        const nome = atores.get(sourceID);
        if (!nome) continue;
        const perfil = rosterProfiles.find((jogador) => sameCharacterName(jogador.profile.name, nome));
        if (perfil) killsPorJogador.set(perfil.id, mortos);
      }
      bossKillsPorReport.set(ctx.report.code, killsPorJogador);

      /**
       * A noite try a try: presença, ociosidade, mortes por boss, trash.
       *
       * Reaproveita o mapa de atores que os cooldowns já baixaram — a
       * tradução de `actorId` pra id do roster é a mesma.
       */
      const doRoster = (actorId: number): string | undefined => {
        const nome = atores.get(actorId);
        if (!nome) return undefined;
        return rosterProfiles.find((jogador) => sameCharacterName(jogador.profile.name, nome))?.id;
      };

      /**
       * Linha do tempo dos defensivos de cada ator, pra responder se havia
       * defensivo na mão no instante de cada morte.
       *
       * Sem esse cruzamento, "você não usou X" não comunica nada: pode não
       * ter havido o que mitigar. Com ele, a frase vira "você morreu para
       * Gravebound com Anti-Magic Zone pronto", que é acionável.
       */
      const usosDeDefensivo = new Map<number, Map<number, number[]>>();
      for (const evento of eventos) {
        if (!ehUso(evento)) continue;
        if (comInterrupcoes.get(evento.abilityGameID)?.kind !== "defensive") continue;

        const doAtor = usosDeDefensivo.get(evento.sourceID) ?? new Map<number, number[]>();
        doAtor.set(evento.abilityGameID, [
          ...(doAtor.get(evento.abilityGameID) ?? []),
          evento.timestamp,
        ]);
        usosDeDefensivo.set(evento.sourceID, doAtor);
      }

      const defensivosProntos = (actorId: number, quando: number): string[] => {
        const doAtor = usosDeDefensivo.get(actorId);
        if (!doAtor) return [];

        const prontos: string[] = [];
        for (const [spellId, usos] of doAtor) {
          const magia = comInterrupcoes.get(spellId);
          if (!magia) continue;

          // Sem uso anterior, a magia estava inteira desde o começo.
          const ultimo = usos.filter((t) => t <= quando).at(-1);
          if (ultimo === undefined || quando - ultimo >= magia.cooldownMs) prontos.push(magia.name);
        }
        return prontos;
      };

      /** id da habilidade inimiga -> nome, pra morte ter causa e não só hora. */
      const nomeDaHabilidadeInimiga = new Map<number, string>();
      for (const alvo of ctx.damageTaken ?? []) {
        for (const habilidade of (alvo as { abilities?: Array<{ guid: number; name: string }> })
          .abilities ?? []) {
          if (habilidade.guid && habilidade.name) nomeDaHabilidadeInimiga.set(habilidade.guid, habilidade.name);
        }
      }

      const detalhePorAtor = buildNightDetail(
        ctx.raidFights.map((fight) => ({
          id: fight.id,
          encounterID: fight.encounterID,
          // Dificuldade ausente vira 0: luta sem dificuldade não é boss de
          // raide, e agrupar por 0 a mantém separada das que são.
          difficulty: fight.difficulty ?? 0,
          kill: fight.kill,
          durationMs: fight.endTime - fight.startTime,
          endTime: fight.endTime,
          friendlyPlayers: fight.friendlyPlayers ?? [],
        })),
        // A morte vem com o id de quem deu o golpe final; buildNightDetail
        // espera o campo com o nome dele.
        ctx.deathEvents.map((morte) => ({
          ...morte,
          abilityGameID: morte.killingAbilityGameID,
        })),
        new Map(
          ctx.damagePerFight.map((luta) => [
            luta.fightId,
            new Map(luta.entries.map((entrada) => [entrada.actorId, entrada.total])),
          ])
        ),
        // O nome do que matou sai da tabela de dano RECEBIDO pelo raide: é a
        // única fonte no bruto que traduz o id da habilidade inimiga.
        (abilityGameID) => nomeDaHabilidadeInimiga.get(abilityGameID),
        defensivosProntos
      );

      const detalhePorJogador = new Map<string, DetalheDaNoite>();
      for (const [actorId, detalhe] of detalhePorAtor) {
        const id = doRoster(actorId);
        if (id) detalhePorJogador.set(id, detalhe);
      }
      noitePorReport.set(ctx.report.code, detalhePorJogador);

      const sharePorAtor = buildTrashShare(
        new Map(
          (ctx.trashTables?.damage.data.entries ?? [])
            .filter((entrada) => entrada.id !== undefined)
            .map((entrada) => [entrada.id!, entrada.total ?? 0])
        ),
        ctx.trashTables !== null
      );

      if (sharePorAtor) {
        const sharePorJogador = new Map<string, number>();
        // Quem esteve em alguma try e não aparece na tabela do trash fez
        // zero — e zero aqui é o dado, não a ausência dele.
        for (const actorId of detalhePorAtor.keys()) {
          const id = doRoster(actorId);
          if (id) sharePorJogador.set(id, sharePorAtor.get(actorId) ?? 0);
        }
        trashPorReport.set(ctx.report.code, sharePorJogador);
      }

      // Spec e função vêm do `composition` da tabela de resumo — o `specs`
      // do playerDetails volta vazio nos reports reais.
      const specsPorJogador = new Map<string, NonNullable<PlayerPerformance["specs"]>>();
      for (const membro of ctx.fullTables.summary.data.composition ?? []) {
        const perfil = rosterProfiles.find((jogador) =>
          sameCharacterName(jogador.profile.name, membro.name)
        );
        if (!perfil) continue;

        const specs = (membro.specs ?? [])
          .filter((item) => item.role === "tank" || item.role === "healer" || item.role === "dps")
          .map((item) => ({ spec: item.spec, role: item.role as "tank" | "healer" | "dps" }));

        if (specs.length > 0) specsPorJogador.set(perfil.id, specs);
      }
      specsPorReport.set(ctx.report.code, specsPorJogador);

      /**
       * Utilidade. Os dois eventos vêm do bruto; o battle rez sai dos casts
       * que já estão na mão, porque `Resurrects` não existe no enum da WCL.
       */
      const utilPorAtor = buildUtility(ctx.interrupts, ctx.dispels, eventos);
      const utilPorJogador = new Map<string, UtilidadeDoJogador>();
      for (const [actorId, util] of utilPorAtor) {
        const id = doRoster(actorId);
        if (id) utilPorJogador.set(id, util);
      }
      utilidadePorReport.set(ctx.report.code, utilPorJogador);

      cooldownsPorReport.set(ctx.report.code, porJogador);
      console.log(
        `Cooldowns do report ${ctx.report.code}: ${eventos.length} casts, ${porJogador.size} jogador(es) do roster.`
      );

      if (porJogador.size === 0 && usos.length > 0) {
        console.warn(
          `  Nenhum dos ${usos.length} ator(es) com cast casou com o roster. Atores no log: ` +
            [...atores.values()].slice(0, 8).join(", ")
        );
      }
    } catch (error) {
      // Falha aqui não pode derrubar a coleta inteira: sem cooldowns, a
      // nota de Atacar fica só com o uptime, e o resto do log segue.
      console.warn(
        `Falha ao coletar cooldowns do report ${ctx.report.code}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  await writeFile(catalogPath, JSON.stringify(catalogo, null, 2) + "\n", "utf8");
  console.log(
    `Catálogo de cooldowns: ${Object.keys(catalogo.cooldowns).length} cooldown(s), ${catalogo.ignored.length} magia(s) descartada(s).`
  );

  // Percentis calculados pelo próprio relatório — uma chamada por log,
  // contra uma por jogador por encontro do caminho antigo. É o que faz a
  // dimensão de parse sair de "sem dado": o ranking global do personagem
  // não inclui os logs do core.
  const parsePorReport = new Map<string, Awaited<ReturnType<typeof buildParseByPlayer>>>();
  for (const ctx of reportContexts) {
    try {
      const rankings = ctx.reportRankings ?? (await wcl.fetchReportRankings(ctx.report.code));
      const porJogador = buildParseByPlayer(rankings ?? undefined);
      parsePorReport.set(ctx.report.code, porJogador);
      console.log(`Parse do report ${ctx.report.code}: ${porJogador.size} jogador(es) com percentil.`);
    } catch (error) {
      console.warn(`Falha ao buscar parse do report ${ctx.report.code}: ${error instanceof Error ? error.message : error}`);
    }
  }

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
      parseByPlayer: parsePorReport.get(ctx.report.code),
      players: rosterProfiles,
      resolvePreparationChecklist,
      cooldownsByPlayer: cooldownsPorReport.get(ctx.report.code),
      damageTakenByPlayer: danoRecebidoPorReport.get(ctx.report.code),
      bossKillsByPlayer: bossKillsPorReport.get(ctx.report.code),
      nightDetailByPlayer: noitePorReport.get(ctx.report.code),
      trashShareByPlayer: trashPorReport.get(ctx.report.code),
      specsByPlayer: specsPorReport.get(ctx.report.code),
      utilityByPlayer: utilidadePorReport.get(ctx.report.code),
      // A meta de sim vai JUNTO com a noite: o sim sobe conforme a pessoa se
      // equipa, e comparar o dano de agosto com o sim de setembro diria que
      // ela piorou quando ela melhorou.
      simDeDpsPorJogador,
      raidDamageTaken: danoDoRaidePorReport.get(ctx.report.code),
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

  const fileName = `week-${weekPadded}.json`;
  const performanceDir = path.join(ROOT, "data/weekly/performance");
  const outPath = path.join(performanceDir, fileName);

  const codesInOtherWeeks = await findReportCodesInOtherWeeks(performanceDir, fileName);
  for (const code of [...runsByReportCode.keys()]) {
    if (codesInOtherWeeks.has(code)) {
      console.warn(`Report ${code} já pertence a outra week-NN.json — ignorado em ${fileName} pra não contar dobrado.`);
      runsByReportCode.delete(code);
    }
  }

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

  /**
   * Este script REESCREVE o arquivo da semana inteiro e só conhece os campos
   * que ele mesmo produz. Mecânicas e a metade de consumíveis da preparação
   * vêm da Wipefest, por um script separado que roda DEPOIS — rodar só este
   * apaga aqueles campos, em silêncio.
   *
   * Aconteceu três vezes durante o desenvolvimento, e uma delas foi parar no
   * ar: as 113 noites ficaram sem `mechanics`, que pesa 25 em todas as
   * funções, e todo mundo ficou com o Score errado. O aviso é barato perto
   * do estrago.
   */
  const semMecanicas = runs.every((run) =>
    (run.players as PlayerPerformance[]).every((player) => player.mechanics === undefined)
  );

  if (semMecanicas && runs.length > 0) {
    console.warn(
      `\n⚠ Nenhuma run desta semana tem Mecânicas — este script não as produz.\n` +
        `  Rode agora:  npm run wipefest:build -- --week=${week}\n` +
        `  Sem isso, o arquivo fica sem mecânicas e sem os consumíveis da preparação.\n`
    );
  }

  // Progressão de boss + "menu" de logs recentes na home, a partir dos
  // mesmos reports já buscados acima — nenhuma chamada de API extra.
  //
  // TODOS os reports entram, inclusive os já conhecidos. Antes havia um
  // filtro que pulava report já registrado em recentLogs, porque a conta era
  // `pulls +=` e reprocessar somava de novo. Com o placar no pullLog, onde
  // cada report SUBSTITUI a própria entrada, reprocessar é inofensivo — e é
  // o que permite corrigir a história quando um log é recoletado, em vez de
  // congelar o primeiro número que entrou.
  const progressionChanges = updateBossProgression(season, reportContexts);
  const recentLogsChanged = updateRecentLogs(season, reportContexts);

  if (progressionChanges.length > 0 || recentLogsChanged) {
    season.config.lastUpdated = new Date().toISOString();
    await writeFile(seasonPath, `${JSON.stringify(season, null, 2)}\n`);

    if (progressionChanges.length > 0) {
      console.log(`\nProgressão atualizada:\n${progressionChanges.map((c) => `  - ${c}`).join("\n")}`);
    }
    if (recentLogsChanged) {
      console.log(`\n${path.relative(ROOT, seasonPath)} atualizado (recentLogs e/ou progressão).`);
    }
  } else {
    console.log("\nNenhuma mudança de progressão ou log novo pro menu da home.");
  }

  /**
   * Quanto do orçamento da WCL esta execução gastou.
   *
   * A coleta nunca dizia isso, e numa recoleta é justamente o que decide se
   * dá pra soltar a próxima semana em seguida ou se é melhor esperar a hora
   * virar. Estourar o limite no meio deixa metade dos relatórios recoletados
   * e metade não, que é o estado mais chato de diagnosticar.
   *
   * Nunca derruba a execução: é relatório, não etapa. No modo `--reuse` nem
   * é consultado, porque aí não houve ida à rede pra medir.
   */
  if (!reuse) {
    try {
      const limite = await wcl.fetchRateLimitData();
      const sobra = limite.limitPerHour - limite.pointsSpentThisHour;
      console.log(
        `\nOrçamento da WCL: ${Math.round(limite.pointsSpentThisHour)} de ${limite.limitPerHour} ` +
          `pontos gastos nesta hora (${Math.round(sobra)} de sobra, zera em ${Math.round(limite.pointsResetIn / 60)}min).`
      );
      if (sobra < limite.limitPerHour * 0.25) {
        console.warn("AVISO: menos de um quarto do orçamento restante. Espere a hora virar antes da próxima semana.");
      }
    } catch (error) {
      console.warn(`Não deu pra ler o orçamento da WCL: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
