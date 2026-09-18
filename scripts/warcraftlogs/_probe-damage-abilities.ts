/**
 * Sonda: o cruzamento entre a tabela de dano e os eventos de cast está
 * casando? Duas coletas seguidas saíram idênticas depois de mudar o filtro,
 * o que só acontece se nada estiver casando.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { buildDamageShares } from "../../src/providers/warcraftlogs/cooldownUsage";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const { reportData } = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID kill startTime endTime } } }
  }`,
  { code }
);
const fights = reportData.report.fights.filter((f) => f.encounterID > 0);

const tabelas = await wcl.fetchFightTables(code, fights.map((f) => f.id));
const entries = tabelas.damage.data.entries;

console.log(`entradas na tabela de dano: ${entries.length}`);
console.log(`campos da primeira entrada: ${Object.keys(entries[0] ?? {}).join(", ")}`);

const shares = buildDamageShares(entries);
console.log(`buildDamageShares: ${shares.size} jogador(es)`);
console.log(`ids da tabela de dano: ${[...shares.keys()].slice(0, 20).join(", ")}`);

const eventos = await wcl.fetchCastEvents(code, fights.slice(0, 2));
const sourceIDs = [...new Set(eventos.map((e) => e.sourceID))].sort((a, b) => a - b);
console.log(`sourceIDs nos eventos: ${sourceIDs.slice(0, 25).join(", ")}`);

const emComum = sourceIDs.filter((id) => shares.has(id));
console.log(`ids em comum: ${emComum.length} de ${sourceIDs.length}`);

const alvo = emComum[0] ?? sourceIDs[0];
console.log(`\nhabilidades na tabela de dano do ator ${alvo}:`);
for (const [nome, parte] of [...(shares.get(alvo) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${nome.padEnd(32)} ${parte.toFixed(2)}%`);
}
