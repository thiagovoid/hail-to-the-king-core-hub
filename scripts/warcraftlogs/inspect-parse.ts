import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";
import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const RAID_ZONE_ID = 53;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * Diagnóstico: por que o parse parou de ser coletado.
 *
 * `encounterRankings` sem `difficulty` devolve os ranks da maior dificuldade
 * que o personagem tiver — que pode não ser a do log que estamos medindo.
 * Como o coletor filtra por reportCode, tudo é descartado e a dimensão de
 * maior peso fica sem dado.
 *
 * Isto compara: sem difficulty, com Normal (3) e com Heroico (4).
 *
 * Uso: npm run wcl:inspect-parse -- --report=AbC123
 */
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  ) as Record<string, string | boolean>;

  const reportCode = String(args.report ?? "");
  if (!reportCode) throw new Error("Uso: --report=<codigo>");

  const wcl = new WarcraftLogsProvider();
  const roster = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);
  const fights = await wcl.fetchReportFights(reportCode);
  const kills = fights.filter((f) => validEncounterIds.has(f.encounterID) && f.kill);

  // A WCL só rankeia log público: se estes forem unlisted/private, parse é
  // impossível a partir deles, e o problema não está na nossa query.
  const meta = await wclGraphql<{ reportData: { report: { visibility?: string; guild?: { name?: string } | null } | null } }>(
    `query($code: String!) { reportData { report(code: $code) { visibility guild { name } } } }`,
    { code: reportCode }
  ).catch((e) => { console.log(`  (visibility indisponível: ${e instanceof Error ? e.message.slice(0,80) : e})`); return null; });

  console.log(`Report ${reportCode}: ${kills.length} kill(s) de raid.`);
  if (meta) console.log(`  visibilidade=${meta.reportData.report?.visibility ?? "?"}  guild=${meta.reportData.report?.guild?.name ?? "(nenhuma)"}`);
  for (const k of kills) {
    console.log(`  fight ${k.id}  encounter ${k.encounterID}  dificuldade ${k.difficulty}`);
  }

  if (kills.length === 0) return;

  const alvo = kills[0];
  const jogador = roster.find((p: { warcraftLogs: { profileUrl: string } }) => p.warcraftLogs.profileUrl);
  const profile = parseWclProfile(jogador.warcraftLogs.profileUrl);

  console.log(`\nTestando ${profile.name} no encontro ${alvo.encounterID}:`);

  for (const dificuldade of [undefined, 3, 4, 5]) {
    const data = await wclGraphql<{
      characterData: { character: { encounterRankings?: { difficulty?: number; ranks?: unknown[] } } | null };
    }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!, $encounterID: Int!, $metric: CharacterRankingMetricType, $difficulty: Int) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            encounterRankings(encounterID: $encounterID, metric: $metric, difficulty: $difficulty)
          }
        }
      }`,
      {
        name: profile.name,
        serverSlug: profile.realm,
        serverRegion: profile.region,
        encounterID: alvo.encounterID,
        metric: "dps",
        difficulty: dificuldade ?? null,
      }
    );

    const r = data.characterData.character?.encounterRankings;
    const ranks = (r?.ranks ?? []) as Array<{ report?: { code?: string; fightID?: number }; rankPercent?: number }>;
    const doNossoReport = ranks.filter((x) => x.report?.code === reportCode);

    console.log(
      `  difficulty=${dificuldade ?? "(omitido)"}  ranks=${ranks.length}` +
        `  deste report=${doNossoReport.length}` +
        (doNossoReport[0] ? `  parse=${Math.round(doNossoReport[0].rankPercent ?? 0)}` : "")
    );
    // De onde vieram os ranks que existem: se for um log nosso, o ranking
    // funciona e o problema é outro.
    for (const r of ranks.slice(0, 3)) {
      console.log(`      rank em report=${r.report?.code} fight=${r.report?.fightID} parse=${Math.round(r.rankPercent ?? 0)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
