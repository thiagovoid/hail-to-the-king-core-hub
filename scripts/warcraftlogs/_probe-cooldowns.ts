/**
 * Sonda: quanto custa, em pontos da API da WCL, puxar os casts da noite
 * inteira — e quantas magias distintas o raide aperta.
 *
 * Existe porque a métrica de cooldowns é a primeira que precisa de EVENTOS,
 * não de tabelas agregadas: são ~8k eventos por try. Antes de colocar isso
 * num cron que roda toda semana, é preciso saber se cabe no limite por hora.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const antes = await wcl.fetchRateLimitData();
console.log(`pontos gastos na hora ANTES: ${antes.pointsSpentThisHour} / ${antes.limitPerHour}`);

const { reportData } = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID kill startTime endTime } } }
  }`,
  { code }
);

const fights = reportData.report.fights.filter((f) => f.encounterID > 0);
console.log(`trys de boss no relatorio: ${fights.length}`);

const habilidades = new Set<number>();
let totalEventos = 0;
let paginas = 0;

for (const fight of fights) {
  let cursor: number | undefined = fight.startTime;

  // A WCL pagina eventos: sem o laço, noites longas voltariam truncadas e o
  // tempo em recarga sairia menor do que foi de verdade.
  while (cursor !== undefined && cursor !== null) {
    const pagina: {
      reportData: {
        report: {
          events?: { data?: Array<Record<string, unknown>>; nextPageTimestamp?: number | null };
        } | null;
      };
    } = await wclGraphql(
      `query($code: String!, $fightIDs: [Int]!, $start: Float!, $end: Float!) {
        reportData { report(code: $code) {
          events(fightIDs: $fightIDs, dataType: Casts, startTime: $start, endTime: $end, limit: 10000) {
            data
            nextPageTimestamp
          }
        } }
      }`,
      { code, fightIDs: [fight.id], start: cursor, end: fight.endTime }
    );

    const eventos = pagina.reportData.report?.events?.data ?? [];
    totalEventos += eventos.length;
    paginas += 1;
    for (const evento of eventos) {
      const id = evento.abilityGameID as number;
      if (id) habilidades.add(id);
    }

    cursor = pagina.reportData.report?.events?.nextPageTimestamp ?? undefined;
  }
}

const depois = await wcl.fetchRateLimitData();
const custo = depois.pointsSpentThisHour - antes.pointsSpentThisHour;

console.log(`paginas buscadas: ${paginas}`);
console.log(`eventos de cast na noite: ${totalEventos}`);
console.log(`magias distintas na noite: ${habilidades.size}`);
console.log(`pontos gastos na hora DEPOIS: ${depois.pointsSpentThisHour} / ${depois.limitPerHour}`);
console.log(`CUSTO DA NOITE: ${custo.toFixed(2)} pontos (${((custo / depois.limitPerHour) * 100).toFixed(1)}% do limite por hora)`);
