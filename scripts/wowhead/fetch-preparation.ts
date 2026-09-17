import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DataCollector } from "../../src/services/DataCollector";
import { WowheadProvider } from "../../src/providers/wowhead/WowheadProvider";
import { parsePreparationGuide, type WowheadPreparationGuide } from "../../src/providers/wowhead/normalize";
import { buildGuideUrl, type Role } from "../../src/providers/wowhead/specSlug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface Sources {
  urlTemplate: string;
  overrides?: Record<string, string>;
}

interface RosterPlayer {
  id: string;
  name: string;
  class: string;
  spec: string;
  role: Role;
}

export interface PreparationReferenceEntry extends WowheadPreparationGuide {
  wowClass: string;
  spec: string;
  role: Role;
  url: string;
  /** Jogadores do roster que usam essa spec — facilita conferir a cobertura. */
  players: string[];
}

export interface PreparationReference {
  updatedAt: string;
  source: "wowhead";
  /** Chave: "<classe>|<spec normalizada>" — a mesma que o cálculo usa pra achar a recomendação. */
  specs: Record<string, PreparationReferenceEntry>;
}

function specKey(wowClass: string, spec: string): string {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return `${normalize(wowClass)}|${normalize(spec)}`;
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  return { season: String(args.season ?? "midnight-s2") };
}

/**
 * Lê do Wowhead as gemas, encantos e consumíveis recomendados para cada spec
 * presente no roster, e grava em `preparation-reference.json`.
 *
 * Roda uma vez por temporada (ou quando o guia é atualizado) — é o que
 * substitui preencher o checklist de preparação na mão. Não precisa de
 * navegador: a página do Wowhead vem renderizada do servidor.
 */
async function main() {
  const { season } = parseArgs();
  const seasonDir = path.join(ROOT, "data/seasons", season);

  const sources: Sources = JSON.parse(await readFile(path.join(seasonDir, "preparation-sources.json"), "utf-8"));
  const roster: RosterPlayer[] = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8"));

  // Uma entrada por spec distinta — não por jogador. Três retribution não
  // viram três requisições.
  const bySpec = new Map<string, { wowClass: string; spec: string; role: Role; players: string[] }>();
  for (const player of roster) {
    const key = specKey(player.class, player.spec);
    const entry = bySpec.get(key) ?? { wowClass: player.class, spec: player.spec, role: player.role, players: [] };
    entry.players.push(player.name);
    bySpec.set(key, entry);
  }

  console.log(`${bySpec.size} spec(s) distinta(s) no roster (${roster.length} jogadores).`);

  const provider = new WowheadProvider();
  // Guia público de terceiro: uma requisição por vez, com folga entre elas.
  const collector = new DataCollector({ minDelayMs: 1000 });

  const specs: PreparationReference["specs"] = {};
  const unmapped: string[] = [];
  const failed: string[] = [];

  for (const [key, entry] of bySpec) {
    const url =
      sources.overrides?.[key] ??
      buildGuideUrl({ template: sources.urlTemplate, wowClass: entry.wowClass, spec: entry.spec, role: entry.role });

    if (!url) {
      unmapped.push(`${entry.wowClass} / ${entry.spec} (${entry.players.join(", ")})`);
      continue;
    }

    const [outcome] = await collector.run({
      provider,
      context: { url },
      rawKey: key.replace("|", "/"),
    });

    if (outcome.status === "error") {
      failed.push(`${key}: ${outcome.error}`);
      console.warn(`  ${key} → falhou: ${outcome.error}`);
      continue;
    }

    try {
      const guide = parsePreparationGuide(outcome.result.raw);
      specs[key] = { wowClass: entry.wowClass, spec: entry.spec, role: entry.role, url, players: entry.players, ...guide };
      console.log(
        `  ${key} → ${guide.enchants.length} encanto(s), ${guide.gems.length} gema(s), ${guide.consumables.length} consumível(is)`
      );
    } catch (error) {
      failed.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      console.warn(`  ${key} → não consegui interpretar: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (unmapped.length > 0) {
    console.warn(
      `\nSpecs sem slug conhecido (não viraram URL, pra não gerar referência errada):\n  ${unmapped.join("\n  ")}\n` +
        "Adicione a grafia em src/providers/wowhead/specSlug.ts, ou aponte a URL direto em 'overrides' no preparation-sources.json."
    );
  }

  if (Object.keys(specs).length === 0) {
    throw new Error("Nenhuma spec foi coletada — não vou sobrescrever a referência com um arquivo vazio.");
  }

  const outPath = path.join(seasonDir, "preparation-reference.json");

  // O guia muda de vez em quando; o job roda toda semana. Se a recomendação
  // veio igual à que já está gravada, nem toca no arquivo: carimbar um
  // updatedAt novo faria o workflow commitar um diff de uma linha toda
  // semana, sem nada ter mudado de verdade.
  const previous = await readFile(outPath, "utf-8").then(
    (raw) => JSON.parse(raw) as PreparationReference,
    () => undefined
  );

  if (previous && JSON.stringify(previous.specs) === JSON.stringify(specs)) {
    console.log(`\nReferência inalterada (${Object.keys(specs).length} spec(s)) — nada reescrito.`);
    return;
  }

  const reference: PreparationReference = {
    updatedAt: new Date().toISOString(),
    source: "wowhead",
    specs,
  };

  await writeFile(outPath, `${JSON.stringify(reference, null, 2)}\n`);

  console.log(
    `\n${path.relative(ROOT, outPath)} atualizado: ${Object.keys(specs).length} spec(s)` +
      `${unmapped.length ? `, ${unmapped.length} sem mapeamento` : ""}` +
      `${failed.length ? `, ${failed.length} com falha` : ""}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
