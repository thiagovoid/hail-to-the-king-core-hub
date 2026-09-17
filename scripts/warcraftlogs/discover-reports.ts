import { saveRaw } from "../../src/services/RawStorage";
import { parseWclProfile, toBrazilDateString } from "../../src/providers/warcraftlogs/normalize";
import type { WarcraftLogsProvider, WclReportRef } from "../../src/providers/warcraftlogs/WarcraftLogsProvider";

// Raid da season atual (Midnight S2). Atualizar a cada novo tier de raid.
export const RAID_ZONE_ID = 53; // The Venomous Abyss / Abismo Venenoso

export const GUILD = {
  name: "Hail to the King",
  serverSlug: "nemesis",
  serverRegion: "US",
} as const;

/** Contas WCL de quem sobe os logs (ver AUTOMACAO.md) — vem do ambiente, não é segredo. */
export function getUploaderUserIds(): number[] {
  return (process.env.WCL_UPLOADER_USER_IDS ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export interface DiscoverReportsOptions {
  wcl: WarcraftLogsProvider;
  roster: Array<{ warcraftLogs: { profileUrl: string } }>;
  startTime: number;
  endTime: number;
  extraReportCodes?: string[];
  /**
   * Inclui reports pessoais de contas NÃO verificadas achados via personagem.
   * Desligado por padrão: costumam ser cópias da mesma noite (mortes em dobro).
   */
  discoverByCharacter?: boolean;
}

export interface DiscoveredReports {
  /** Todos os reports únicos do tier na janela, em qualquer ordem. */
  reports: WclReportRef[];
  guildReports: WclReportRef[];
  uploaderReports: WclReportRef[];
  extraReports: WclReportRef[];
  trustedDiscovered: WclReportRef[];
  untrustedDiscovered: WclReportRef[];
}

/**
 * Descoberta de reports de raid numa janela de tempo — compartilhada entre
 * fetch-performance (dps/parse por run) e update-season (pulls/kills e
 * últimos logs), pra ambos enxergarem exatamente o mesmo conjunto de logs.
 *
 * Quatro fontes, nessa ordem de confiança: reports marcados pra guild,
 * reports das contas de upload conhecidas (WCL_UPLOADER_USER_IDS), códigos
 * passados à mão, e por fim reports pessoais achados pelo personagem — esses
 * só entram automaticamente se o dono for uma conta conhecida.
 */
export async function discoverReports(options: DiscoverReportsOptions): Promise<DiscoveredReports> {
  const { wcl, roster, startTime, endTime, extraReportCodes = [], discoverByCharacter = false } = options;

  const guildId = await wcl.resolveGuildId(GUILD.name, GUILD.serverSlug, GUILD.serverRegion);
  const guildReports = await wcl.fetchGuildReports(guildId, startTime, endTime, RAID_ZONE_ID);

  const extraReports: WclReportRef[] = [];
  for (const code of extraReportCodes) {
    if (guildReports.some((report) => report.code === code)) continue;
    const meta = await wcl.fetchReportMeta(code);
    if (meta?.zone?.id === RAID_ZONE_ID) extraReports.push(meta);
  }

  const uploaderUserIds = getUploaderUserIds();
  const uploaderReports: WclReportRef[] = [];
  for (const userID of uploaderUserIds) {
    uploaderReports.push(...(await wcl.fetchUserReports(userID, startTime, endTime, RAID_ZONE_ID)));
  }

  const reportsByCode = new Map<string, WclReportRef>();
  for (const report of [...guildReports, ...uploaderReports, ...extraReports]) {
    reportsByCode.set(report.code, report);
  }

  const trustedUploaderIds = new Set(uploaderUserIds);
  const trustedDiscovered: WclReportRef[] = [];
  const untrustedDiscovered: WclReportRef[] = [];

  if (trustedUploaderIds.size > 0 || discoverByCharacter) {
    for (const player of roster) {
      const profile = parseWclProfile(player.warcraftLogs.profileUrl);
      const playerReports = await wcl.fetchCharacterRecentReports(profile);

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
      "Atenção: reports de contas não verificadas incluídos (--discover-characters). Confirme que não são cópias duplicadas de outra pessoa antes de usar esses dados (pode contar mortes em dobro)."
    );
  }

  await saveRaw("warcraftlogs", `_discovery/${toBrazilDateString(startTime)}_${toBrazilDateString(endTime)}`, {
    window: { startTime, endTime },
    guildReports,
    uploaderReports,
    extraReports,
    trustedDiscovered,
    untrustedDiscovered,
  });

  return { reports, guildReports, uploaderReports, extraReports, trustedDiscovered, untrustedDiscovered };
}
