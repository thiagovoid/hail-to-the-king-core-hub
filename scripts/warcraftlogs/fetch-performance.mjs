import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wclGraphql } from './client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const GUILD_NAME = 'Hail to the King';
const GUILD_SERVER_SLUG = 'nemesis';
const GUILD_SERVER_REGION = 'US';

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

// Brasília não observa horário de verão desde 2019: offset fixo -03:00.
// Necessário porque o core raida à noite e o timestamp UTC do report
// costuma cair no dia seguinte (ex: raid 27/08 21:30 BRT = 28/08 00:30 UTC).
const BRAZIL_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

function toBrazilDateString(timestampMs) {
  return new Date(timestampMs + BRAZIL_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    })
  );

  if (!args.week) {
    throw new Error(
      'Uso: node fetch-performance.mjs --week=3 [--days=7] [--start=2026-08-18 --end=2026-08-19] [--reports=codigo1,codigo2] [--discover-characters]'
    );
  }

  return {
    week: Number(args.week),
    days: Number(args.days ?? 7),
    start: args.start ? new Date(args.start).getTime() : undefined,
    end: args.end ? new Date(args.end).getTime() : undefined,
    extraReportCodes: args.reports
      ? String(args.reports).split(',').map((code) => code.trim()).filter(Boolean)
      : [],
    // Desligado por padrão: reports sem guild marcada às vezes são cópias
    // duplicadas da mesma sessão (várias pessoas subindo o próprio log).
    // Usar só como investigação pontual, revisando o resultado antes de commitar.
    discoverByCharacter: Boolean(args['discover-characters']),
  };
}

function parseWclProfile(profileUrl) {
  const match = profileUrl.match(/character\/([a-z]+)\/([a-z0-9-]+)\/(.+)$/i);
  if (!match) {
    throw new Error(`URL de perfil do WarcraftLogs inválida: ${profileUrl}`);
  }
  const [, region, realm, name] = match;
  return { region: region.toUpperCase(), realm, name: decodeURIComponent(name) };
}

async function loadRoster() {
  const raw = await readFile(path.join(ROOT, 'data/roster.json'), 'utf-8');
  return JSON.parse(raw);
}

async function resolveGuildId() {
  const data = await wclGraphql(
    `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      guildData {
        guild(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          id
        }
      }
    }`,
    { name: GUILD_NAME, serverSlug: GUILD_SERVER_SLUG, serverRegion: GUILD_SERVER_REGION }
  );
  return data.guildData.guild.id;
}

async function fetchRaidEncounterIds() {
  const data = await wclGraphql(
    `query($zoneID: Int!) {
      worldData {
        zone(id: $zoneID) {
          encounters { id }
        }
      }
    }`,
    { zoneID: RAID_ZONE_ID }
  );
  return new Set(data.worldData.zone.encounters.map((encounter) => encounter.id));
}

async function fetchGuildReports(guildId, startTime, endTime) {
  const data = await wclGraphql(
    `query($guildID: Int!, $startTime: Float, $endTime: Float) {
      reportData {
        reports(guildID: $guildID, startTime: $startTime, endTime: $endTime) {
          data { code startTime zone { id } }
        }
      }
    }`,
    { guildID: guildId, startTime, endTime }
  );
  return data.reportData.reports.data.filter((report) => report.zone?.id === RAID_ZONE_ID);
}

