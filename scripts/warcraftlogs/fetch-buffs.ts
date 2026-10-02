/**
 * Arquiva as auras de cada jogador — frasco, comida e runa.
 *
 * Esses três são estado de ANTES do pull. Foram quatro tentativas até achar
 * onde a WarcraftLogs guarda isso, e vale deixar registrado pra ninguém
 * repetir o caminho:
 *
 * 1. `combatantInfo.auras` da Summary volta VAZIO — nos 13 relatórios da
 *    temporada, com gear presente em todos. Agregada ou de um fight só, dá
 *    no mesmo: a agregação não era a causa.
 * 2. A tabela Buffs do raide inteiro mostra que os buffs existem, mas agrega
 *    por habilidade: `bands` é intervalo de TEMPO, não jogador.
 * 3. Os EVENTOS trazem `targetID`, só que o log só registra `applybuff` do
 *    que foi aplicado durante a gravação. Frasco dura uma hora e comida se
 *    come em casa: os dois já estão ativos quando o log começa, e por isso
 *    não têm evento. Essa rota pega runa e não pega frasco.
 * 4. A tabela Buffs **por alvo** devolve o que estava ativo, independente de
 *    quando foi aplicado. É esta.
 *
 * O preço é uma consulta por jogador por relatório — as 13 noites custam
 * ~220 consultas, contra um teto de 3600 por hora.
 *
 * Óleo NÃO sai daqui: é encantamento temporário e já vem no gear.
 *
 *   npm run wcl:fetch-buffs                  # relatórios ainda sem auras
 *   npm run wcl:fetch-buffs -- --reports=A,B # só esses
 *   npm run wcl:fetch-buffs -- --force       # refaz os que já têm
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BRUTO = path.join(ROOT, "data/raw/warcraftlogs");

/** Nome sem acento, pra casar jogador do roster com ator do log. */
const semAcento = (nome: string) =>
  nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

interface AurasArquivadas {
  reportCode: string;
  coletadoEm: string;
  /** guid -> nome, uma vez só pro arquivo não repetir texto. */
  nomes: Array<[number, string]>;
  /** id do ator -> guids das auras que ele teve. */
  porJogador: Array<[number, number[]]>;
}

/**
 * As auras de UM jogador.
 *
 * Guarda TODAS, não só as que o nome parece consumível. Filtrar por nome na
 * coleta foi exatamente o erro que escondeu a `Light's Potential` por uma
 * temporada — a família se decide depois, pelo ícone do Wowhead.
 */
async function aurasDoJogador(
  code: string,
  fightIDs: number[],
  alvo: number
): Promise<Array<[number, string]>> {
  const r = await wclGraphql<{ reportData: { report: { buffs: unknown } } }>(
    `query($code: String!, $fightIDs: [Int], $alvo: Int!) {
      reportData { report(code: $code) {
        buffs: table(fightIDs: $fightIDs, dataType: Buffs, targetID: $alvo)
      } }
    }`,
    { code, fightIDs, alvo }
  );

  const auras =
    (r.reportData.report.buffs as { data?: { auras?: Array<{ guid?: number; name?: string }> } })?.data?.auras ?? [];

  return auras.filter((a) => a.guid && a.name).map((a) => [a.guid!, a.name!] as [number, string]);
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [chave, valor] = arg.replace(/^--/, "").split("=");
      return [chave, valor ?? true];
    })
  ) as Record<string, string | boolean>;

  const roster = JSON.parse(await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8")) as Array<{
    name: string;
  }>;
  const doRoster = new Set(roster.map((j) => semAcento(j.name)));

  const existentes = await readdir(BRUTO);
  const codigos = args.reports
    ? String(args.reports).split(",").map((c) => c.trim())
    : existentes
        .filter((f) => f.endsWith(".json") && !f.includes("-rankings") && !f.includes("-buffs"))
        .map((f) => f.replace(".json", ""));

  console.log(`${codigos.length} relatório(s). Uma consulta por jogador do roster em cada.\n`);
  let consultas = 0;

  for (const code of codigos) {
    const destino = path.join(BRUTO, `${code}-buffs.json`);
    if (!args.force && existentes.includes(`${code}-buffs.json`)) {
      console.log(`  ${code}: já arquivado — pulando (use --force)`);
      continue;
    }

    // Os atores saem do arquivo bruto que já está no repositório: saber quem
    // jogou não custa consulta nenhuma.
    const log = JSON.parse(await readFile(path.join(BRUTO, `${code}.json`), "utf-8")) as {
      actorNames?: Array<[number, string]>;
      raidFights?: Array<{ id: number }>;
    };

    const fightIDs = (log.raidFights ?? []).map((f) => f.id);
    if (fightIDs.length === 0) {
      console.log(`  ${code}: sem lutas de raide — pulando`);
      continue;
    }

    // Só quem é do core. O relatório de 25/08 tem 40 atores; perguntar por
    // pug multiplicaria a conta sem servir pra nada.
    const alvos = (log.actorNames ?? []).filter(([, nome]) => doRoster.has(semAcento(nome)));

    const nomes = new Map<number, string>();
    const porJogador: Array<[number, number[]]> = [];

    for (const [ator, nome] of alvos) {
      const auras = await aurasDoJogador(code, fightIDs, ator);
      consultas += 1;
      for (const [guid, nomeDaAura] of auras) nomes.set(guid, nomeDaAura);
      porJogador.push([ator, auras.map(([guid]) => guid).sort((a, b) => a - b)]);
      void nome;
    }

    const arquivo: AurasArquivadas = {
      reportCode: code,
      coletadoEm: new Date().toISOString(),
      nomes: [...nomes].sort((a, b) => a[0] - b[0]),
      porJogador,
    };

    await writeFile(destino, `${JSON.stringify(arquivo, null, 2)}\n`);
    console.log(`  ${code}: ${alvos.length} jogadores, ${nomes.size} auras distintas`);
  }

  console.log(`\n${consultas} consultas gastas. O próximo passo é classificar a família de cada aura.`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
