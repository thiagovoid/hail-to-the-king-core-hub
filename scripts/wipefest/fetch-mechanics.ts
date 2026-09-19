import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WipefestApiProvider, fetchWipefestReport } from "../../src/providers/wipefest/WipefestApiProvider";
import { buildFightMechanics, buildFightPreparation } from "../../src/providers/wipefest/insights";
import {
  aggregateNightMechanics,
  aggregateNightPreparation,
  combinePreparation,
} from "../../src/providers/wipefest/normalizeMechanics";
import { computeWeekNumber } from "../../src/normalization/buildSeasonProgression";
import { DataCollector } from "../../src/services/DataCollector";
import { loadRaw, saveRaw } from "../../src/services/RawStorage";
import type { WipefestApiReport } from "../../src/providers/wipefest/WipefestApiProvider";

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
    // Mesma ideia do coletor da WCL: o que a Wipefest disse sobre uma noite
    // que já acabou não muda, e reprocessar não pode custar uma ida à API por
    // try. Ver DataCollector.reuseArchived.
    reuse: Boolean(args.reuse),
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
  const { week: weekArg, season, reuse } = parseArgs();
  const collector = new DataCollector();
  if (reuse) {
    collector.reuseArchivedFiles();
    console.log("Modo --reuse: lendo o arquivo da Wipefest, sem ir à API pelo que já existe.");
  }
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

    const CHAVE_DO_REPORT = `${run.reportCode}/report`;
    const arquivado = reuse ? await loadRaw<WipefestApiReport>("wipefest-api", CHAVE_DO_REPORT) : null;
    const report = arquivado ?? (await fetchWipefestReport(run.reportCode));
    if (!arquivado) await saveRaw("wipefest-api", CHAVE_DO_REPORT, report);
    // boss 0 = trash; a própria API separa.
    const fights = (report.fights ?? []).filter((fight) => fight.boss > 0);
    console.log(`  ${fights.length} try(s) de raid.`);

    const porFight = [];
    const preparacaoPorFight: Array<{ players: ReturnType<typeof buildFightPreparation> }> = [];
    for (const fight of fights) {
      try {
        const [saida] = await collector.run({
          provider,
          context: { reportCode: run.reportCode, fightId: fight.id },
          rawKey: `${run.reportCode}/fight-${fight.id}`,
        });
        if (saida.status === "error") throw new Error(saida.error);
        const resposta = saida.result;
        porFight.push({
          boss: bosses[fight.boss] ?? fight.name,
          kill: fight.kill,
          players: buildFightMechanics(resposta.raw),
        });
        preparacaoPorFight.push({ players: buildFightPreparation(resposta.raw) });
      } catch (error) {
        console.warn(`  fight ${fight.id} falhou: ${error instanceof Error ? error.message : error}`);
      }
    }

    const agregado = aggregateNightMechanics(porFight);
    const consumiveis = aggregateNightPreparation(preparacaoPorFight);
    let gravados = 0;

    for (const [nome, resumo] of Object.entries(agregado)) {
      const playerId = porNome.get(nome.toLowerCase());
      if (!playerId) continue;

      const existente = run.players.find((player) => player.playerId === playerId);
      if (!existente) continue;

      // Guarda em quantas trys a média foi calculada: quando um fight falha
      // na API (acontece), a média sai de menos trys e sem isto ninguém
      // saberia.
      existente.mechanics = { errors: resumo.errors, tries: resumo.tries };

      // Consumíveis vêm do Wipefest e se juntam à preparação de gear que o
      // fetch-performance já calculou. Era a lacuna que a WarcraftLogs não
      // fechava: o combatantInfo dos logs do core vem sem aura nenhuma.
      const doWipefest = consumiveis[nome];
      if (doWipefest) {
        /**
         * A base é SEMPRE a nota de gear, nunca o que está gravado.
         *
         * `preparation` já é o resultado de uma combinação anterior, e
         * recombiná-lo empurrava o número a cada execução: rodar este script
         * duas vezes na mesma semana levava o voidwar de 69 pra 57 sem nada
         * ter mudado no log. No fluxo do CI passava batido porque a coleta da
         * WCL roda antes e regrava a nota de gear — mas `wipefest:build`
         * roda sozinho, direto na armadilha.
         */
        const gear =
          (existente.preparationGear as number | undefined) ??
          (existente.preparation as number | undefined);
        existente.preparationGear = gear;

        const combinada = combinePreparation(
          { score: gear, checks: existente.preparationChecks as number | undefined },
          { score: doWipefest.score, itens: doWipefest.itens }
        );
        if (combinada !== undefined) existente.preparation = combinada;

        // Idem: o que falta de gear já está gravado, e concatenar de novo
        // só funciona por causa do Set. Refazer da base é mais honesto.
        const faltandoGear = ((existente.preparationMissingGear as string[] | undefined) ??
          (existente.preparationMissing as string[]) ??
          []);
        existente.preparationMissingGear = faltandoGear;

        const faltando = [...faltandoGear, ...doWipefest.missing];
        if (faltando.length > 0) existente.preparationMissing = [...new Set(faltando)];
      }
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