// Reports de contas de upload conhecidas (WCL_UPLOADER_USER_IDS no .env).
// Pega reports dessas contas mesmo quando ninguém marcou a guild no upload —
// é preciso (só o que a conta subiu) e não corre o risco de duplicata que a
// descoberta por personagem tem.
function getUploaderUserIds() {
  return (process.env.WCL_UPLOADER_USER_IDS ?? '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function fetchUserReports(userID, startTime, endTime) {
  const data = await wclGraphql(
    `query($userID: Int!, $startTime: Float, $endTime: Float, $zoneID: Int) {
      reportData {
        reports(userID: $userID, startTime: $startTime, endTime: $endTime, zoneID: $zoneID) {
          data { code startTime zone { id } }
        }
      }
    }`,
    { userID, startTime, endTime, zoneID: RAID_ZONE_ID }
  );
  return data.reportData.reports.data;
}

// Reforço manual para reports que não ficaram vinculados à guild no WCL
// (ex: quem subiu o log esqueceu de marcar a guild) e por isso não aparecem
// na busca por guildID acima.
async function fetchReportMeta(code) {
  const data = await wclGraphql(
    `query($code: String!) {
      reportData {
        report(code: $code) {
          code
          startTime
          zone { id }
        }
      }
    }`,
    { code }
  );
  return data.reportData.report;
}

// Descobre reports pela presença do personagem, não pela guild marcada no
// upload — cobre reports pessoais/unlisted, que não aparecem em nenhuma
// busca por guildID/userID. O dono (owner.id) vem junto pra podermos
// confiar só em reports de contas conhecidas (WCL_UPLOADER_USER_IDS),
// mesmo variando qual personagem do roster aparece na busca.
async function fetchCharacterRecentReports(profile) {
  const data = await wclGraphql(
    `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          recentReports(limit: 20) {
            data { code startTime zone { id } owner { id } }
          }
        }
      }
    }`,
    { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region }
  );
  return data.characterData.character?.recentReports?.data ?? [];
}

async function fetchReportFights(code) {
  const data = await wclGraphql(
    `query($code: String!) {
      reportData {
        report(code: $code) {
          fights { id encounterID name kill difficulty startTime endTime }
        }
      }
    }`,
    { code }
  );
  return data.reportData.report.fights;
}

// Passar vários fightIDs agrega os dados (soma total, soma activeTime) —
// é assim que a própria WCL calcula a aba "All Kills" do report.
async function fetchFightTables(code, fightIDs) {
  const data = await wclGraphql(
    `query($code: String!, $fightIDs: [Int]) {
      reportData {
        report(code: $code) {
          damage: table(fightIDs: $fightIDs, dataType: DamageDone)
          healing: table(fightIDs: $fightIDs, dataType: Healing)
          summary: table(fightIDs: $fightIDs, dataType: Summary)
        }
      }
    }`,
    { code, fightIDs }
  );
  return data.reportData.report;
}

async function fetchEncounterRankings(profile, encounterID, metric) {
  const data = await wclGraphql(
    `query($name: String!, $serverSlug: String!, $serverRegion: String!, $encounterID: Int!, $metric: CharacterRankingMetricType) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          encounterRankings(encounterID: $encounterID, metric: $metric)
        }
      }
    }`,
    {
      name: profile.name,
      serverSlug: profile.realm,
      serverRegion: profile.region,
      encounterID,
      metric,
    }
  );
  return data.characterData.character?.encounterRankings;
}

// Nomes de personagem são comparados sem diferenciar maiúsculas/minúsculas:
// o roster.json às vezes tem a URL do WCL com a capitalização errada, mas a
// identidade do personagem é a mesma independente disso.
function sameCharacterName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function countDeaths(deathEvents, characterName) {
  return deathEvents.filter((event) => sameCharacterName(event.name, characterName)).length;
}

// "DeathKnight" -> "death-knight", "Warrior" -> "warrior"
function classNameToSlug(className) {
  return className
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function slugifyId(name, existingIds) {
  const base = name.toLowerCase();
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

// A WCL não tem raça (não é dado de combate); o Raider.io tem API pública
// gratuita com esse dado, junto com uma URL de avatar pronta.
const RACE_TRANSLATIONS = {
  Human: 'Humano',
  Dwarf: 'Anão',
  'Night Elf': 'Elfo da Noite',
  Gnome: 'Gnomo',
  Draenei: 'Draenei',
  Worgen: 'Worgen',
  'Void Elf': 'Elfo Vazio',
  'Lightforged Draenei': 'Draenei Iluminado',
  'Dark Iron Dwarf': 'Anão Ferro Negro',
  'Kul Tiran': 'Kul Tiran',
  Mechagnome: 'Mecagnomo',
  Orc: 'Orc',
  Undead: 'Renegado',
  Tauren: 'Tauren',
  Troll: 'Troll',
  'Blood Elf': 'Elfo Sangrento',
  Goblin: 'Goblin',
  Nightborne: 'Nightborne',
  'Highmountain Tauren': 'Tauren das Terras Altas',
  "Mag'har Orc": "Orc Mag'har",
  'Zandalari Troll': 'Troll Zandalari',
  Vulpera: 'Vulpera',
  Pandaren: 'Pandaren',
  Dracthyr: 'Dracthyr',
  Earthen: 'Terrestre',
};

async function fetchRaiderIoProfile(region, realm, name) {
  const url = `https://raider.io/api/v1/characters/profile?region=${encodeURIComponent(region)}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Monta um rascunho de entrada pro roster.json com o que a WCL e o Raider.io
// sabem (nome, classe, spec, role, servidor, raça, avatar). Campos que
// nenhuma API tem (discord, heroSpec, type main/alt) ficam vazios pra
// alguém completar depois. "spec" fica em inglês (como a WCL retorna) —
// precisa traduzir pro português ao revisar.
async function buildRosterDraft(character, existingIds) {
  const region = character.region.toLowerCase();
  const realm = character.server.toLowerCase().replace(/\s+/g, '-');
  const profileSlug = encodeURIComponent(character.name);

  const raiderIoProfile = await fetchRaiderIoProfile(region, realm, character.name);
  const race = raiderIoProfile?.race ? (RACE_TRANSLATIONS[raiderIoProfile.race] ?? raiderIoProfile.race) : '';
  const avatar = raiderIoProfile?.thumbnail_url ?? '';

  return {
    id: slugifyId(character.name, existingIds),
    name: character.name,
    class: classNameToSlug(character.class),
    race,
    spec: character.spec,
    heroSpec: '',
    role: character.role,
    type: '',
    discord: '',
    avatar,
    raiderIo: {
      io: null,
      bestDungeon: null,
      highestKey: null,
      realmRank: null,
      profileUrl: `https://raider.io/characters/${region}/${realm}/${profileSlug}`,
    },
    warcraftLogs: {
      avgParse: null,
      bestParse: null,
      attendance: null,
      profileUrl: `https://www.warcraftlogs.com/character/${region}/${realm}/${profileSlug}`,
    },
    externalLinks: {
      raiderIo: `https://raider.io/characters/${region}/${realm}/${profileSlug}`,
      raidbots: '',
      archon: '',
      warcraftLogs: '',
      wipefest: '',
    },
  };
}

async function main() {
  const { week, days, start, end, extraReportCodes, discoverByCharacter } = parseArgs();
  const roster = await loadRoster();

  const endTime = end ?? Date.now();
  const startTime = start ?? endTime - days * 24 * 60 * 60 * 1000;

  console.log(`Buscando reports entre ${new Date(startTime).toISOString()} e ${new Date(endTime).toISOString()}...`);

  const [guildId, validEncounterIds] = await Promise.all([
    resolveGuildId(),
    fetchRaidEncounterIds(),
  ]);

  const guildReports = await fetchGuildReports(guildId, startTime, endTime);

  const extraReports = [];
  for (const code of extraReportCodes) {
    if (guildReports.some((report) => report.code === code)) continue;
    const meta = await fetchReportMeta(code);
    if (meta?.zone?.id === RAID_ZONE_ID) extraReports.push(meta);
  }

  const uploaderUserIds = getUploaderUserIds();
  const uploaderReports = [];
  for (const userID of uploaderUserIds) {
    const userReports = await fetchUserReports(userID, startTime, endTime);
    uploaderReports.push(...userReports);
  }

  const reportsByCode = new Map();
  for (const report of [...guildReports, ...uploaderReports, ...extraReports]) {
    reportsByCode.set(report.code, report);
  }

  // Descoberta por personagem: acha reports pessoais/unlisted que nenhuma
  // busca por guildID/userID enxerga. Um report só é aceito automaticamente
  // se o dono for uma conta confiável (WCL_UPLOADER_USER_IDS) — assim
  // continuamos usando logs pessoais do Thiago sem ele precisar marcar
  // guild nem mudar visibilidade, e sem risco de puxar log de outra pessoa.
  const trustedUploaderIds = new Set(uploaderUserIds);
  const trustedDiscovered = [];
  const untrustedDiscovered = [];

  if (trustedUploaderIds.size > 0 || discoverByCharacter) {
    for (const player of roster) {
      const profile = parseWclProfile(player.warcraftLogs.profileUrl);
      const playerReports = await fetchCharacterRecentReports(profile);

      for (const report of playerReports) {
        if (report.zone?.id !== RAID_ZONE_ID) continue;
        if (report.startTime < startTime || report.startTime > endTime) continue;
        if (reportsByCode.has(report.code)) continue;
        if (trustedDiscovered.some((r) => r.code === report.code)) continue;
        if (untrustedDiscovered.some((r) => r.code === report.code)) continue;

        if (report.owner?.id && trustedUploaderIds.has(report.owner.id)) {
          trustedDiscovered.push(report);
        } else if (discoverByCharacter) {
          untrustedDiscovered.push(report);
        }
      }
    }
  }

  for (const report of [...trustedDiscovered, ...untrustedDiscovered]) {
    reportsByCode.set(report.code, report);
  }

  const reports = [...reportsByCode.values()];
  console.log(
    `${reports.length} report(s) de raid encontrados (${guildReports.length} pela guild, ${uploaderReports.length} por conta de upload conhecida, ${extraReports.length} manuais, ${trustedDiscovered.length} descobertos de contas confiáveis, ${untrustedDiscovered.length} descobertos de contas não verificadas).`
  );

  if (untrustedDiscovered.length > 0) {
    console.warn(
      'Atenção: reports de contas não verificadas incluídos (--discover-characters). Confirme que não são cópias duplicadas de outra pessoa antes de usar esses dados (pode contar mortes em dobro).'
    );
  }

  // Um report = uma run (uma noite de raid). A semana pode ter várias runs
  // (terça, quinta, ...); cada uma fica isolada, sem misturar dados entre si.
  const runsByReportCode = new Map();
  const seenCharacters = new Map(); // nome WCL -> { name, class, spec, role, server, region }

  for (const report of reports) {
    const allFights = await fetchReportFights(report.code);
    const raidFights = allFights.filter(
      (fight) => validEncounterIds.has(fight.encounterID)
    );

    if (raidFights.length === 0) continue;

    const killedFights = raidFights.filter((fight) => fight.kill);
    const hasKills = killedFights.length > 0;

    // dps/hps/itemLevel agregam os kills da run (soma total, soma
    // activeTime) — é exatamente o que a WCL mostra na aba "All Kills" do
    // report. Numa noite 100% wipe (sem nenhum kill), agregamos os wipes
    // no lugar, já que não existe "All Kills" pra comparar nesse caso.
    const aggregateFights = hasKills ? killedFights : raidFights;
    const aggregateFightIds = aggregateFights.map((fight) => fight.id);
    const allFightIds = raidFights.map((fight) => fight.id);

    // dps/hps = soma do dano / soma da duração dos fights agregados — não
    // o activeTime do jogador (que é menor que a duração do fight sempre
    // que ele morre ou fica parado, e infla o número). É essa duração,
    // não o activeTime, que a WCL usa pra calcular o que mostra na tela.
    const aggregateDurationMs = aggregateFights.reduce(
      (sum, fight) => sum + (fight.endTime - fight.startTime),
      0
    );

    const aggregateTables = await fetchFightTables(report.code, aggregateFightIds);
    // Mortes e composição sempre olham pra run inteira (kills + wipes),
    // mesmo quando o dps/hps agregado é só dos kills.
    const fullTables =
      aggregateFightIds.length === allFightIds.length
        ? aggregateTables
        : await fetchFightTables(report.code, allFightIds);

    const deathEvents = fullTables.summary.data.deathEvents ?? [];
    const playerDetails = fullTables.summary.data.playerDetails ?? {};
    const damageEntries = aggregateTables.damage.data.entries ?? [];
    const healingEntries = aggregateTables.healing.data.entries ?? [];

    for (const [role, list] of [
      ['tank', playerDetails.tanks],
      ['dps', playerDetails.dps],
      ['healer', playerDetails.healers],
    ]) {
      for (const member of list ?? []) {
        if (!seenCharacters.has(member.name)) {
          seenCharacters.set(member.name, {
            name: member.name,
            class: member.type,
            spec: member.specs?.[0] ?? '',
            role,
            server: member.server,
            region: member.region,
          });
        }
      }
    }

    const runPlayers = [];
    const killedEncounterIds = [...new Set(killedFights.map((fight) => fight.encounterID))];

    for (const player of roster) {
      const profile = parseWclProfile(player.warcraftLogs.profileUrl);
      const metricKey = player.role === 'healer' ? 'hps' : 'dps';
      const entries = metricKey === 'hps' ? healingEntries : damageEntries;

      const entry = entries.find((item) => sameCharacterName(item.name, profile.name));
      if (!entry || !entry.activeTime || aggregateDurationMs <= 0) continue;

      const value = entry.total / (aggregateDurationMs / 1000);
      const deaths = countDeaths(deathEvents, profile.name);

      // parse: melhor percentil entre os bosses que a run matou (não dá
      // pra ter um percentil único quando a run mata vários bosses
      // diferentes — cada encontro tem seu próprio ranking na WCL).
      let bestRankPercent;
      for (const encounterID of killedEncounterIds) {
        const rankings = await fetchEncounterRankings(profile, encounterID, metricKey);
        for (const rank of rankings?.ranks ?? []) {
          if (rank.report.code !== report.code) continue;
          if (!aggregateFightIds.includes(rank.report.fightID)) continue;
          if (bestRankPercent === undefined || rank.rankPercent > bestRankPercent) {
            bestRankPercent = rank.rankPercent;
          }
        }
      }

      runPlayers.push({
        playerId: player.id,
        [metricKey]: Math.round(value),
        parse: bestRankPercent !== undefined ? Math.round(bestRankPercent) : undefined,
        itemLevel: entry.itemLevel,
        deaths,
        // mechanics.errors não tem métrica equivalente na API do WarcraftLogs;
        // fica de fora até alguém preencher manualmente essa semana.
      });
    }

    runsByReportCode.set(report.code, {
      date: toBrazilDateString(report.startTime),
      reportCode: report.code,
      players: runPlayers,
    });
  }

  // Jogadores que apareceram no log mas não estão no roster.json ainda:
  // cria um rascunho de cadastro pra cada um (class/spec/role/links já
  // preenchidos com o que a WCL sabe; avatar/discord/race/type ficam
  // vazios pra alguém completar depois).
  const knownWclNames = new Set(
    roster.map((player) => parseWclProfile(player.warcraftLogs.profileUrl).name.toLowerCase())
  );
  const newCharacters = [...seenCharacters.values()].filter(
    (character) => !knownWclNames.has(character.name.toLowerCase())
  );

  if (newCharacters.length > 0) {
    const existingIds = new Set(roster.map((player) => player.id));
    const drafts = [];
    for (const character of newCharacters) {
      const draft = await buildRosterDraft(character, existingIds);
      existingIds.add(draft.id);
      drafts.push(draft);
    }

    const updatedRoster = [...roster, ...drafts];
    await writeFile(
      path.join(ROOT, 'data/roster.json'),
      `${JSON.stringify(updatedRoster, null, 2)}\n`
    );

    console.log(
      `${drafts.length} jogador(es) novo(s) encontrado(s) no log, adicionados como rascunho em data/roster.json: ${drafts.map((d) => `${d.name} (${d.id})`).join(', ')}.`
    );
    console.log('Revise esses rascunhos: spec está em inglês, e faltam avatar/discord/race/type/heroSpec.');
  }

  const fileName = `week-${String(week).padStart(2, '0')}.json`;
  const outPath = path.join(ROOT, 'data/performance', fileName);

  // Mescla com o arquivo existente: uma run nova soma às que já tinha
  // (ex: gerar terça e depois quinta não apaga a run de terça). Uma run
  // com o mesmo reportCode de uma já existente é atualizada, não duplicada.
  let existingRuns = [];
  try {
    const raw = await readFile(outPath, 'utf-8');
    existingRuns = JSON.parse(raw).runs ?? [];
  } catch {
    existingRuns = [];
  }

  const runsByKey = new Map();
  for (const run of existingRuns) {
    runsByKey.set(run.reportCode ?? run.date, run);
  }
  for (const [reportCode, run] of runsByReportCode) {
    runsByKey.set(reportCode, run);
  }

  const runs = [...runsByKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  const output = { week, runs };

  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `Gerado ${path.relative(ROOT, outPath)} com ${runs.length} run(s) (${runsByReportCode.size} atualizada(s)/nova(s) nessa execução).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
