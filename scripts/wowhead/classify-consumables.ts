/**
 * Preenche a família de consumível das magias já catalogadas.
 *
 * O catálogo foi gravado antes de a família existir, então as 193 entradas
 * estão sem ela. Em vez de recoletar tudo, este script relê só o tooltip de
 * cada uma no Wowhead — endpoint público, sem credencial — e grava a família
 * por cima.
 *
 * Roda uma vez. Daqui pra frente a família é preenchida na própria coleta,
 * em `parseSpellTooltip`.
 *
 *   npm run wowhead:classify-consumables
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { familiaDoConsumivel } from "../../src/providers/wowhead/familiaDoConsumivel";
import type { CooldownCatalogFile } from "../../src/providers/wowhead/cooldownCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CATALOGO = path.join(ROOT, "data/seasons/midnight-s2/cooldown-catalog.json");

/** Uma pausa curta entre consultas: o endpoint é deles, não nosso. */
const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const catalogo = JSON.parse(await readFile(CATALOGO, "utf-8")) as CooldownCatalogFile;
  const entradas = Object.entries(catalogo.cooldowns);

  console.log(`Consultando ${entradas.length} magias no Wowhead...\n`);

  let classificadas = 0;
  const porFamilia = new Map<string, string[]>();

  for (const [chave, dados] of entradas) {
    const resposta = await fetch(`https://nether.wowhead.com/tooltip/spell/${chave}`);
    if (!resposta.ok) {
      console.warn(`  ${dados.name}: HTTP ${resposta.status} — deixada sem família`);
      continue;
    }

    const tooltip = (await resposta.json()) as { tooltip?: string; icon?: string };
    const familia = familiaDoConsumivel(tooltip.tooltip, tooltip.icon);

    if (familia) {
      dados.familia = familia;
      classificadas += 1;
      porFamilia.set(familia, [...(porFamilia.get(familia) ?? []), dados.name]);
    } else {
      delete dados.familia;
    }

    await espera(120);
  }

  await writeFile(CATALOGO, `${JSON.stringify(catalogo, null, 2)}\n`);

  console.log(`${classificadas} de ${entradas.length} são consumível:\n`);
  for (const [familia, nomes] of [...porFamilia].sort()) {
    console.log(`  ${familia} (${nomes.length}):`);
    for (const nome of nomes.sort()) console.log(`    ${nome}`);
  }
  console.log("\nConfira o diff antes de commitar — a classificação é heurística.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
