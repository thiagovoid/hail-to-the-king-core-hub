/**
 * Diagnóstico: por que um jogador ficou sem cooldown ofensivo medido?
 *
 * A nota de "Atacar" descarta habilidade em três momentos — recarga curta
 * demais pro Wowhead considerar cooldown, categoria errada no tooltip, e
 * participação no dano abaixo do piso. Sem ver os três juntos não dá pra
 * saber qual deles comeu a habilidade, e o palpite erra.
 *
 * Uso: npm run wcl:inspect-cooldowns -- --report=CODE --player=gunst
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WarcraftLogsProvider } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";
import {
  buildDamageShares,
  categoriaEfetiva,
  contaParaNota,
  type UsoDeCooldown,
} from "../../src/providers/warcraftlogs/cooldownUsage";
import {
  CATALOGO_VAZIO,
  catalogToMap,
  type CooldownCatalogFile,
} from "../../src/providers/wowhead/cooldownCatalog";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEASON_SLUG = "midnight-s2";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [chave, valor] = arg.replace(/^--/, "").split("=");
    return [chave, valor ?? true];
  })
) as Record<string, string | boolean>;

const code = String(args.report ?? "");
const filtro = String(args.player ?? "").toLowerCase();
if (!code) throw new Error("Informe --report=CODE");

const wcl = new WarcraftLogsProvider();

/** Só os campos que contaParaNota olha importam aqui. */
const vazio: UsoDeCooldown = {
  spellId: 0,
  name: "",
  kind: "offensive",
  casts: 0,
  timeOnCooldownMs: 0,
  possibleMs: 0,
  efficiency: 0,
};

let catalogo: CooldownCatalogFile = CATALOGO_VAZIO;
try {
  catalogo = JSON.parse(
    await readFile(path.join(ROOT, "data/seasons", SEASON_SLUG, "cooldown-catalog.json"), "utf8")
  ) as CooldownCatalogFile;
} catch {
  console.log("Catálogo ainda não existe — rode a coleta antes.");
}
const magias = catalogToMap(catalogo);
const ignoradas = new Set(catalogo.ignored ?? []);

const fights = (await wcl.fetchReportFights(code)).filter((f: WclFight) => f.encounterID > 0);
const atores = (await wcl.fetchActorNames(code)).atores;
const eventos = await wcl.fetchCastEvents(code, fights);

const alvos = [...atores.entries()].filter(([, nome]) => !filtro || nome.toLowerCase().includes(filtro));
if (alvos.length === 0) throw new Error(`Nenhum jogador casa com "${filtro}"`);

const danoRecebido = new Map(
  (await wcl.fetchDamageTaken(code, fights.map((f) => f.id))).map((e) => [e.id ?? -1, e])
);

const duracaoMs = fights.reduce((soma, f) => soma + (f.endTime - f.startTime), 0);

const shares = buildDamageShares(
  await wcl.fetchDamageAbilities(code, fights.map((f) => f.id), alvos.map(([id]) => id))
);

for (const [sourceID, nome] of alvos) {
  const meus = eventos.filter((evento) => evento.sourceID === sourceID);
  if (meus.length === 0) continue;

  const porMagia = new Map<number, number>();
  for (const evento of meus) porMagia.set(evento.abilityGameID, (porMagia.get(evento.abilityGameID) ?? 0) + 1);

  const meusShares = shares.get(sourceID);

  console.log("");
  console.log(`=== ${nome} (ator ${sourceID}) — ${meus.length} casts, ${porMagia.size} magias distintas ===`);
  console.log("   veredito      magia                            casts   recarga  % do dano");

  const linhas: Array<[string, string]> = [];
  for (const [spellId, casts] of porMagia) {
    const magia = magias.get(spellId);
    if (!magia) {
      // Só interessa o que o Wowhead disse que NÃO é cooldown: o resto é
      // rotação, e listar 180 magias de preenchimento esconde o que importa.
      if (ignoradas.has(spellId)) linhas.push(["sem recarga", `   ${String(spellId).padEnd(9)} (rotação)`]);
      continue;
    }

    const share = meusShares?.get(magia.name.trim().toLowerCase());
    const efetiva = categoriaEfetiva(magia.kind, magia.cooldownMs, share);
    const entra =
      efetiva === "defensive" ||
      (efetiva === "offensive" &&
        contaParaNota({ ...vazio, kind: efetiva, damageShare: share }, magia.cooldownMs, true));

    const veredito = !entra
      ? efetiva === "utility"
        ? "DESCARTADA"
        : "pouco dano"
      : efetiva === "offensive"
        ? "ATACAR"
        : "defender";

    const promovida = efetiva !== magia.kind ? ` (era ${magia.kind})` : "";
    linhas.push([
      veredito,
      `   ${veredito.padEnd(13)} ${(magia.name + promovida).padEnd(32)} ${String(casts).padStart(5)}   ${String(magia.cooldownMs / 1000).padStart(5)}s   ${share === undefined ? "  ausente" : share.toFixed(2).padStart(7) + "%"}`,
    ]);
  }

  const ordem = ["ATACAR", "defender", "pouco dano", "DESCARTADA", "sem recarga"];
  linhas
    .sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]))
    .filter(([veredito]) => veredito !== "sem recarga")
    .forEach(([, linha]) => console.log(linha));

  const semRecarga = linhas.filter(([v]) => v === "sem recarga").length;
  console.log(`   (${semRecarga} magia(s) sem recarga suficiente pro Wowhead considerar cooldown)`);

  const recebido = danoRecebido.get(sourceID);
  if (recebido) {
    const tomado = recebido.total ?? 0;
    const cortado = recebido.totalReduced ?? 0;
    const vinha = tomado + cortado;
    console.log("");
    console.log(
      `   dano recebido: ${tomado.toLocaleString("pt-BR")} tomado | ${cortado.toLocaleString("pt-BR")} cortado` +
        ` | ${vinha > 0 ? ((cortado / vinha) * 100).toFixed(1) : "0"}% mitigado` +
        ` | ${Math.round(tomado / (duracaoMs / 1000)).toLocaleString("pt-BR")} DTPS`
    );
  }

  console.log("");
  console.log("   maiores fontes de dano do jogador:");
  for (const [habilidade, parte] of [...(meusShares ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`     ${habilidade.padEnd(34)} ${parte.toFixed(2).padStart(6)}%`);
  }
}
