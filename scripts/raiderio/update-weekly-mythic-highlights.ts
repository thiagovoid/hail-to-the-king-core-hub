import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import { RaiderIoProvider } from "../../src/providers/raiderio/RaiderIoProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";
import type { WeeklyHighlights } from "../../src/types/index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface RosterPlayer {
  id: string;
  name: string;
  warcraftLogs: { profileUrl: string };
}

interface RaiderIoWeeklyRun {
  dungeon: string;
  mythic_level: number;
  completed_at: string;
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.week) {
    throw new Error("Uso: vite-node update-weekly-mythic-highlights.ts --week=4");
  }

  return { week: Number(args.week) };
}

async function loadExisting(outPath: string): Promise<WeeklyHighlights | null> {
  try {
    await access(outPath);
  } catch {
    return null;
  }
  return JSON.parse(await readFile(outPath, "utf-8")) as WeeklyHighlights;
}

async function main() {
  const { week } = parseArgs();

  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));

  const raiderIo = new RaiderIoProvider();
  const collector = new DataCollector({ minDelayMs: 150 });

  console.log(`Buscando a melhor key da semana (M+, reset atual do Raider.IO) de ${roster.length} jogador(es)...`);

  // Uma entrada por jogador: a key mais alta dele nesse reset semanal do
  // Raider.IO (não a nossa numeração de week-NN — esse campo já vem pronto
  // da API, calculado a partir do reset de M+ do jogo, não precisa a gente
  // inferir janela de data).
  const bestPerPlayer: Array<{ player: RosterPlayer; run: RaiderIoWeeklyRun }> = [];

  for (const player of roster) {
    let profile;
    try {
      profile = parseWclProfile(player.warcraftLogs.profileUrl);
    } catch {
      console.warn(`Pulando ${player.name}: URL do WarcraftLogs inválida.`);
      continue;
    }

    const [outcome] = await collector.run({
      provider: raiderIo,
      context: {
        region: profile.region.toLowerCase(),
        realm: profile.realm,
        name: profile.name,
        fields: ["mythic_plus_weekly_highest_level_runs"],
      },
      rawKey: `weekly-mythic/${player.id}`,
    });

    const runs =
      (outcome.status === "ok"
        ? (outcome.result.raw as { mythic_plus_weekly_highest_level_runs?: RaiderIoWeeklyRun[] } | null)
            ?.mythic_plus_weekly_highest_level_runs
        : undefined) ?? [];

    if (runs.length === 0) continue;

    const best = runs.reduce((top, run) => (run.mythic_level > top.mythic_level ? run : top));
    bestPerPlayer.push({ player, run: best });
  }

  bestPerPlayer.sort((a, b) => b.run.mythic_level - a.run.mythic_level);

  if (bestPerPlayer.length === 0) {
    console.log("Ninguém do roster tem key registrada nesse reset semanal ainda — nada pra atualizar.");
    return;
  }

  const outPath = path.join(ROOT, "data/weekly/highlights", `week-${String(week).padStart(2, "0")}.json`);
  const existing = await loadExisting(outPath);

  const topEntry = bestPerPlayer[0];
  const output: WeeklyHighlights = {
    week,
    date: topEntry.run.completed_at,
    // Fora do escopo do M+: precisam de log de raid (WCL), não deste script.
    // Preserva o que já estiver salvo em vez de sobrescrever com null.
    bestDps: existing?.bestDps ?? null,
    bestHps: existing?.bestHps ?? null,
    bestTank: existing?.bestTank ?? null,
    playerOfTheWeek: existing?.playerOfTheWeek ?? null,
    bestKey: {
      player: topEntry.player.name,
      dungeon: topEntry.run.dungeon,
      level: topEntry.run.mythic_level,
    },
    topKeys: bestPerPlayer.slice(0, 5).map(({ run }) => ({
      dungeon: run.dungeon,
      keyLevel: run.mythic_level,
    })),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\nMelhor key: ${topEntry.player.name} — ${topEntry.run.dungeon} +${topEntry.run.mythic_level}`);
  console.log(`${path.relative(ROOT, outPath)} atualizado.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
