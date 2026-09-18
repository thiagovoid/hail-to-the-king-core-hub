import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const code = "JCvk27bDL6Zdm18j";
const fightID = 17;

const data = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
  `query($code: String!, $fightIDs: [Int]!) {
    reportData { report(code: $code) { table(fightIDs: $fightIDs, dataType: Casts) } }
  }`,
  { code, fightIDs: [fightID] }
);

const entries = ((data.reportData.report?.table as { data?: { entries?: unknown[] } })?.data?.entries ??
  []) as Array<{ name?: string; abilities?: Array<{ guid?: number; name?: string; total?: number }> }>;

console.log(`jogadores: ${entries.length}`);
console.log("\nquantas habilidades por jogador:");
for (const e of entries) {
  console.log(`  ${String(e.name).padEnd(14)} ${e.abilities?.length ?? 0}`);
}

const dh = entries.find((e) => e.name === "Heracranosx");
console.log(`\ntodas as habilidades de ${dh?.name}:`);
for (const a of dh?.abilities ?? []) {
  console.log(`  ${String(a.guid).padStart(7)}  ${String(a.name).padEnd(28)} ${a.total}`);
}

// Cooldowns conhecidos de Havoc: aparecem?
const esperados = [191427, 198013, 188499, 198589, 196555];
const nomes = ["Metamorphosis", "Eye Beam", "Blade Dance", "Blur (defensivo)", "Netherwalk (defensivo)"];
console.log("\ncooldowns conhecidos de Havoc estão na lista?");
esperados.forEach((guid, i) => {
  const achou = dh?.abilities?.some((a) => a.guid === guid);
  console.log(`  ${nomes[i].padEnd(24)} ${achou ? "SIM" : "NÃO"}`);
});
