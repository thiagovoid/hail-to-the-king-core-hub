/**
 * Diagnóstico: dá pra separar morte que custa de morte que é chamada de wipe?
 *
 * Contar morte crua pune resiliência. Progressão em mítico é 200, 300 trys, e
 * "pode wipar, galera" produz um monte de morte que não é erro de ninguém —
 * é cumprir a call e economizar tempo.
 *
 * A hipótese: morte com a luta ainda viva custa (o raide seguiu lutando sem
 * você), morte colada no fim da try não custa nada. Se ela valer, as mortes
 * se agrupam perto do fim — é isso que este script procura.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const fights = await wcl.fetchReportFights(code);
const bosses = fights.filter((fight) => fight.encounterID > 0);
const duracao = Math.max(...fights.map((fight) => fight.endTime), 0);

const atores = await wcl.fetchActorNames(code);
const mortes = await wcl.fetchDeathEvents(code, duracao);
const porFight = new Map(bosses.map((fight) => [fight.id, fight]));

interface MorteMedida {
  nome: string;
  fightId: number;
  kill: boolean;
  /** Segundos que a luta ainda durou depois da morte. */
  sobrou: number;
  /** % da luta que a pessoa passou morta. */
  fatia: number;
}

const medidas: MorteMedida[] = [];
for (const morte of mortes) {
  const luta = porFight.get(morte.fight);
  if (!luta) continue;
  const duracaoDaLuta = luta.endTime - luta.startTime;
  const sobrou = (luta.endTime - morte.timestamp) / 1000;
  medidas.push({
    nome: atores.get(morte.targetID) ?? `#${morte.targetID}`,
    fightId: morte.fight,
    kill: luta.kill,
    sobrou,
    fatia: duracaoDaLuta > 0 ? ((luta.endTime - morte.timestamp) / duracaoDaLuta) * 100 : 0,
  });
}

console.log(`=== ${medidas.length} mortes em ${bosses.length} trys de boss ===\n`);

console.log("Quanto tempo a luta AINDA durou depois de cada morte:");
const faixas = [
  [0, 5],
  [5, 10],
  [10, 20],
  [20, 45],
  [45, 90],
  [90, 9999],
] as const;
for (const [de, ate] of faixas) {
  const n = medidas.filter((m) => m.sobrou >= de && m.sobrou < ate).length;
  const rotulo = ate === 9999 ? `${de}s ou mais` : `${de}–${ate}s`;
  console.log(`  ${rotulo.padEnd(12)} ${String(n).padStart(4)}  ${"#".repeat(Math.round((n / medidas.length) * 60))}`);
}

console.log("\n=== AS TRYS, UMA A UMA ===");
console.log("try  dur   kill  mortes  quantas nos últimos 10s  (= call de wipe?)");
for (const luta of bosses) {
  const daLuta = medidas.filter((m) => m.fightId === luta.id);
  if (daLuta.length === 0) continue;
  const noFim = daLuta.filter((m) => m.sobrou <= 10).length;
  console.log(
    `${String(luta.id).padStart(3)} ${String(Math.round((luta.endTime - luta.startTime) / 1000) + "s").padStart(5)} ${String(luta.kill).padStart(6)} ${String(daLuta.length).padStart(7)} ${String(noFim).padStart(23)}  ${noFim >= daLuta.length * 0.7 && daLuta.length >= 5 ? "<-- todo mundo junto" : ""}`
  );
}

console.log("\n=== POR JOGADOR: morte crua vs morte que custou ===");
console.log("jogador         mortes  custaram  no fim  tempo morto em luta viva");
const nomes = [...new Set(medidas.map((m) => m.nome))];
const LIMIAR = 10;
for (const nome of nomes.sort()) {
  const suas = medidas.filter((m) => m.nome === nome);
  const custaram = suas.filter((m) => m.sobrou > LIMIAR);
  const segundosMorto = custaram.reduce((soma, m) => soma + m.sobrou, 0);
  console.log(
    `${nome.padEnd(15)} ${String(suas.length).padStart(6)} ${String(custaram.length).padStart(9)} ${String(suas.length - custaram.length).padStart(7)} ${String(Math.round(segundosMorto) + "s").padStart(25)}`
  );
}

console.log("\n=== MORTE EM KILL (o boss caiu sem você) ===");
const emKill = medidas.filter((m) => m.kill && m.sobrou > LIMIAR);
console.log(
  `  ${emKill.length} de ${medidas.length}` +
    (emKill.length > 0 ? ` — ${[...new Set(emKill.map((m) => m.nome))].join(", ")}` : "")
);
