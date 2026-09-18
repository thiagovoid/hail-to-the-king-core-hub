/**
 * Diagnóstico: o que a WCL entrega sobre CURA e sobre dano recebido do raide.
 *
 * É o insumo das métricas de healer que ainda não existem: cura fora de spec,
 * e uma nota de cura que não seja "quem curou mais ganha" — curar muito
 * costuma significar que o raide apanhou muito, não que o healer foi melhor.
 *
 * Uso: npm run wcl:inspect-healing -- --report=CODE
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
) as Record<string, string | boolean>;

const code = String(args.report ?? "JCvk27bDL6Zdm18j");
const wcl = new WarcraftLogsProvider();

const { reportData } = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID startTime endTime } } }
  }`,
  { code }
);
const fights = reportData.report.fights.filter((f) => f.encounterID > 0);
const ids = fights.map((f) => f.id);
const duracaoMs = fights.reduce((s, f) => s + (f.endTime - f.startTime), 0);

const tabelas = await wcl.fetchFightTables(code, ids);

const cura = tabelas.healing.data.entries as unknown as Array<Record<string, unknown>>;
console.log(`CURA: ${cura.length} entradas`);
console.log(`campos: ${Object.keys(cura[0] ?? {}).join(", ")}`);

const dano = tabelas.damage.data.entries as unknown as Array<Record<string, unknown>>;
const recebido = await wcl.fetchDamageTaken(code, ids);
const danoTotalDoRaide = recebido.reduce((s, e) => s + (e.total ?? 0), 0);

console.log("");
console.log(`dano total recebido pelo raide na noite: ${danoTotalDoRaide.toLocaleString("pt-BR")}`);
console.log(`duração somada das trys: ${Math.round(duracaoMs / 1000)}s`);
console.log("");
console.log("jogador          curou        overheal   % desperd.  cobertura   dano causado");

const porNome = new Map(dano.map((e) => [String(e.name), Number(e.total ?? 0)]));

for (const e of cura.sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))) {
  const curou = Number(e.total ?? 0);
  const over = Number(e.overheal ?? 0);
  const bruto = curou + over;
  const desperdicio = bruto > 0 ? (over / bruto) * 100 : 0;
  const cobertura = danoTotalDoRaide > 0 ? (curou / danoTotalDoRaide) * 100 : 0;
  const causou = porNome.get(String(e.name)) ?? 0;

  console.log(
    `${String(e.name).padEnd(16)} ${curou.toLocaleString("pt-BR").padStart(12)} ${over.toLocaleString("pt-BR").padStart(12)} ${desperdicio.toFixed(1).padStart(8)}% ${cobertura.toFixed(1).padStart(9)}% ${causou.toLocaleString("pt-BR").padStart(14)}`
  );
}
