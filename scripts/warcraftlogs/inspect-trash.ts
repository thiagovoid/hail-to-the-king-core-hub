/**
 * Diagnóstico: dá pra pegar quem some entre um boss e outro?
 *
 * Duas hipóteses testadas aqui:
 *  1. dano no trash — quem não bate no trash estava fazendo outra coisa;
 *  2. presença na try — quem estava na anterior e na seguinte, mas faltou
 *     nesta, perdeu a pull. É o sinal de "voltei tarde do banheiro".
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

interface FightSonda {
  id: number;
  name: string;
  encounterID: number;
  startTime: number;
  endTime: number;
  friendlyPlayers: number[] | null;
}

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";
const wcl = new WarcraftLogsProvider();

const { reportData } = await wclGraphql<{
  reportData: {
    report: {
      startTime: number;
      endTime: number;
      fights: FightSonda[];
      masterData: { actors: { id: number; name: string; type: string }[] };
    };
  };
}>(
  `query($code: String!) {
    reportData { report(code: $code) {
      startTime endTime
      fights { id name encounterID startTime endTime friendlyPlayers }
      masterData { actors(type: "Player") { id name type } }
    } }
  }`,
  { code }
);

const { fights, masterData } = reportData.report;
const nomeDe = new Map(masterData.actors.map((a) => [a.id, a.name]));
const bosses = fights.filter((f) => f.encounterID > 0);

console.log(`=== PRESENÇA POR TRY (${bosses.length} trys de boss) ===\n`);

const perdidas = new Map<string, { trys: string[]; presentes: number }>();

bosses.forEach((fight, indice) => {
  const presentes = new Set(fight.friendlyPlayers ?? []);
  const anterior = new Set(bosses[indice - 1]?.friendlyPlayers ?? []);
  const seguinte = new Set(bosses[indice + 1]?.friendlyPlayers ?? []);

  // Quem estava antes E depois, mas não nesta: não deslogou, só não desceu.
  const faltaram = [...anterior].filter((id) => !presentes.has(id) && seguinte.has(id));

  console.log(
    `try ${indice + 1} — ${fight.name}: ${presentes.size} jogadores` +
      (faltaram.length ? ` · FALTOU: ${faltaram.map((id) => nomeDe.get(id) ?? id).join(", ")}` : "")
  );

  for (const id of faltaram) {
    const nome = nomeDe.get(id) ?? String(id);
    const registro = perdidas.get(nome) ?? { trys: [], presentes: 0 };
    registro.trys.push(`${fight.name} #${indice + 1}`);
    perdidas.set(nome, registro);
  }
});

console.log("\n=== PULLS PERDIDAS NA NOITE ===");
if (perdidas.size === 0) {
  console.log("Ninguém perdeu pull entre trys nesta noite.");
} else {
  [...perdidas.entries()]
    .sort((a, b) => b[1].trys.length - a[1].trys.length)
    .forEach(([nome, r]) => console.log(`${nome.padEnd(14)} ${r.trys.length}x — ${r.trys.join("; ")}`));
}

// --- tempo morto entre trys: é aí que o AFK mora, não no trash ---
console.log("\n=== INTERVALOS ENTRE TRYS (> 3 min) ===");
fights
  .filter((f) => f.encounterID > 0)
  .forEach((fight, indice, lista) => {
    const anterior = lista[indice - 1];
    if (!anterior) return;
    const parado = fight.startTime - anterior.endTime;
    if (parado > 180_000) {
      console.log(
        `${Math.round(parado / 60000)} min parado antes de "${fight.name}" (try ${indice + 1})`
      );
    }
  });

// --- checa se o trash cobre esse tempo parado ---
const trash = fights.filter((f) => f.encounterID === 0);
console.log(`\n=== O TRASH COBRE O TEMPO PARADO? ===`);
console.log(
  `trash: ${trash.length} lutas, ${Math.round(trash.reduce((s, f) => s + (f.endTime - f.startTime), 0) / 60000)} min`
);

if (trash.length > 0) {
  const tabelas = await wcl.fetchFightTables(code, trash.map((f) => f.id));
  const comDano = new Set(tabelas.damage.data.entries.map((e) => e.name));
  const ausentes = masterData.actors.filter((a) => !comDano.has(a.name));
  console.log(
    `jogadores no log: ${masterData.actors.length} · com dano no trash: ${comDano.size} · ZERO dano no trash: ${ausentes.length}`
  );
  if (ausentes.length > 0) console.log(`  ${ausentes.map((a) => a.name).join(", ")}`);
}
