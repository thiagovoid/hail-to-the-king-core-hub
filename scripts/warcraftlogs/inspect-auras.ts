/**
 * Descobre por onde a WarcraftLogs entrega frasco, óleo, comida e runa.
 *
 * O problema: a tabela Summary é pedida agregando TODOS os fights, e nessa
 * forma o `combatantInfo.auras` volta vazio — conferido nos 13 relatórios da
 * temporada, zero auras em todos, com gear presente em todos. Sem auras, a
 * checagem de consumível de antes do pull nunca teve dado, e o core inteiro
 * levava falta de frasco por uma lacuna nossa.
 *
 * Poção e pedra de vida já não dependem disto: são uso DENTRO do pull e
 * saem dos casts (ver `consumiveisDaNoite`). Frasco e óleo são estado de
 * antes, e só existem como buff.
 *
 * Este script não escreve nada. Ele só pergunta, de duas formas, e imprime o
 * que cada uma devolve:
 *
 *   A) Summary de UM fight só — a hipótese é que a agregação é que derruba
 *      as auras, porque elas são o retrato do início do pull.
 *   B) Tabela Buffs agregada — devolve uptime de buff por jogador, e de
 *      quebra traria comida e runa.
 *
 * Uma consulta de cada. O orçamento da WCL é 3600 pontos/hora e o script
 * imprime quanto gastou.
 *
 *   npm run wcl:inspect-auras -- --report=AbC123
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";

interface Fight {
  id: number;
  encounterID: number;
  name?: string;
  startTime: number;
  endTime: number;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [chave, valor] = arg.replace(/^--/, "").split("=");
      return [chave, valor ?? true];
    })
  ) as Record<string, string | boolean>;

  if (!args.report) {
    throw new Error("Uso: npm run wcl:inspect-auras -- --report=<codigo>");
  }
  const code = String(args.report);

  const { reportData } = await wclGraphql<{
    reportData: { report: { fights: Fight[] } };
  }>(
    `query($code: String!) {
      reportData { report(code: $code) { fights(killType: Encounters) { id encounterID name startTime endTime } } }
    }`,
    { code }
  );

  const fights = reportData.report.fights;
  if (fights.length === 0) {
    console.log("Relatório sem lutas de boss.");
    return;
  }

  // A luta mais longa: mais chance de todo mundo ter aparecido nela.
  const maior = [...fights].sort((a, b) => b.endTime - b.startTime - (a.endTime - a.startTime))[0];
  console.log(`${fights.length} lutas. Usando a mais longa pro teste A: ${maior.name ?? maior.id} (fight ${maior.id}).\n`);

  console.log("=== ROTA A — Summary de um fight só ===");
  const a = await wclGraphql<{ reportData: { report: { summary: unknown } } }>(
    `query($code: String!, $fightIDs: [Int]) {
      reportData { report(code: $code) { summary: table(fightIDs: $fightIDs, dataType: Summary) } }
    }`,
    { code, fightIDs: [maior.id] }
  );
  relatarAuras(a.reportData.report.summary);

  console.log("\n=== ROTA B — tabela Buffs agregada ===");
  try {
    const b = await wclGraphql<{ reportData: { report: { buffs: unknown } } }>(
      `query($code: String!, $fightIDs: [Int]) {
        reportData { report(code: $code) { buffs: table(fightIDs: $fightIDs, dataType: Buffs) } }
      }`,
      { code, fightIDs: fights.map((f) => f.id) }
    );
    relatarBuffs(b.reportData.report.buffs);
  } catch (erro) {
    console.log(`  falhou: ${(erro as Error).message}`);
  }
}

/** Conta auras por jogador no playerDetails de uma tabela Summary. */
function relatarAuras(summary: unknown) {
  const detalhes = (summary as { data?: { playerDetails?: Record<string, Array<{ name?: string; combatantInfo?: { auras?: Array<{ ability?: number; name?: string }>; gear?: unknown[] } }>> } })?.data?.playerDetails;

  if (!detalhes) {
    console.log("  sem playerDetails.");
    return;
  }

  const todos = Object.values(detalhes).flat();
  const comAura = todos.filter((p) => (p.combatantInfo?.auras ?? []).length > 0);
  console.log(`  ${todos.length} jogadores | ${comAura.length} com auras | ${todos.filter((p) => (p.combatantInfo?.gear ?? []).length > 0).length} com gear`);

  if (comAura.length === 0) {
    console.log("  VEREDITO: a agregação não era a causa — a Summary de um fight só também vem sem auras.");
    return;
  }

  const nomes = new Map<number, string>();
  for (const p of comAura) for (const a of p.combatantInfo!.auras!) if (a.ability) nomes.set(a.ability, a.name ?? "?");
  console.log(`  VEREDITO: FUNCIONA. ${nomes.size} auras distintas. Amostra:`);
  for (const [id, nome] of [...nomes].slice(0, 25)) console.log(`    ${String(id).padStart(8)}  ${nome}`);
}

/** Lista as habilidades da tabela Buffs, que é onde frasco/comida/runa viveriam. */
function relatarBuffs(buffs: unknown) {
  const auras = (buffs as { data?: { auras?: Array<{ guid?: number; name?: string; totalUptime?: number; bands?: unknown[] }> } })?.data?.auras;

  if (!auras) {
    console.log("  sem data.auras — a tabela Buffs não devolveu o formato esperado.");
    return;
  }

  console.log(`  VEREDITO: ${auras.length} buffs distintos no relatório. Os que parecem consumível:`);
  const alvo = auras.filter((a) => /flask|oil|rune|food|well fed|potion|draught|elixir|tea|feast/i.test(a.name ?? ""));
  if (alvo.length === 0) console.log("    nenhum — o que não quer dizer que não existam, só que o nome não denuncia.");
  for (const a of alvo.slice(0, 30)) console.log(`    ${String(a.guid).padStart(8)}  ${a.name}`);

  // A lista inteira: o óleo de arma pode não ter "oil" no nome — a poção
  // mais usada do core não tem "poção" no dela, e foi assim que ela escapou
  // uma temporada inteira. 503 linhas num log de diagnóstico é barato.
  console.log(`\n  TODOS os ${auras.length} buffs, em ordem:`);
  for (const a of [...auras].sort((x, y) => (x.name ?? "").localeCompare(y.name ?? "")))
    console.log(`    ${String(a.guid).padStart(8)}  ${a.name}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
