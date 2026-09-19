/**
 * Diagnóstico: interrupções, dispels e battle rez.
 *
 * São as três coletas que faltam pra fechar a lista de medalhas do
 * brainstorm — Sentinela, Faxineiro, Ressuscitador e Vampiro — e também o
 * que o Score não mede hoje: o trabalho de utilidade, que não aparece em
 * dano nem em cura e sustenta o raide inteiro.
 *
 * A pergunta é o formato de cada evento e quanto custa buscá-los.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const fights = await wcl.fetchReportFights(code);
const duracao = Math.max(...fights.map((f) => f.endTime), 0);
const atores = await wcl.fetchActorNames(code);
const antes = await wcl.fetchRateLimitData();

async function eventos(tipo: string) {
  try {
    const data = await wclGraphql<{
      reportData: {
        report: { events: { data: Array<Record<string, unknown>>; nextPageTimestamp: number | null } };
      };
    }>(
      `query($code: String!, $end: Float!) {
        reportData { report(code: $code) {
          events(dataType: ${tipo}, startTime: 0, endTime: $end, limit: 500) { data nextPageTimestamp }
        } }
      }`,
      { code, end: duracao }
    );
    return data.reportData.report.events;
  } catch (error) {
    return { erro: error instanceof Error ? error.message : String(error) } as const;
  }
}

for (const tipo of ["Interrupts", "Dispels", "Resurrects"]) {
  console.log(`\n=== ${tipo} ===`);
  const resposta = await eventos(tipo);

  if ("erro" in resposta) {
    console.log(`  NÃO ACEITO: ${String(resposta.erro).slice(0, 160)}`);
    continue;
  }

  const lista = resposta.data;
  console.log(`  ${lista.length} eventos · próxima página: ${resposta.nextPageTimestamp ?? "não tem"}`);

  if (lista.length === 0) continue;

  console.log(`  campos: ${Object.keys(lista[0]).join(", ")}`);
  console.log(`  exemplo: ${JSON.stringify(lista[0])}`);

  // Quem fez, e quantas vezes.
  const porAtor = new Map<number, number>();
  for (const evento of lista) {
    const quem = Number(evento.sourceID ?? -1);
    porAtor.set(quem, (porAtor.get(quem) ?? 0) + 1);
  }

  console.log("  por jogador:");
  [...porAtor]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([id, n]) => console.log(`    ${(atores.get(id) ?? `#${id}`).padEnd(14)} ${n}`));
}

const depois = await wcl.fetchRateLimitData();
console.log(
  `\n=== CUSTO: ${(depois.pointsSpentThisHour - antes.pointsSpentThisHour).toFixed(1)} pontos de ${depois.limitPerHour}/h ===`
);
