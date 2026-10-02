/**
 * Classifica as auras arquivadas em frasco, comida, poção, pedra ou óleo.
 *
 * As auras vêm da WarcraftLogs com guid e nome, e só isso não basta: a
 * família sai do ÍCONE, que é identificador interno da Blizzard e não
 * envelhece de temporada em temporada. Quem decide é `familiaDoConsumivel`.
 *
 * Grava num arquivo versionado e INCREMENTAL: a aura já consultada não volta
 * ao Wowhead, e o que não é consumível fica registrado como tal pra não ser
 * reconsultado toda semana. Das 721 auras da temporada, 579 eram novas na
 * primeira passada; na segunda, nenhuma.
 *
 *   npm run wowhead:classify-auras
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  familiaDoConsumivel,
  type FamiliaDeConsumivel,
} from "../../src/providers/wowhead/familiaDoConsumivel";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BRUTO = path.join(ROOT, "data/raw/warcraftlogs");
const CATALOGO = path.join(ROOT, "data/seasons/midnight-s2/aura-catalog.json");

interface CatalogoDeAuras {
  geradoEm: string;
  /** guid -> família. Só o que É consumível. */
  consumiveis: Record<string, { name: string; familia: FamiliaDeConsumivel }>;
  /** Já consultadas e descartadas — evita reconsulta. */
  descartadas: number[];
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let catalogo: CatalogoDeAuras;
  try {
    catalogo = JSON.parse(await readFile(CATALOGO, "utf-8")) as CatalogoDeAuras;
  } catch {
    catalogo = { geradoEm: "", consumiveis: {}, descartadas: [] };
  }

  const conhecidas = new Set([
    ...Object.keys(catalogo.consumiveis).map(Number),
    ...catalogo.descartadas,
  ]);

  const todas = new Map<number, string>();
  for (const arquivo of (await readdir(BRUTO)).filter((f) => f.endsWith("-buffs.json"))) {
    const j = JSON.parse(await readFile(path.join(BRUTO, arquivo), "utf-8")) as {
      nomes?: Array<[number, string]>;
    };
    for (const [guid, nome] of j.nomes ?? []) todas.set(guid, nome);
  }

  const aConsultar = [...todas.keys()].filter((guid) => !conhecidas.has(guid));
  console.log(`${todas.size} auras arquivadas; ${aConsultar.length} ainda não classificadas.\n`);

  const descartadas = new Set(catalogo.descartadas);
  let novas = 0;

  for (const guid of aConsultar) {
    const resposta = await fetch(`https://nether.wowhead.com/tooltip/spell/${guid}`);
    if (!resposta.ok) {
      console.warn(`  ${todas.get(guid)} (${guid}): HTTP ${resposta.status}`);
      continue;
    }

    const tooltip = (await resposta.json()) as { tooltip?: string; icon?: string };
    const familia = familiaDoConsumivel(tooltip.tooltip, tooltip.icon, todas.get(guid));

    if (familia) {
      catalogo.consumiveis[String(guid)] = { name: todas.get(guid)!, familia };
      novas += 1;
    } else {
      descartadas.add(guid);
    }

    await espera(100);
  }

  catalogo.geradoEm = new Date().toISOString();
  catalogo.descartadas = [...descartadas].sort((a, b) => a - b);
  await writeFile(CATALOGO, `${JSON.stringify(catalogo, null, 2)}\n`);

  const porFamilia = new Map<string, string[]>();
  for (const { name, familia } of Object.values(catalogo.consumiveis)) {
    porFamilia.set(familia, [...(porFamilia.get(familia) ?? []), name]);
  }

  console.log(`\n${novas} aura(s) nova(s) classificada(s). Catálogo tem ${Object.keys(catalogo.consumiveis).length}:\n`);
  for (const [familia, nomes] of [...porFamilia].sort()) {
    console.log(`  ${familia} (${nomes.length}): ${[...new Set(nomes)].sort().join(", ")}`);
  }
  console.log("\nConfira o diff — a classificação é heurística e o arquivo existe pra ser corrigido à mão.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
