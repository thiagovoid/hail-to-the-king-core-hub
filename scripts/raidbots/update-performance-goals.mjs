import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// O Raidbots não tem API pra rodar simulação sob demanda — isso automatiza
// o próprio Quick Sim do site (raidbots.com/simbot/quick) via navegador.
// Roda UM personagem de cada vez, de propósito: é um serviço gratuito
// mantido por eles, então evitamos qualquer coisa parecida com abuso.
function parseWclProfile(profileUrl) {
  const match = profileUrl.match(/character\/([a-z]+)\/([a-z0-9-]+)\/(.+)$/i);
  if (!match) {
    throw new Error(`URL de perfil do WarcraftLogs inválida: ${profileUrl}`);
  }
  const [, region, realm, name] = match;
  return { region: region.toLowerCase(), realm, name: decodeURIComponent(name) };
}

async function loadRoster() {
  const raw = await readFile(path.join(ROOT, 'data/roster.json'), 'utf-8');
  return JSON.parse(raw);
}

class SkipError extends Error {}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    })
  );

  return {
    only: args.only ? String(args.only).split(',').map((id) => id.trim()) : null,
    headed: Boolean(args.headed),
  };
}

// "Patchwerk" (padrão) é parado, sem movimento — dá um dps mais alto que
// o real em raid. "Heavy Movement" se aproxima mais do que a galera
// realmente bate em boss, então a meta fica mais alcançável/motivadora.
const FIGHT_STYLE = 'HeavyMovement';

async function runQuickSim(page, profile) {
  const url = `https://www.raidbots.com/simbot/quick?region=${profile.region}&realm=${encodeURIComponent(profile.realm)}&name=${encodeURIComponent(profile.name)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Confirma que o personagem carregou da Armory antes de rodar.
  await page.waitForSelector('text=SimC Export', { timeout: 30_000 });

  // O Quick Sim não simula specs de healer (mostra "Unsupported Spec" e
  // não roda de verdade) — não é limitação nossa, é da ferramenta.
  if (await page.locator('text=Unsupported Spec').count() > 0) {
    throw new SkipError('spec de healer não suportada pelo Quick Sim');
  }

  // O <select> de fight style só existe no DOM com a seção "Simulation
  // Options" expandida (ela desmonta o conteúdo quando fechada). O Raidbots
  // lembra esse estado (aberto/fechado) via localStorage entre navegações
  // na mesma página — por isso só clica se estiver mesmo fechada, em vez
  // de simplesmente "clicar pra abrir" (isso alternava aberto/fechado).
  const fightStyleSelector = '#AdvancedSimOptions-fightStyle';
  const alreadyExpanded = await page.locator(fightStyleSelector).count() > 0;
  if (!alreadyExpanded) {
    await page.click('text=Simulation Options:');
  }
  await page.waitForSelector(fightStyleSelector, { timeout: 15_000 });
  await page.selectOption(fightStyleSelector, FIGHT_STYLE);

  await page.click('text=Run Quick Sim');
  await page.waitForURL(/\/simbot\/report\//, { timeout: 30_000 });

  const reportUrl = page.url();
  const dataUrl = `${reportUrl.replace(/\/$/, '')}/data.json`;
  const deadline = Date.now() + 3 * 60 * 1000;

  while (Date.now() < deadline) {
    const response = await page.request.get(dataUrl);
    if (response.ok()) {
      const json = await response.json();
      const simPlayer = json?.sim?.players?.[0];
      if (simPlayer?.collected_data?.dps) {
        return {
          value: simPlayer.collected_data.dps.mean,
          spec: json.simbot?.spec,
          charClass: json.simbot?.charClass,
          fightStyle: json.simbot?.fightStyle,
          reportUrl,
        };
      }
    }
    await page.waitForTimeout(5000);
  }

  throw new Error(`Timeout esperando a simulação de ${profile.name} terminar.`);
}

async function main() {
  const { only, headed } = parseArgs();
  const roster = await loadRoster();
  const targets = only ? roster.filter((player) => only.includes(player.id)) : roster;

  if (targets.length === 0) {
    console.log('Nenhum jogador encontrado para simular.');
    return;
  }

  console.log(`Rodando Quick Sim (Raidbots) para ${targets.length} jogador(es), um de cada vez...`);
  console.log('Isso roda simulações reais na infraestrutura do Raidbots — evite rodar com muita frequência.\n');

  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();

  let updated = 0;

  for (const player of targets) {
    const profile = parseWclProfile(player.warcraftLogs.profileUrl);
    process.stdout.write(`${player.name} (${profile.region}/${profile.realm})... `);

    try {
      const result = await runQuickSim(page, profile);
      // Quick Sim só mede dps (nunca healing) — sempre rotula como "dps",
      // mesmo pra alguém cadastrado como healer que no momento está numa
      // spec de dano. Ver aviso de spec logo abaixo.
      const target = Math.round(result.value);

      player.performanceGoals = {
        ...player.performanceGoals,
        dps: {
          metric: 'dps',
          target,
          direction: 'higher',
          description: 'DPS alvo baseado em simulação',
          source: 'Raidbots',
          calculatedAt: new Date().toISOString(),
        },
      };

      console.log(`${target} dps (simulado como ${result.charClass}/${result.spec}, fight style ${result.fightStyle}) — ${result.reportUrl}`);

      if (result.fightStyle !== FIGHT_STYLE) {
        console.warn(`  ATENÇÃO: fight style rodado foi "${result.fightStyle}", esperado "${FIGHT_STYLE}". Confira antes de confiar nesse alvo.`);
      }

      if (player.role === 'healer') {
        console.warn(`  ATENÇÃO: ${player.name} está cadastrado como healer, mas o Quick Sim mediu a spec de dano atual (${result.spec}). Esse alvo de dps não é uma meta de cura.`);
      }

      // A Armory sempre simula a spec ATUAL do personagem no jogo, que pode
      // não ser a spec cadastrada no roster.json (ex: personagem trocou de
      // especialização). Confira o class/spec impresso acima antes de
      // confiar no alvo gerado.
      updated += 1;
    } catch (error) {
      if (error instanceof SkipError) {
        console.log(`pulado (${error.message})`);
        continue;
      }
      console.log(`falhou: ${error.message}`);
    }
  }

  await browser.close();

  await writeFile(
    path.join(ROOT, 'data/roster.json'),
    `${JSON.stringify(roster, null, 2)}\n`
  );

  console.log(`\ndata/roster.json atualizado: ${updated}/${targets.length} jogador(es) com meta nova.`);
  console.log('Revise o class/spec impresso pra cada um antes de confiar no alvo — a simulação usa a spec atual do personagem no jogo, não a cadastrada no roster.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
