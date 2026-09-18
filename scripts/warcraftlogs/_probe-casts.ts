import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const code = "JCvk27bDL6Zdm18j";
const fightID = 17;

// A tabela Casts da WCL: o que ela devolve por jogador e por habilidade?
const data = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
  `query($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        table(fightIDs: $fightIDs, dataType: Casts)
      }
    }
  }`,
  { code, fightIDs: [fightID] }
);

const t = (data.reportData.report?.table as { data?: { entries?: unknown[] } })?.data;
const entries = (t?.entries ?? []) as Array<Record<string, unknown>>;

console.log("entradas:", entries.length);
console.log("campos de uma entrada:", Object.keys(entries[0] ?? {}).join(", "));

const um = entries[0] as { name?: string; abilities?: Array<Record<string, unknown>> };
console.log("\njogador:", um?.name, "| habilidades:", um?.abilities?.length);
console.log("campos de uma habilidade:", Object.keys(um?.abilities?.[0] ?? {}).join(", "));
console.log("\namostra de habilidades:");
for (const a of (um?.abilities ?? []).slice(0, 6)) {
  console.log("  " + JSON.stringify(a));
}
