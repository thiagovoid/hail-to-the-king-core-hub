/**
 * Diagnóstico: o que existe de dado nas lutas de TRASH.
 *
 * O coletor só olha fight com encounterID > 0 — ou seja, boss. A pergunta é
 * se o trash entre bosses tem dado suficiente pra dizer quem participou e
 * quem foi fazer outra coisa.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const { reportData } = await wclGraphql<{
  reportData: { report: { fights: WclFight[]; startTime: number; endTime: number } };
}>(
  `query($code: String!) {
    reportData { report(code: $code) { startTime endTime fights { id name encounterID kill startTime endTime } } }
  }`,
  { code }
);

const todas = reportData.report.fights;
const boss = todas.filter((f) => f.encounterID > 0);
const trash = todas.filter((f) => f.encounterID === 0);

const soma = (lista: WclFight[]) => lista.reduce((s, f) => s + (f.endTime - f.startTime), 0);
const duracaoTotal = reportData.report.endTime - reportData.report.startTime;

console.log(`fights no relatório: ${todas.length} (${boss.length} de boss, ${trash.length} de trash)`);
console.log(`tempo em boss:  ${Math.round(soma(boss) / 60000)} min`);
console.log(`tempo em trash: ${Math.round(soma(trash) / 60000)} min`);
console.log(`duração do log: ${Math.round(duracaoTotal / 60000)} min`);
console.log(
  `tempo FORA de combate: ${Math.round((duracaoTotal - soma(boss) - soma(trash)) / 60000)} min`
);

if (trash.length === 0) {
  console.log("\nNenhum trash registrado — o log pode ter sido gravado só nos bosses.");
} else {
  console.log("\nprimeiras lutas de trash:");
  trash.slice(0, 6).forEach((f) =>
    console.log(`  #${f.id} "${f.name}" — ${Math.round((f.endTime - f.startTime) / 1000)}s`)
  );

  const ids = trash.map((f) => f.id);
  const tabelas = await wcl.fetchFightTables(code, ids);
  const dano = tabelas.damage.data.entries;
  const totalTrash = dano.reduce((s, e) => s + (e.total ?? 0), 0);

  console.log(`\nDANO NO TRASH: ${dano.length} jogadores, ${totalTrash.toLocaleString("pt-BR")} total`);
  console.log("jogador          dano no trash   % do raide   tempo ativo");
  [...dano]
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .forEach((e) => {
      const parte = totalTrash > 0 ? ((e.total ?? 0) / totalTrash) * 100 : 0;
      console.log(
        `${String(e.name).padEnd(16)} ${(e.total ?? 0).toLocaleString("pt-BR").padStart(13)} ${parte.toFixed(1).padStart(10)}% ${Math.round((e.activeTime ?? 0) / 1000)}s`
      );
    });
}
