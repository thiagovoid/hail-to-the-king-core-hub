/**
 * Sonda: a tabela de DamageDone traz a quebra por habilidade, com guid?
 *
 * Existe porque a média de "cooldowns ofensivos" deixa uma habilidade
 * situacional definir a nota — um gap closer que causa dano incidental
 * (Feral Lunge, 8%) afundou um jogador com 97% de uptime. Se a tabela disser
 * quanto dano cada habilidade representa, dá pra descartar as irrelevantes
 * sem curadoria manual por spec.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";

const { reportData } = await wclGraphql<{
  reportData: { report: { fights: Array<{ id: number; encounterID: number }>; table?: unknown } | null };
}>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID } } }
  }`,
  { code }
);

const ids = (reportData.report?.fights ?? []).filter((f) => f.encounterID > 0).map((f) => f.id);

const dd = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
  `query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { table(fightIDs: $fightIDs, dataType: DamageDone) } }
  }`,
  { code, fightIDs: ids }
);

const entries = ((dd.reportData.report?.table as { data?: { entries?: unknown[] } })?.data?.entries ??
  []) as Array<Record<string, unknown>>;

console.log(`DamageDone: ${entries.length} jogadores`);
console.log("campos do jogador:", Object.keys(entries[0] ?? {}).join(", "));

const primeiro = entries[0] as { name?: string; total?: number; abilities?: Array<Record<string, unknown>> };
console.log(`\njogador de amostra: ${primeiro?.name} (total ${primeiro?.total})`);
console.log("campos de uma habilidade:", Object.keys(primeiro?.abilities?.[0] ?? {}).join(", "));

console.log("\nhabilidades e participacao no dano:");
for (const hab of (primeiro?.abilities ?? []).slice(0, 15)) {
  const parte = ((hab.total as number) / (primeiro?.total ?? 1)) * 100;
  console.log(`  guid ${String(hab.guid ?? "-").padEnd(8)} ${String(hab.name).padEnd(28)} ${parte.toFixed(2)}%`);
}
