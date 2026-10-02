/**
 * Arquiva a tabela Buffs de cada relatório — frasco, comida e runa.
 *
 * Esses três são estado de ANTES do pull, não ação dentro dele: não existem
 * nos casts e não vêm no `combatantInfo.auras` (que volta vazio em toda
 * forma de consultar a Summary, conferido no diagnóstico de 02/10). A tabela
 * Buffs tem: 503 buffs no relatório de 01/10, com `Flask of the Magisters`,
 * `Well Fed` e oito runas.
 *
 * Óleo NÃO sai daqui — é encantamento temporário e já vem no gear.
 *
 * É uma consulta por relatório, o que torna o retroativo barato: as 13
 * noites da temporada custam 13 consultas, não uma recoleta.
 *
 *   npm run wcl:fetch-buffs                  # todos os relatórios sem buffs
 *   npm run wcl:fetch-buffs -- --reports=A,B # só esses
 *   npm run wcl:fetch-buffs -- --force       # refaz os que já têm
 */
import { writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BRUTO = path.join(ROOT, "data/raw/warcraftlogs");

interface BuffsArquivados {
  reportCode: string;
  coletadoEm: string;
  /** guid -> nome, como a WCL devolve. */
  auras: Array<[number, string]>;
  /** Quem teve cada buff: guid -> nomes de jogador. */
  porJogador: Array<[number, string[]]>;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [chave, valor] = arg.replace(/^--/, "").split("=");
      return [chave, valor ?? true];
    })
  ) as Record<string, string | boolean>;

  const existentes = await readdir(BRUTO);
  const codigos = args.reports
    ? String(args.reports).split(",").map((c) => c.trim())
    : existentes
        .filter((f) => f.endsWith(".json") && !f.includes("-rankings") && !f.includes("-buffs"))
        .map((f) => f.replace(".json", ""));

  console.log(`${codigos.length} relatório(s) a consultar.\n`);

  for (const code of codigos) {
    const destino = path.join(BRUTO, `${code}-buffs.json`);
    if (!args.force && existentes.includes(`${code}-buffs.json`)) {
      console.log(`  ${code}: já arquivado — pulando (use --force pra refazer)`);
      continue;
    }

    const fights = await wclGraphql<{
      reportData: { report: { fights: Array<{ id: number }> } };
    }>(
      `query($code: String!) {
        reportData { report(code: $code) { fights(killType: Encounters) { id } } }
      }`,
      { code }
    );

    const ids = fights.reportData.report.fights.map((f) => f.id);
    if (ids.length === 0) {
      console.log(`  ${code}: sem lutas de boss — pulando`);
      continue;
    }

    const tabela = await wclGraphql<{ reportData: { report: { buffs: unknown } } }>(
      `query($code: String!, $fightIDs: [Int]) {
        reportData { report(code: $code) { buffs: table(fightIDs: $fightIDs, dataType: Buffs) } }
      }`,
      { code, fightIDs: ids }
    );

    const auras =
      (tabela.reportData.report.buffs as {
        data?: { auras?: Array<{ guid?: number; name?: string; bands?: unknown[]; totalUptime?: number }> };
      })?.data?.auras ?? [];

    // O formato da tabela Buffs agrega por habilidade e lista quem teve em
    // `bands`. Guardamos os dois: o nome resolve a família, a lista de
    // jogadores diz de quem é.
    const arquivo: BuffsArquivados = {
      reportCode: code,
      coletadoEm: new Date().toISOString(),
      auras: auras.filter((a) => a.guid && a.name).map((a) => [a.guid!, a.name!]),
      porJogador: auras
        .filter((a) => a.guid)
        .map((a) => [
          a.guid!,
          [
            ...new Set(
              ((a as { bands?: Array<{ name?: string }> }).bands ?? [])
                .map((b) => b.name)
                .filter((n): n is string => Boolean(n))
            ),
          ],
        ]),
    };

    await writeFile(destino, `${JSON.stringify(arquivo, null, 2)}\n`);
    console.log(`  ${code}: ${arquivo.auras.length} buffs arquivados`);
  }

  console.log("\nPronto. O próximo passo é classificar a família de cada buff.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
