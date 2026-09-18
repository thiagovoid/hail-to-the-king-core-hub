/**
 * Sonda: a lista COMPLETA de habilidades de dano de um jogador.
 *
 * A tabela agregada de DamageDone trunca em 5 habilidades por jogador — o
 * mesmo que acontece na tabela de Casts. Com só o top 5, o filtro de
 * relevância não enxerga as habilidades situacionais, que são justamente as
 * que ele existe pra descartar.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const { reportData } = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID } } }
  }`,
  { code }
);
const ids = reportData.report.fights.filter((f) => f.encounterID > 0).map((f) => f.id);

const antes = await wcl.fetchRateLimitData();

// Gunst (12) é o caso que motivou tudo: o único "cooldown ofensivo"
// detectado pra ele foi um gap closer. Nerlock (11) tem Storm Bolt.
for (const [sourceID, nome] of [[12, "Gunst"], [11, "Nerlock"]] as Array<[number, string]>) {
  const data = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
    `query($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
      reportData { report(code: $code) {
        table(fightIDs: $fightIDs, dataType: DamageDone, sourceID: $sourceID, viewBy: Ability)
      } }
    }`,
    { code, fightIDs: ids, sourceID }
  );

  const tabela = (data.reportData.report?.table ?? {}) as { data?: { entries?: unknown[] } };
  const entries = (tabela.data?.entries ?? []) as Array<Record<string, unknown>>;
  const total = entries.reduce((soma, e) => soma + ((e.total as number) ?? 0), 0);

  console.log("");
  console.log(`${nome} (sourceID ${sourceID}): ${entries.length} habilidade(s), total ${total}`);
  console.log(`  campos: ${Object.keys(entries[0] ?? {}).join(", ")}`);
  for (const e of entries.sort((a, b) => ((b.total as number) ?? 0) - ((a.total as number) ?? 0))) {
    const parte = (((e.total as number) ?? 0) / total) * 100;
    console.log(`  ${String(e.name).padEnd(30)} ${parte.toFixed(2).padStart(6)}%`);
  }
}

const depois = await wcl.fetchRateLimitData();
console.log("");
console.log(`custo de 2 jogadores: ${(depois.pointsSpentThisHour - antes.pointsSpentThisHour).toFixed(2)} pontos`);
