import { toBrazilDateString, type WclFight } from "../providers/warcraftlogs/normalize";
import type { WclReportRef } from "../providers/warcraftlogs/WarcraftLogsProvider";
import type { Boss, SiteConfig } from "../types/index";

export interface SeasonConfigFile {
  config: SiteConfig;
  bossesNormal: Boss[];
  bossesHeroic: Boss[];
  recentLogs: Array<{ date: string; url: string; title: string }>;
}

/**
 * Código de dificuldade da WCL (`fight.difficulty`) -> balde de boss no
 * config.json da season. Confirmado batendo com dado real desta season (não
 * é o enum "oficial" de dificuldade de raid da Blizzard/WCL de forma
 * genérica — só vale pro que já observamos aqui). Revisar se aparecer um
 * valor de dificuldade novo (ex: Mítico) nos logs.
 */
export const DIFFICULTY_TO_BUCKET: Record<number, "bossesNormal" | "bossesHeroic"> = {
  3: "bossesNormal",
  4: "bossesHeroic",
};

/**
 * Semana N = bloco de 7 dias a partir de `raidWeekAnchor` (terça-feira da
 * primeira raid da season). Deixa o cron rodar sem saber de antemão qual é
 * "a semana atual" — mesma numeração que quem roda o script na mão já usava,
 * só que derivada da data em vez de decidida a dedo toda vez.
 */
export function computeWeekNumber(raidWeekAnchor: string, referenceMs: number): number {
  const anchorMs = new Date(`${raidWeekAnchor}T00:00:00.000Z`).getTime();
  const diffDays = Math.floor((referenceMs - anchorMs) / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * Compara os fights de cada report processado numa execução com os bosses
 * ainda não mortos do config.json (por encounterID + dificuldade, não por
 * nome). Nunca reverte um boss já "killed" — só soma pulls e, se achar um
 * fight com kill=true, marca como morto e preenche killDate/link da WCL.
 * Muta `season` in-place; devolve um resumo legível do que mudou (vazio se
 * nada mudou).
 */
export function updateBossProgression(
  season: SeasonConfigFile,
  reportContexts: Array<{ report: WclReportRef; raidFights: WclFight[] }>
): string[] {
  const changes: string[] = [];

  for (const [difficultyKey, bucketKey] of Object.entries(DIFFICULTY_TO_BUCKET) as Array<
    [string, "bossesNormal" | "bossesHeroic"]
  >) {
    const difficulty = Number(difficultyKey);
    const label = bucketKey === "bossesNormal" ? "Normal" : "Heroica";

    for (const boss of season[bucketKey]) {
      if (boss.status === "killed") continue;

      let pullsThisRun = 0;
      let kill: { report: WclReportRef; fight: WclFight } | null = null;

      for (const ctx of reportContexts) {
        for (const fight of ctx.raidFights) {
          if (fight.encounterID !== boss.encounterID || fight.difficulty !== difficulty) continue;
          pullsThisRun += 1;
          if (fight.kill && !kill) kill = { report: ctx.report, fight };
        }
      }

      if (pullsThisRun === 0) continue;

      boss.pulls += pullsThisRun;
      if (boss.status === "not_started") boss.status = "progress";

      if (kill) {
        boss.status = "killed";
        boss.killDate = new Date(kill.report.startTime + kill.fight.endTime).toISOString();
        boss.links.warcraftLogs = `https://www.warcraftlogs.com/reports/${kill.report.code}?fight=${kill.fight.id}`;
        changes.push(`${boss.name} (${label}): morto! (${boss.pulls} pull${boss.pulls !== 1 ? "s" : ""} no total)`);
      } else {
        changes.push(`${boss.name} (${label}): +${pullsThisRun} pull(s), ${boss.pulls} no total`);
      }
    }
  }

  return changes;
}

/** Adiciona ao "menu" da home (recentLogs) um report novo processado nessa execução, se ainda não estiver lá. */
export function updateRecentLogs(
  season: SeasonConfigFile,
  reportContexts: Array<{ report: WclReportRef }>
): boolean {
  const byUrl = new Map(season.recentLogs.map((entry) => [entry.url, entry]));
  let changed = false;

  for (const ctx of reportContexts) {
    const url = `https://www.warcraftlogs.com/reports/${ctx.report.code}`;
    if (byUrl.has(url)) continue;
    byUrl.set(url, { date: toBrazilDateString(ctx.report.startTime), url, title: season.config.currentRaid });
    changed = true;
  }

  if (changed) {
    season.recentLogs = [...byUrl.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  return changed;
}
