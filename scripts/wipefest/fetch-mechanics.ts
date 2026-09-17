import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WipefestApiProvider, fetchWipefestReport } from "../../src/providers/wipefest/WipefestApiProvider";
import { buildFightMechanics } from "../../src/providers/wipefest/insights";
import { aggregateNightMechanics } from "../../src/providers/wipefest/normalizeMechanics";
import { computeWeekNumber } from "../../src/normalization/buildSeasonProgression";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface RosterPlayer {
  id: string;
  warcraftLogs: { profileUrl: string };
}

interface WeekFile {
  runs: Array<{
    date: string;
    reportCode?: string;
    players: Array<{ playerId: string; [key: string]: unknown }>;
  }>;
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  // --week é opcional: sem ele, a semana sai do raidWeekAnchor, igual ao
  // fetch-performance. É o que permite rodar no cron, que não passa input.
  return {
    week: args.week ? Number(args.week) : undefined,
    season: String(args.season ?? "midnight-s2"),
  };
}

/** O id do roster vem do nome do personagem na URL da WCL. */
function characterName(profileUrl: string): string {
  const match = profileUrl.match(/character\/[a-z]+\/[a-z0-9-]+\/(.+)$/i);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Coleta os erros mecânicos de cada noite pela API do Wipefest.
 *
 * Roda depois do fetch-performance, sobre o mesmo `week-NN.json`: precisa dos
 * `reportCode` que ele gravou. Não usa credencial nem navegador — a API do
 * Wipefest é pública e já devolve a curadoria, a direção e a contagem.
 *
 * **Todas as trys da noite**, kill ou wipe: é onde o erro mecânico acontece,
 * e medir só o kill esconderia justamente a progressão.
 */
async function main() {
  const { week: weekArg, season } = parseArgs();
  const seasonDir = path.join(ROOT, "data/seasons", season);
  const config = JSON.parse(await readFile(path.join(seasonDir, "config.json"), "utf-8"));
  const week = weekArg ?? computeWeekNumber(config.config.raidWeekAnchor, Date.now());
  console.log(`Semana ${week}${weekArg ? "" : " (calculada a partir de raidWeekAnchor)"}.`);
  const weekPadded = String(week).padStart(2, "0");
  const filePath = path.join(ROOT, "data/weekly/performance", `week-${weekPadded}.json`);

  const weekData: WeekFile = JSON.parse(await readFile(filePath, "utf-8"));
  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));
  const bosses: Record<number, string> = {};

  for (const boss of [...(config.bossesHeroic ?? []), ...(config.bossesNormal ?? [])]) {
    if (boss.encounterID) bosses[boss.encounterID] = boss.name;
  }

  // Nome do personagem -> id do roster. O Wipefest responde por nome.
  const porNome = new Map<string, string>();
  for (const player of roster) {
    const nome = characterName(player.warcraftLogs.profileUrl);
    if (nome) porNome.set(nome.toLowerCase(), player.id);
  }

  const provider = new WipefestApiProvider();
  let runsAtualizadas = 0;

  for (const run of weekData.runs) {
    if (!run.reportCode) {
      console.log(`Pulando ${run.date}: sem reportCode.`);
      continue;
    }

    console.log(`Run ${run.date} (${run.reportCode})...`);

    const report = await fetchWipefestReport(run.reportCode);
    // boss 0 = trash; a própria API separa.
    const fights = (report.fights ?? []).filter((fight) => fight.boss > 0);
    console.log(`  ${fights.length} try(s) de raid.`);

    const porFight = [];
    for (const fight of fights) {
      try {
        const resposta = await provider.fetch({ reportCode: run.reportCode, fightId: fight.id });
        porFight.push({
          boss: bosses[fight.boss] ?? fight.name,
          kill: fight.kill,
          players: buildFightMechanics(resposta.raw),
        });
      } catch (error) {
        console.warn(`  fight ${fight.id} falhou: ${error instanceof Error ? error.message : error}`);
      }
    }

    const agregado = aggregateNightMechanics(porFight);
    let gravados = 0;

    for (const [nome, resumo] of Object.entries(agregado)) {
      const playerId = porNome.get(nome.toLowerCase());
      if (!playerId) continue;

      const existente = run.players.find((player) => player.playerId === playerId);
      if (!existente) continue;

      existente.mechanics = { errors: resumo.errors };
      if (resumo.byMechanic.length > 0) existente.mechanicsDetail = resumo.byMechanic;
      gravados++;
    }

    console.log(`  ${gravados} jogador(es) com erros mecânicos gravados.`);
    runsAtualizadas++;
  }

  if (runsAtualizadas === 0) {
    console.log("Nenhuma run processada — arquivo não foi tocado.");
    return;
  }

  await writeFile(filePath, `${JSON.stringify(weekData, null, 2)}\n`);
  console.log(`\n${path.relative(ROOT, filePath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
