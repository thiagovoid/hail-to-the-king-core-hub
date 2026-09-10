import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import { RaiderIoProvider } from "../../src/providers/raiderio/RaiderIoProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface RosterPlayer {
  id: string;
  name: string;
  warcraftLogs: { profileUrl: string };
}

interface SeasonConfig {
  config: { guild: string };
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.season) {
    throw new Error("Uso: vite-node check-guild-membership.ts --season=midnight-s2");
  }

  return { season: String(args.season) };
}

async function main() {
  const { season } = parseArgs();

  const seasonConfig: SeasonConfig = JSON.parse(
    await readFile(path.join(ROOT, "data/seasons", season, "config.json"), "utf-8")
  );
  const expectedGuild = seasonConfig.config.guild;

  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));

  const raiderIo = new RaiderIoProvider();
  const collector = new DataCollector({ minDelayMs: 150 });

  console.log(`Checando guilda de ${roster.length} jogador(es) contra "${expectedGuild}" (fonte: Raider.IO)...\n`);

  const mismatches: Array<{ id: string; name: string; guild: string | null }> = [];

  for (const player of roster) {
    let profile;
    try {
      profile = parseWclProfile(player.warcraftLogs.profileUrl);
    } catch {
      console.warn(`${player.name}: URL do WarcraftLogs inválida, pulando.`);
      continue;
    }

    const [outcome] = await collector.run({
      provider: raiderIo,
      context: {
        region: profile.region.toLowerCase(),
        realm: profile.realm,
        name: profile.name,
        fields: ["guild"],
      },
      rawKey: `guild-check/${player.id}`,
    });

    const guild = outcome.status === "ok" ? (outcome.result.raw as { guild?: { name: string } } | null)?.guild : undefined;
    const guildName = guild?.name ?? null;
    const isMatch = guildName === expectedGuild;

    console.log(
      `${player.name.padEnd(16)} realm=${profile.realm.padEnd(12)} guild=${(guildName ?? "—").padEnd(30)} ${isMatch ? "OK" : "DIVERGE"}`
    );

    if (!isMatch) {
      mismatches.push({ id: player.id, name: player.name, guild: guildName });
    }
  }

  console.log("");
  if (mismatches.length === 0) {
    console.log("Nenhuma divergência — todo mundo no roster está na guild no Raider.IO agora.");
    return;
  }

  console.log(`${mismatches.length} divergência(s) encontrada(s):`);
  for (const m of mismatches) {
    console.log(`  - ${m.name} (${m.id}): ${m.guild ?? "sem guild (ou Raider.IO não crawleou recentemente)"}`);
  }
  console.log(
    "\nAtenção: personagens marcados como \"alt\" podem ser de gente que já é membro por outro personagem — confira antes de remover do roster."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
