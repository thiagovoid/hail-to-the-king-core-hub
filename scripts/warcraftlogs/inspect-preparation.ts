import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";
import type { WclPlayerDetail } from "../../src/providers/warcraftlogs/normalize";

// Raid da season atual (Midnight S2). Mesmo valor de fetch-performance.ts.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

/**
 * Imprime o que a WCL realmente devolve em `combatantInfo` num report: os
 * IDs de aura (flask/comida/runa/óleo/poção) e o array de gear com os
 * índices de slot, encantos e gemas.
 *
 * Gemas e encantos já vêm do Wowhead (`preparation-reference.json`) e cruzam
 * por item id. **Consumíveis não**: o guia dá o item id, a WCL entrega a aura
 * por spell id e com o nome no idioma do cliente de quem logou. Este script
 * existe pra fechar essa lacuna — rodar uma vez por temporada, ler os spell
 * ids reais das auras e só então ligar a checagem de flask/comida/runa/óleo/
 * poção em `buildChecklistFromReference`.
 *
 * Uso: npm run wcl:inspect-preparation -- --report=AbC123 [--player=Nome]
 */
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.report) {
    throw new Error("Uso: npm run wcl:inspect-preparation -- --report=<codigo do report> [--player=<nome>]");
  }

  const reportCode = String(args.report);
  const wcl = new WarcraftLogsProvider();

  const validEncounterIds = await wcl.fetchRaidEncounterIds(RAID_ZONE_ID);
  const fights = await wcl.fetchReportFights(reportCode);
  const raidFightIds = fights.filter((fight) => validEncounterIds.has(fight.encounterID)).map((fight) => fight.id);

  if (raidFightIds.length === 0) {
    console.log(`Report ${reportCode} não tem fights do tier atual (zone ${RAID_ZONE_ID}).`);
    return;
  }

  const tables = await wcl.fetchFightTables(reportCode, raidFightIds);
  const playerDetails = tables.summary.data.playerDetails ?? {};
  const everyone: WclPlayerDetail[] = Object.values(playerDetails).flat();

  if (everyone.length === 0) {
    console.log("Summary não trouxe playerDetails — a query precisa ser revista.");
    return;
  }

  const wantedName = args.player ? String(args.player) : undefined;
  const sample = wantedName
    ? everyone.find((member) => member.name.toLowerCase() === wantedName.toLowerCase())
    : everyone.find((member) => member.combatantInfo);

  if (!sample) {
    console.log(`Nenhum jogador${wantedName ? ` chamado ${wantedName}` : ""} com combatantInfo neste report.`);
    console.log("Jogadores disponíveis:", everyone.map((member) => member.name).join(", "));
    return;
  }

  if (!sample.combatantInfo) {
    console.log(
      `${sample.name} não veio com combatantInfo. Isso indica que a tabela Summary não expõe esse campo — nesse caso a coleta de preparação precisa de outra query.`
    );
    return;
  }

  console.log(`\n=== GEAR de ${sample.name} (índice do slot → item) ===`);
  (sample.combatantInfo.gear ?? []).forEach((item, index) => {
    const gems = item.gems?.length ?? 0;
    console.log(
      `  [${String(index).padStart(2)}] item=${item.id ?? 0}`.padEnd(24) +
        `encanto=${item.permanentEnchant ?? "—"}`.padEnd(18) +
        `gemas=${gems}`
    );
  });

  // Dump cru: quais campos a WCL realmente manda em cada item de gear.
  // O mapa de índice->slot foi escrito por suposição e não bateu com o dado
  // real, então aqui é onde se descobre se existe um campo autoritativo.
  console.log(`\n=== CAMPOS CRUS DO GEAR (3 primeiros itens) ===`);
  const gear = sample.combatantInfo.gear ?? [];
  for (const item of gear.slice(0, 3)) {
    console.log(`  ${JSON.stringify(item)}`);
  }
  const chaves = new Set<string>();
  for (const item of gear) Object.keys(item ?? {}).forEach((k) => chaves.add(k));
  console.log(`  campos presentes: [${[...chaves].join(", ")}]`);
  console.log(`\n=== SLOT -> NOME (pra confirmar a numeração da WCL) ===`);
  for (const item of gear) {
    if (!item.id) continue;
    const enc = item.permanentEnchantName ?? (item.permanentEnchant ? String(item.permanentEnchant) : "—");
    console.log(`  slot ${String(item.slot ?? "?").padStart(2)}  ${String((item as { name?: string }).name ?? "?").padEnd(38)} encanto: ${enc}`);
  }
  console.log(`  total de itens no array: ${gear.length}`);

  console.log(`\n=== AURAS no pull (candidatas a flask/comida/runa/óleo/poção) ===`);
  const auras = sample.combatantInfo.auras ?? [];
  if (auras.length === 0) {
    console.log("  (nenhuma — verifique se a WCL expõe auras no combatantInfo deste report)");
  }
  for (const aura of auras) {
    console.log(`  ability=${aura.ability ?? "—"}  ${aura.name ?? ""}`);
  }

  console.log(
    "\nOs `ability=` acima são os spell ids das auras. Encantos e gemas já vêm do Wowhead;\n" +
      "use esta lista pra ligar os consumíveis em src/providers/warcraftlogs/preparationReference.ts\n" +
      "(hoje eles ficam `unconfigured` e fora da nota, de propósito).\n" +
      "Confira também se a ordem do array de gear acima bate com GEAR_SLOT_INDEX do mesmo arquivo.\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
