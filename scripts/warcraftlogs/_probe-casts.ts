import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const code = "JCvk27bDL6Zdm18j";
const fightID = 17;

// 1) events com dataType Casts — devolve cada cast, sem truncar?
const ev = await wclGraphql<{
  reportData: { report: { events?: { data?: Array<Record<string, unknown>>; nextPageTimestamp?: number } } | null };
}>(
  `query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) {
      events(fightIDs: $fightIDs, dataType: Casts, limit: 10000) { data nextPageTimestamp }
    } }
  }`,
  { code, fightIDs: [fightID] }
);

const eventos = ev.reportData.report?.events?.data ?? [];
console.log(`events(Casts): ${eventos.length} eventos  | proxima pagina: ${ev.reportData.report?.events?.nextPageTimestamp ?? "nenhuma"}`);
console.log("campos:", Object.keys(eventos[0] ?? {}).join(", "));

const porAbility = new Map<number, number>();
for (const e of eventos) {
  const id = e.abilityGameID as number;
  if (id) porAbility.set(id, (porAbility.get(id) ?? 0) + 1);
}
console.log(`habilidades distintas no fight inteiro: ${porAbility.size}`);

const havoc: Record<number, string> = {
  191427: "Metamorphosis", 198013: "Eye Beam", 188499: "Blade Dance",
  198589: "Blur (def)", 196555: "Netherwalk (def)",
};
console.log("\ncooldowns de Havoc aparecem nos events?");
for (const [guid, nome] of Object.entries(havoc)) {
  const n = porAbility.get(Number(guid));
  console.log(`  ${nome.padEnd(22)} ${n !== undefined ? `SIM (${n} casts no raide)` : "não"}`);
}

// 2) DamageTaken: o que tem de mitigação?
const dt = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
  `query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { table(fightIDs: $fightIDs, dataType: DamageTaken) } }
  }`,
  { code, fightIDs: [fightID] }
);
const dtEntries = ((dt.reportData.report?.table as { data?: { entries?: unknown[] } })?.data?.entries ?? []) as Array<Record<string, unknown>>;
console.log(`\nDamageTaken: ${dtEntries.length} jogadores`);
console.log("campos:", Object.keys(dtEntries[0] ?? {}).join(", "));
