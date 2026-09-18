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
const entries = tabelas.damage.data.entries as unknown as Array<Record<string, unknown>>;

console.log(`entradas na tabela de dano: ${entries.length}`);
console.log(`campos da primeira entrada: ${Object.keys(entries[0] ?? {}).join(", ")}`);

console.log("");
console.log("quantas habilidades cada entrada tem:");
for (const e of entries) {
  const abilities = (e.abilities ?? []) as unknown[];
  const damageAbilities = (e.damageAbilities ?? []) as unknown[];
  console.log(
    `  id ${String(e.id).padEnd(4)} ${String(e.name).padEnd(16)} abilities=${abilities.length} damageAbilities=${damageAbilities.length} total=${e.total}`
  );
  if (abilities.length > 0) console.log(`     amostra: ${JSON.stringify(abilities[0])}`);
  else if (damageAbilities.length > 0) console.log(`     amostra dmgAb: ${JSON.stringify(damageAbilities[0])}`);
}

const shares = buildDamageShares(tabelas.damage.data.entries);
console.log("");
console.log(`buildDamageShares: ${shares.size} jogador(es)`);

const eventos = await wcl.fetchCastEvents(code, fights.slice(0, 2));
const sourceIDs = [...new Set(eventos.map((e) => e.sourceID))].sort((a, b) => a - b);
const emComum = sourceIDs.filter((id) => (shares.get(id)?.size ?? 0) > 0);
console.log(`ids com habilidades cruzadas: ${emComum.length} de ${sourceIDs.length}`);

const alvo = emComum[0] ?? sourceIDs[0];
console.log("");
console.log(`habilidades no dano do ator ${alvo}:`);
for (const [nome, parte] of [...(shares.get(alvo) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${nome.padEnd(32)} ${parte.toFixed(2)}%`);
}
