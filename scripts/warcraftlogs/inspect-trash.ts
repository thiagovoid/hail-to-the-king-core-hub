/**
 * Diagnóstico da coleta nova: o que a WCL entrega além do agregado da noite.
 *
 * Quatro perguntas, e o custo em pontos de cada uma:
 *  1. dano no trash — quem contribui na limpeza entre os bosses;
 *  2. presença try a try — quem perdeu pull, chegou tarde, saiu cedo;
 *  3. mortes com hora — pra saber em QUAL try alguém morreu;
 *  4. spec por noite — pra contar quem jogou de duas ou três specs.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

interface FightSonda {
  id: number;
  name: string;
  encounterID: number;
  kill: boolean;
  startTime: number;
  endTime: number;
  friendlyPlayers: number[] | null;
}

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();
const antes = await wcl.fetchRateLimitData();

const { reportData } = await wclGraphql<{
  reportData: {
    report: {
      startTime: number;
      endTime: number;
      fights: FightSonda[];
      masterData: { actors: { id: number; name: string; subType: string }[] };
    };
  };
}>(
  `query($code: String!) {
    reportData { report(code: $code) {
      startTime endTime
      fights { id name encounterID kill startTime endTime friendlyPlayers }
      masterData { actors(type: "Player") { id name subType } }
    } }
  }`,
  { code }
);

const { fights, masterData } = reportData.report;
const nomeDe = new Map(masterData.actors.map((a) => [a.id, a.name]));
const bosses = fights.filter((f) => f.encounterID > 0);
const trash = fights.filter((f) => f.encounterID === 0);

console.log(`=== 1. TRASH (${trash.length} lutas) ===`);
if (trash.length > 0) {
  const tabelas = await wcl.fetchFightTables(code, trash.map((f) => f.id));
  const total = tabelas.damage.data.entries.reduce((s, e) => s + (e.total ?? 0), 0);
  const comDano = new Map(tabelas.damage.data.entries.map((e) => [e.name, e.total ?? 0]));
  const zerados = masterData.actors.filter((a) => !comDano.has(a.name));
  console.log(`  ${comDano.size} jogadores com dano, ${zerados.length} zerados: ${zerados.map((a) => a.name).join(", ") || "—"}`);
  console.log(`  top 3: ${[...comDano].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, d]) => `${n} ${((d / total) * 100).toFixed(1)}%`).join(", ")}`);
}

console.log(`\n=== 2. PRESENÇA TRY A TRY (${bosses.length} trys) ===`);
const primeira = new Set(bosses[0]?.friendlyPlayers ?? []);
const ultima = new Set(bosses.at(-1)?.friendlyPlayers ?? []);
const todosQueJogaram = new Set(bosses.flatMap((f) => f.friendlyPlayers ?? []));
console.log(`  jogadores em alguma try: ${todosQueJogaram.size}`);
console.log(`  chegaram tarde (faltaram na try 1): ${[...todosQueJogaram].filter((id) => !primeira.has(id)).map((id) => nomeDe.get(id)).join(", ") || "—"}`);
console.log(`  saíram cedo (faltaram na última): ${[...todosQueJogaram].filter((id) => !ultima.has(id)).map((id) => nomeDe.get(id)).join(", ") || "—"}`);
console.log(`  trys por boss: ${[...new Set(bosses.map((f) => f.name))]
  .map((nome) => {
    const doBoss = bosses.filter((f) => f.name === nome);
    return `${nome} ${doBoss.length} (${doBoss.filter((f) => f.kill).length} kill)`;
  })
  .join(" | ")}`);

console.log("\n=== 3. MORTES COM HORA ===");
const mortes = await wclGraphql<{
  reportData: { report: { events: { data: Array<Record<string, unknown>>; nextPageTimestamp: number | null } } };
}>(
  `query($code: String!, $start: Float!, $end: Float!) {
    reportData { report(code: $code) {
      events(dataType: Deaths, startTime: $start, endTime: $end, limit: 500) { data nextPageTimestamp }
    } }
  }`,
  { code, start: reportData.report.startTime, end: reportData.report.endTime }
);
const eventos = mortes.reportData.report.events.data;
console.log(`  ${eventos.length} mortes, próxima página: ${mortes.reportData.report.events.nextPageTimestamp ?? "não tem"}`);
console.log(`  campos: ${Object.keys(eventos[0] ?? {}).join(", ")}`);
console.log(`  exemplo: ${JSON.stringify(eventos[0] ?? {})}`);
const porFight = new Map<number, number>();
for (const e of eventos) {
  const fight = Number(e.fight ?? -1);
  porFight.set(fight, (porFight.get(fight) ?? 0) + 1);
}
console.log(`  mortes por fight: ${[...porFight].sort((a, b) => a[0] - b[0]).map(([f, n]) => `#${f}:${n}`).join(" ")}`);

console.log("\n=== 4. SPEC POR JOGADOR ===");
const tabelaDaNoite = await wcl.fetchFightTables(code, bosses.map((f) => f.id));
const composicao = (tabelaDaNoite.summary.data as Record<string, unknown>).composition;
console.log(`  summary.composition: ${Array.isArray(composicao) ? `${composicao.length} entradas` : "AUSENTE"}`);
if (Array.isArray(composicao)) console.log(`  exemplo: ${JSON.stringify(composicao[0])}`);
console.log(`  masterData.actors.subType (spec?): ${masterData.actors.slice(0, 4).map((a) => `${a.name}=${a.subType}`).join(", ")}`);
const entradaDeDano = tabelaDaNoite.damage.data.entries[0] as Record<string, unknown>;
console.log(`  campos de uma entrada da tabela de dano: ${Object.keys(entradaDeDano).join(", ")}`);
console.log(`  icon/spec: ${JSON.stringify({ icon: entradaDeDano.icon, type: entradaDeDano.type, specs: entradaDeDano.specs })}`);

console.log("\n=== 5. CUSTO DE UMA TABELA POR TRY ===");
const inicio = Date.now();
const aliases = bosses
  .slice(0, 6)
  .map((f, i) => `f${i}: table(fightIDs: [${f.id}], dataType: DamageDone)`)
  .join("\n        ");
const porTry = await wclGraphql<{ reportData: { report: Record<string, { data: { entries: Array<{ name: string; total: number }> } }> } }>(
  `query($code: String!) { reportData { report(code: $code) {
        ${aliases}
  } } }`,
  { code }
);
const tabelasPorTry = Object.values(porTry.reportData.report);
console.log(`  6 tabelas numa query só: ${Date.now() - inicio}ms`);
console.log(`  jogadores com dano em cada try: ${tabelasPorTry.map((t) => t.data.entries.length).join(", ")}`);

const depois = await wcl.fetchRateLimitData();
console.log(
  `\n=== PONTOS: ${(depois.pointsSpentThisHour - antes.pointsSpentThisHour).toFixed(1)} gastos nesta sonda · limite ${depois.limitPerHour}/h ===`
);
