import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclPlayerDetail } from "../../src/providers/warcraftlogs/normalize";

// Raid da season atual. Mesmo valor de fetch-performance.ts.
const RAID_ZONE_ID = 53;

/**
 * Diagnóstico: como a WCL descreve o papel de cada jogador num report.
 *
 * Existe porque não dá pra responder isso de fora — o site exige verificação
 * anti-bot e as credenciais da API só existem como secret no GitHub. Então
 * este script roda no CI e imprime a estrutura crua.
 *
 * A pergunta que ele responde: quando alguém joga umas trys de dps e outras
 * de healer na mesma noite, isso aparece como specs múltiplas no mesmo
 * jogador, como presença em mais de um balde de papel, ou não aparece?
 *
 * Uso: npm run wcl:inspect-roles -- --report=AbC123
 */
function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  const report = args.report ? String(args.report) : undefined;
  if (!report) throw new Error("Informe --report=<codigo>");
  return { report, filtro: args.player ? String(args.player).toLowerCase() : undefined };
}

async function main() {
  const { report, filtro } = parseArgs();
  const wcl = new WarcraftLogsProvider();

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);
  const fights = await wcl.fetchReportFights(report);
  const raidFights = fights.filter((fight) => validEncounterIds.has(fight.encounterID));

  console.log(`Report ${report}: ${fights.length} fight(s), ${raidFights.length} de raid.`);

  // 1) Visão agregada da noite — é a que buildRunPlayers usa hoje.
  const tables = await wcl.fetchFightTables(report, raidFights.map((fight) => fight.id));
  const playerDetails = (tables.summary.data.playerDetails ?? {}) as Record<string, WclPlayerDetail[]>;

  console.log(`\n=== AGREGADO DA NOITE — baldes: ${Object.keys(playerDetails).join(", ") || "(nenhum)"} ===`);

  const baldesPorJogador = new Map<string, { baldes: string[]; specs: string[] }>();
  for (const [balde, membros] of Object.entries(playerDetails)) {
    for (const membro of membros ?? []) {
      const atual = baldesPorJogador.get(membro.name) ?? { baldes: [], specs: [] };
      atual.baldes.push(balde);
      for (const spec of membro.specs ?? []) {
        if (!atual.specs.includes(spec.name)) atual.specs.push(spec.name);
      }
      baldesPorJogador.set(membro.name, atual);
    }
  }

  for (const [nome, info] of [...baldesPorJogador].sort()) {
    if (filtro && !nome.toLowerCase().includes(filtro)) continue;
    const marca = info.baldes.length > 1 || info.specs.length > 1 ? "  <<< MULTIPLO" : "";
    console.log(`  ${nome.padEnd(16)} baldes=[${info.baldes.join(",")}]  specs=[${info.specs.join(",")}]${marca}`);
  }

  // 2) Fight a fight — mostra se o papel muda de try pra try.
  console.log(`\n=== FIGHT A FIGHT (só quem bate no filtro) ===`);
  for (const fight of raidFights) {
    const t = await wcl.fetchFightTables(report, [fight.id]);
    const detalhes = (t.summary.data.playerDetails ?? {}) as Record<string, WclPlayerDetail[]>;
    for (const [balde, membros] of Object.entries(detalhes)) {
      for (const membro of membros ?? []) {
        if (filtro && !membro.name.toLowerCase().includes(filtro)) continue;
        const specs = (membro.specs ?? []).map((s) => s.name).join(",");
        console.log(`  fight ${String(fight.id).padStart(3)} (enc ${fight.encounterID}, kill=${fight.kill})  ${membro.name} -> balde=${balde} specs=[${specs}]`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
