/**
 * Diagnóstico: quanto pesaria guardar o dado bruto de uma noite?
 *
 * Hoje `data/raw/` está no .gitignore: o CI escreve o arquivo e o runner
 * morre com ele. Toda métrica nova vira uma recoleta na WCL, mesmo quando o
 * dado já tinha passado por aqui uma vez.
 *
 * A pergunta que decide se dá pra versionar o bruto é o tamanho. Isto mede
 * peça por peça, crua e comprimida — o Git guarda comprimido.
 */
import { gzipSync } from "node:zlib";

import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
const medir = (rotulo: string, valor: unknown) => {
  const json = JSON.stringify(valor ?? null);
  const cru = Buffer.byteLength(json);
  const comprimido = gzipSync(json).length;
  console.log(`  ${rotulo.padEnd(26)} ${kb(cru).padStart(9)}  ${kb(comprimido).padStart(9)} comprimido`);
  return { cru, comprimido };
};

const zonas = await wcl.fetchRaidEncounterIds(53);
const antes = await wcl.fetchRateLimitData();

const resultado = await wcl.fetch({ reportCode: code, validEncounterIds: zonas });
const raw = resultado.raw;

console.log(`=== O QUE O fetch() JÁ GUARDA (report ${code}) ===`);
console.log(`  ${"peça".padEnd(26)} ${"cru".padStart(9)}  ${"gzip".padStart(9)}`);
const pedacos = [
  medir("fights", raw.fights),
  medir("aggregateTables.damage", raw.aggregateTables.damage),
  medir("aggregateTables.healing", raw.aggregateTables.healing),
  medir("aggregateTables.summary", raw.aggregateTables.summary),
  medir("trashTables", raw.trashTables),
  medir("deathEvents", raw.deathEvents),
  medir("damagePerFight", raw.damagePerFight),
];

const total = medir("TOTAL do raw atual", raw);

console.log(`\n=== O QUE NÃO PASSA PELO COLETOR ===`);
const castEvents = await wcl.fetchCastEvents(code, raw.raidFights);
const casts = medir(`castEvents (${castEvents.length})`, castEvents);

console.log(`\n=== SE TUDO FOSSE VERSIONADO ===`);
const porNoite = total.comprimido + casts.comprimido;
console.log(`  uma noite:            ${kb(porNoite)} comprimido`);
console.log(`  as 8 da temporada:    ${kb(porNoite * 8)} comprimido`);
console.log(`  uma temporada de 24:  ${kb(porNoite * 24)} comprimido`);
console.log(
  `\n  (o site inteiro hoje tem ~73 KB de fonte; o repo carrega ${kb(1.4 * 1024 * 1024)} só de cache do Wowhead)`
);

const depois = await wcl.fetchRateLimitData();
console.log(
  `\n=== CUSTO DE UMA COLETA: ${(depois.pointsSpentThisHour - antes.pointsSpentThisHour).toFixed(1)} pontos de ${depois.limitPerHour}/h ===`
);
console.log(
  `  (é isso que uma recoleta gasta hoje toda vez que uma métrica nova precisa de dado antigo)`
);
void pedacos;
