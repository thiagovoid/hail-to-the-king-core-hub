/**
 * Diagnóstico: dá pra saber o que a pessoa tem em cada mão?
 *
 * "Encantou uma espada e a outra não" só é piada quando as DUAS são armas.
 * Arma com escudo, arma com varinha ou arma de duas mãos não têm segundo
 * encanto a esquecer — cobrar isso seria inventar um erro que não existe.
 *
 * A pergunta é se o dado da WCL distingue os três casos, ou se vai precisar
 * de uma consulta ao Wowhead pelo id do item.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import type { WclPlayerDetail } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const fights = await wcl.fetchReportFights(code);
const bosses = fights.filter((fight) => fight.encounterID > 0);
const tabelas = await wcl.fetchFightTables(code, bosses.map((fight) => fight.id));

const detalhes = tabelas.summary.data.playerDetails ?? {};
const jogadores: WclPlayerDetail[] = [
  ...(detalhes.tanks ?? []),
  ...(detalhes.healers ?? []),
  ...(detalhes.dps ?? []),
];

console.log(`=== CAMPOS DE UM ITEM (o que a WCL realmente manda) ===`);
const primeiro = jogadores.find((j) => (j.combatantInfo?.gear ?? []).length > 0);
const exemplo = (primeiro?.combatantInfo?.gear ?? [])[0] as Record<string, unknown> | undefined;
console.log(`  ${Object.keys(exemplo ?? {}).join(", ")}`);
console.log(`  exemplo: ${JSON.stringify(exemplo)}`);

console.log(`\n=== AS DUAS MÃOS, POR JOGADOR ===`);
console.log("jogador         mão principal (slot 15)                 mão secundária (slot 16)");

for (const jogador of jogadores) {
  const gear = (jogador.combatantInfo?.gear ?? []) as Array<Record<string, unknown>>;
  const descreve = (slot: number) => {
    const peca = gear.find((item) => item.slot === slot);
    if (!peca) return "— (vazio)";
    const encantada = Number(peca.permanentEnchant ?? 0) > 0;
    return `#${peca.id} ${encantada ? "COM encanto" : "SEM encanto"}${peca.name ? ` "${peca.name}"` : ""}`;
  };

  console.log(`${jogador.name.padEnd(15)} ${descreve(15).padEnd(40)} ${descreve(16)}`);
}

console.log(`\n=== OS DOIS ANÉIS, POR JOGADOR ===`);
for (const jogador of jogadores) {
  const gear = (jogador.combatantInfo?.gear ?? []) as Array<Record<string, unknown>>;
  const aneis = gear.filter((item) => item.slot === 10 || item.slot === 11);
  const resumo = aneis
    .map((anel) => {
      const encanto = Number(anel.permanentEnchant ?? 0) > 0 ? "encanto" : "sem encanto";
      const gemas = ((anel.gems as unknown[]) ?? []).length;
      return `slot ${anel.slot}: ${encanto}, ${gemas} gema(s)`;
    })
    .join(" | ");
  console.log(`${jogador.name.padEnd(15)} ${resumo || "— sem anel no log"}`);
}

console.log(`\n=== TODOS OS SLOTS DE UM JOGADOR (pra ver o que existe) ===`);
if (primeiro) {
  console.log(`  ${primeiro.name}:`);
  for (const peca of (primeiro.combatantInfo?.gear ?? []) as Array<Record<string, unknown>>) {
    console.log(
      `    slot ${String(peca.slot).padStart(2)}  id ${String(peca.id).padEnd(8)} ` +
        `encanto ${String(peca.permanentEnchant ?? 0).padEnd(8)} gemas ${((peca.gems as unknown[]) ?? []).length}`
    );
  }
}
