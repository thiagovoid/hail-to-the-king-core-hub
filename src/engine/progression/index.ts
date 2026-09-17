import type { Boss, BossPullLogEntry } from "../../types/index";

/** Códigos de dificuldade da WarcraftLogs pra raids atuais. */
export const WCL_DIFFICULTY = {
  normal: 3,
  heroic: 4,
  mythic: 5,
} as const;

export interface ProgressionFight {
  id: number;
  encounterID: number;
  kill: boolean;
  difficulty: number | null;
  startTime: number;
  endTime: number;
}

export interface ProgressionReport {
  code: string;
  /** Data da run (YYYY-MM-DD), já no fuso da guild. */
  date: string;
  fights: ProgressionFight[];
}

export interface ApplyReportResult {
  bosses: Boss[];
  /** Bosses que mudaram (pulls somados e/ou kill registrada) nesse report. */
  changedBossIds: string[];
  /**
   * encounterIDs que apareceram no report nessa dificuldade mas não batem
   * com o `encounterId` de nenhum boss — precisam de mapeamento em config.
   */
  unmappedEncounterIds: number[];
}

/**
 * Aplica um report da WCL à lista de bosses de UMA dificuldade, seguindo a
 * regra "quantas tentativas até a primeira kill":
 *
 * - Boss já morto: não muda (o número tombou, é histórico).
 * - Report já contabilizado no `pullLog` do boss: não muda (idempotente —
 *   o cron roda com janela sobreposta e revê os mesmos reports).
 * - Senão, soma os pulls do boss nesse report até e incluindo a primeira
 *   kill. Se houve kill, marca `killed`, grava `killDate` e o link do fight.
 *
 * Puro: não lê arquivo nem chama API. Quem chama passa só os fights da
 * dificuldade certa já filtrados pelo tier da raid.
 */
export function applyReportToBosses(
  bosses: Boss[],
  report: ProgressionReport,
  difficulty: number
): ApplyReportResult {
  const fights = report.fights
    .filter((fight) => fight.difficulty === difficulty)
    .sort((a, b) => a.startTime - b.startTime);

  const mappedEncounterIds = new Set(
    bosses.map((boss) => boss.encounterId).filter((id): id is number => typeof id === "number")
  );
  const unmappedEncounterIds = [
    ...new Set(fights.map((fight) => fight.encounterID).filter((id) => !mappedEncounterIds.has(id))),
  ];

  const changedBossIds: string[] = [];

  const updated = bosses.map((boss) => {
    if (typeof boss.encounterId !== "number") return boss;
    if (boss.status === "killed") return boss;
    if (boss.pullLog?.some((entry) => entry.reportCode === report.code)) return boss;

    const bossFights = fights.filter((fight) => fight.encounterID === boss.encounterId);
    if (bossFights.length === 0) return boss;

    const killIndex = bossFights.findIndex((fight) => fight.kill);
    const counted = killIndex === -1 ? bossFights : bossFights.slice(0, killIndex + 1);
    const killFight = killIndex === -1 ? null : bossFights[killIndex];

    const entry: BossPullLogEntry = {
      reportCode: report.code,
      date: report.date,
      pulls: counted.length,
      kill: killFight !== null,
    };

    changedBossIds.push(boss.id);

    return {
      ...boss,
      status: killFight ? "killed" : "progress",
      pulls: boss.pulls + counted.length,
      killDate: killFight ? new Date(killFight.endTime).toISOString() : boss.killDate,
      links: killFight
        ? { ...boss.links, warcraftLogs: `https://www.warcraftlogs.com/reports/${report.code}?fight=${killFight.id}` }
        : boss.links,
      pullLog: [...(boss.pullLog ?? []), entry],
    } satisfies Boss;
  });

  return { bosses: updated, changedBossIds, unmappedEncounterIds };
}

export interface RecentLog {
  date: string;
  url: string;
  title: string;
}

/**
 * Junta os reports novos aos "Últimos Logs" da home do core: um por report,
 * mais recente primeiro, sem duplicar (a chave é a URL) e limitado.
 */
export function mergeRecentLogs(
  existing: RecentLog[],
  reports: Array<{ code: string; date: string }>,
  title: string,
  limit = 10
): RecentLog[] {
  const byUrl = new Map<string, RecentLog>();
  for (const log of existing) byUrl.set(log.url, log);
  for (const report of reports) {
    const url = `https://www.warcraftlogs.com/reports/${report.code}`;
    byUrl.set(url, { date: report.date, url, title });
  }
  return [...byUrl.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Número da semana de raid pra uma data, contando a partir de `seasonStart`
 * (a primeira terça da temporada): semana 1 = [seasonStart, +7d), etc.
 * Datas antes do início da temporada dão 1 — não existe semana 0.
 */
export function weekNumberFromDate(date: string, seasonStart: string): number {
  const start = Date.parse(`${seasonStart}T00:00:00Z`);
  const current = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(current)) {
    throw new Error(`Data inválida ao calcular semana: date=${date} seasonStart=${seasonStart}`);
  }
  const diffDays = Math.floor((current - start) / DAY_MS);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}
