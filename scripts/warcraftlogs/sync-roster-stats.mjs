import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wclGraphql } from './client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

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

async function loadAllRuns() {
  const dir = path.join(ROOT, 'data/performance');
  const files = (await readdir(dir)).filter((file) => /^week-\d+\.json$/.test(file));

  const runs = [];
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf-8');
    const week = JSON.parse(raw);
    runs.push(...(week.runs ?? []));
  }
  return runs;
}

async function fetchRaiderIoProfile(region, realm, name) {
  const url = `https://raider.io/api/v1/characters/profile?region=${encodeURIComponent(region)}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=mythic_plus_scores_by_season:current,mythic_plus_best_runs,mythic_plus_ranks`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchZoneRankings(profile, metric) {
  try {
    const data = await wclGraphql(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int!, $metric: CharacterPageRankingMetricType) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            zoneRankings(zoneID: $zoneID, metric: $metric)
          }
        }
      }`,
      {
        name: profile.name,
        serverSlug: profile.realm,
        serverRegion: profile.region,
        zoneID: RAID_ZONE_ID,
        metric,
      }
    );
    return data.characterData.character?.zoneRankings;
  } catch {
    return null;
  }
}

async function main() {
  const roster = await loadRoster();
  const allRuns = await loadAllRuns();
  const totalRuns = allRuns.length;

  console.log(`Sincronizando estatísticas de ${roster.length} jogador(es) (${totalRuns} run(s) na temporada)...`);

  const updatedRoster = [];

  for (const player of roster) {
    let profile;
    try {
      profile = parseWclProfile(player.warcraftLogs.profileUrl);
    } catch {
      console.warn(`Pulando ${player.name}: URL do WarcraftLogs inválida.`);
      updatedRoster.push(player);
      continue;
    }

    const region = profile.region.toLowerCase();
    const realm = profile.realm;

    const [raiderIoProfile, metricKey] = await Promise.all([
      fetchRaiderIoProfile(region, realm, profile.name),
      Promise.resolve(player.role === 'healer' ? 'hps' : 'dps'),
    ]);

    const zoneRankings = await fetchZoneRankings(profile, metricKey);

    const bestRuns = raiderIoProfile?.mythic_plus_best_runs ?? [];
    const bestRun = bestRuns.length > 0
      ? bestRuns.reduce((best, run) => (run.mythic_level > best.mythic_level ? run : best))
      : null;

    const ioScore = raiderIoProfile?.mythic_plus_scores_by_season?.[0]?.scores?.all;
    const realmRank = raiderIoProfile?.mythic_plus_ranks?.overall?.realm;

    const runsAttended = allRuns.filter((run) =>
      run.players.some((entry) => entry.playerId === player.id)
    ).length;

    updatedRoster.push({
      ...player,
      raiderIo: {
        ...player.raiderIo,
        io: typeof ioScore === 'number' && ioScore > 0 ? Math.round(ioScore) : player.raiderIo.io,
        bestDungeon: bestRun?.dungeon ?? player.raiderIo.bestDungeon,
        highestKey: bestRun?.mythic_level ?? player.raiderIo.highestKey,
        realmRank: typeof realmRank === 'number' && realmRank > 0 ? realmRank : player.raiderIo.realmRank,
      },
      warcraftLogs: {
        ...player.warcraftLogs,
        avgParse: typeof zoneRankings?.medianPerformanceAverage === 'number'
          ? Math.round(zoneRankings.medianPerformanceAverage)
          : player.warcraftLogs.avgParse,
        bestParse: typeof zoneRankings?.bestPerformanceAverage === 'number'
          ? Math.round(zoneRankings.bestPerformanceAverage)
          : player.warcraftLogs.bestParse,
        attendance: totalRuns > 0 ? Math.round((runsAttended / totalRuns) * 100) : player.warcraftLogs.attendance,
      },
    });

    console.log(`${player.name}: io=${ioScore ?? '-'} melhorKey=${bestRun ? `${bestRun.dungeon} +${bestRun.mythic_level}` : '-'} avgParse=${zoneRankings?.medianPerformanceAverage?.toFixed(1) ?? '-'} presença=${totalRuns > 0 ? Math.round((runsAttended / totalRuns) * 100) : '-'}%`);
  }

  await writeFile(
    path.join(ROOT, 'data/roster.json'),
    `${JSON.stringify(updatedRoster, null, 2)}\n`
  );

  console.log('data/roster.json atualizado.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
