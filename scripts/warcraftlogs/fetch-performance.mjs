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
          fights { id encounterID name kill difficulty }
        }
      }
    }`,
    { code }
  );
  return data.reportData.report.fights;
}

async function fetchFightTables(code, fightID) {
  const data = await wclGraphql(
    `query($code: String!, $fightID: Int!) {
      reportData {
        report(code: $code) {
          damage: table(fightIDs: [$fightID], dataType: DamageDone)
          healing: table(fightIDs: [$fightID], dataType: Healing)
          summary: table(fightIDs: [$fightID], dataType: Summary)
        }
      }
    }`,
    { code, fightID }
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

function countDeaths(deathEvents, characterName) {
  return deathEvents.filter((event) => event.name === characterName).length;
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

  const bestByPlayer = new Map();
  const deathsByPlayer = new Map();
  let latestReportTime = null;

  for (const report of reports) {
    const allFights = await fetchReportFights(report.code);
    // Inclui kills E wipes: numa noite 100% wipe (progresso em boss novo),
    // ainda queremos registrar dps/hps/itemLevel/deaths do melhor pull.
    // "parse" fica de fora nesse caso, pois o WCL só rankeia kills.
    const raidFights = allFights.filter(
      (fight) => validEncounterIds.has(fight.encounterID)
    );

    for (const fight of raidFights) {
      const tables = await fetchFightTables(report.code, fight.id);
      const deathEvents = tables.summary.data.deathEvents ?? [];
      const damageEntries = tables.damage.data.entries ?? [];
      const healingEntries = tables.healing.data.entries ?? [];

      for (const player of roster) {
        const profile = parseWclProfile(player.warcraftLogs.profileUrl);
        const metricKey = player.role === 'healer' ? 'hps' : 'dps';
        const entries = metricKey === 'hps' ? healingEntries : damageEntries;

        const entry = entries.find((item) => item.name === profile.name);
        if (!entry || !entry.activeTime) continue;

        const value = entry.total / (entry.activeTime / 1000);
        const deaths = countDeaths(deathEvents, profile.name);
        deathsByPlayer.set(player.id, (deathsByPlayer.get(player.id) ?? 0) + deaths);

        // Kill sempre ganha de wipe, mesmo com dps bruto menor: um wipe
        // curto pode inflar o dps (queima de cooldown antes de morrer),
        // mas só o kill tem parse e representa a execução completa do fight.
        const current = bestByPlayer.get(player.id);
        const isBetter =
          !current ||
          (fight.kill && !current.isKill) ||
          (fight.kill === current.isKill && value > current.value);

        if (isBetter) {
          bestByPlayer.set(player.id, {
            value,
            isKill: fight.kill,
            itemLevel: entry.itemLevel,
            metricKey,
            reportCode: report.code,
            fightID: fight.id,
            encounterID: fight.encounterID,
            profile,
          });
        }
      }
    }

    if (raidFights.length > 0 && (!latestReportTime || report.startTime > latestReportTime)) {
      latestReportTime = report.startTime;
    }
  }

  const players = [];

  for (const [playerId, best] of bestByPlayer) {
    const rankings = await fetchEncounterRankings(best.profile, best.encounterID, best.metricKey);
    const rank = (rankings?.ranks ?? []).find(
      (item) => item.report.code === best.reportCode && item.report.fightID === best.fightID
    );

    players.push({
      playerId,
      [best.metricKey]: Math.round(best.value),
      parse: rank ? Math.round(rank.rankPercent) : undefined,
      itemLevel: best.itemLevel,
      deaths: deathsByPlayer.get(playerId) ?? 0,
      // mechanics.errors não tem métrica equivalente na API do WarcraftLogs;
      // fica de fora até alguém preencher manualmente essa semana.
    });
  }

  const output = {
    week,
    date: latestReportTime
      ? new Date(latestReportTime).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    players,
  };

  const fileName = `week-${String(week).padStart(2, '0')}.json`;
  const outPath = path.join(ROOT, 'data/performance', fileName);
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Gerado ${path.relative(ROOT, outPath)} com ${players.length} jogador(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
