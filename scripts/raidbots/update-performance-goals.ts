import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { DataCollector } from "../../src/services/DataCollector";
import { parseWclProfile } from "../../src/providers/warcraftlogs/normalize";
import { DEFAULT_FIGHT_STYLE, RaidbotsProvider } from "../../src/providers/raidbots/RaidbotsProvider";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

interface RosterPlayer {
  id: string;
  name: string;
  role: "tank" | "healer" | "dps";
  warcraftLogs: { profileUrl: string };
  performanceGoals?: Record<string, unknown>;
  [key: string]: unknown;
}

async function loadRoster(): Promise<RosterPlayer[]> {
  const raw = await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8");
  return JSON.parse(raw);
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? true];
    })
  ) as Record<string, string | boolean>;

  return {
    only: args.only ? String(args.only).split(",").map((id) => id.trim()) : null,
    headed: Boolean(args.headed),
  };
}

async function main() {
  const { only, headed } = parseArgs();
  const roster = await loadRoster();

  // Healer fica de fora da rodada automática.
  //
  // O Quick Sim da Armory mede a spec de DANO do personagem — o alvo do Kams
  // saiu 107954, que é número de Retribution, não de Holy. É régua de um jogo
  // que ele não jogou na noite, e nada consome: Entregar tem peso zero pra
  // healer, porque quem mede a entrega dele é Curar (ver buildHealing).
  //
  // O corte é pelo CADASTRO, não pela função da noite: a Ligiaf é Shadow e
  // curou numa necessidade da noite: cortar por função efetiva tiraria dela a
  // régua que ela usa quando joga do próprio jeito.
  //
  // Pedir explicitamente com --only continua funcionando, pro dia em que um
  // healer virar dps de verdade.
  const elegiveis = only
    ? roster.filter((player) => only.includes(player.id))
    : roster.filter((player) => player.role !== "healer");

  const pulados = only ? [] : roster.filter((player) => player.role === "healer");
  const targets = elegiveis;

  if (targets.length === 0) {
    console.log("Nenhum jogador encontrado para simular.");
    return;
  }

  if (pulados.length > 0) {
    console.log(
      `Pulando ${pulados.length} healer(s) — o Quick Sim mede a spec de dano, e Entregar não pontua pra healer: ${pulados
        .map((player) => player.name)
        .join(", ")}`
    );
    console.log("Pra simular um deles assim mesmo: --only=id1,id2
");
  }

  console.log(`Rodando Quick Sim (Raidbots) para ${targets.length} jogador(es), um de cada vez...`);
  console.log("Isso roda simulações reais na infraestrutura do Raidbots — evite rodar com muita frequência.\n");

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  const raidbots = new RaidbotsProvider();
  const collector = new DataCollector();

  let updated = 0;

  for (const player of targets) {
    let profile;
    try {
      profile = parseWclProfile(player.warcraftLogs.profileUrl);
    } catch {
      console.warn(`Pulando ${player.name}: URL do WarcraftLogs inválida.`);
      continue;
    }
    const region = profile.region.toLowerCase();

    process.stdout.write(`${player.name} (${region}/${profile.realm})... `);

    const [outcome] = await collector.run({
      provider: raidbots,
      context: { page, profile: { region, realm: profile.realm, name: profile.name }, fightStyle: DEFAULT_FIGHT_STYLE },
      rawKey: `quick-sim/${player.id}`,
    });

    if (outcome.status === "error") {
      console.log(`falhou: ${outcome.error}`);
      continue;
    }

    const sim = outcome.result.raw;
    if (sim.status === "unsupported-spec") {
      console.log("pulado (spec de healer não suportada pelo Quick Sim)");
      continue;
    }

    // Quick Sim só mede dps (nunca healing) — sempre rotula como "dps",
    // mesmo pra alguém cadastrado como healer que no momento está numa
    // spec de dano. Ver aviso de spec logo abaixo.
    const target = Math.round(sim.dps);

    player.performanceGoals = {
      ...player.performanceGoals,
      dps: {
        metric: "dps",
        target,
        direction: "higher",
        description: "DPS alvo baseado em simulação",
        source: "Raidbots",
        calculatedAt: new Date().toISOString(),
      },
    };

    console.log(
      `${target} dps (simulado como ${sim.charClass}/${sim.spec}, fight style ${sim.fightStyle}) — ${sim.reportUrl}`
    );

    if (sim.fightStyle !== DEFAULT_FIGHT_STYLE) {
      console.warn(
        `  ATENÇÃO: fight style rodado foi "${sim.fightStyle}", esperado "${DEFAULT_FIGHT_STYLE}". Confira antes de confiar nesse alvo.`
      );
    }

    if (player.role === "healer") {
      console.warn(
        `  ATENÇÃO: ${player.name} está cadastrado como healer, mas o Quick Sim mediu a spec de dano atual (${sim.spec}). Esse alvo de dps não é uma meta de cura.`
      );
    }

    // A Armory sempre simula a spec ATUAL do personagem no jogo, que pode
    // não ser a spec cadastrada no roster.json (ex: personagem trocou de
    // especialização). Confira o class/spec impresso acima antes de
    // confiar no alvo gerado.
    updated += 1;
  }

  await browser.close();

  await writeFile(path.join(ROOT, "data/guild/roster.json"), `${JSON.stringify(roster, null, 2)}\n`);

  console.log(`\ndata/guild/roster.json atualizado: ${updated}/${targets.length} jogador(es) com meta nova.`);
  console.log(
    "Revise o class/spec impresso pra cada um antes de confiar no alvo — a simulação usa a spec atual do personagem no jogo, não a cadastrada no roster."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
