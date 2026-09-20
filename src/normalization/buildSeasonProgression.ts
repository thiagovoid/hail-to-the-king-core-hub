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
 * Recalcula a progressão a partir dos logs, sem acumular estado.
 *
 * A versão anterior fazia `boss.pulls += pullsDestaRun` e parava de olhar o
 * boss depois do kill. Três consequências, todas ruins:
 *
 * 1. **Recoletar inflava o número.** A mesma noite processada duas vezes
 *    somava os pulls duas vezes, e não havia como corrigir sem editar o JSON
 *    na mão.
 * 2. **Pull de farm não existia.** Depois do kill o boss era ignorado, então
 *    quantas vezes o core voltou nele era invisível.
 * 3. **A história não era corrigível.** O número era o que tinha sido somado
 *    ao longo do tempo, não o que estava nos logs.
 *
 * Agora o placar mora no `pullLog`, um registro por report — campo que já
 * existia no tipo e nunca tinha sido ligado. Processar um report SUBSTITUI a
 * entrada dele em vez de somar, então rodar dez vezes dá o mesmo que rodar
 * uma. `pulls` vira soma derivada, e a data de cada entrada é o que permite
 * perguntar depois se um boss já estava morto numa certa noite — que é a
 * diferença entre progressão e farm.
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
      const pullsAntes = boss.pulls;
      const estavaMorto = boss.status === "killed";

      const log = [...(boss.pullLog ?? [])];

      for (const ctx of reportContexts) {
        const doBoss = ctx.raidFights.filter(
          (fight) => fight.encounterID === boss.encounterID && fight.difficulty === difficulty
        );

        // Substituir em vez de somar é o que torna reprocessar inofensivo.
        const posicao = log.findIndex((entrada) => entrada.reportCode === ctx.report.code);
        if (posicao >= 0) log.splice(posicao, 1);
        if (doBoss.length === 0) continue;

        const kill = doBoss.find((fight) => fight.kill);
        log.push({
          reportCode: ctx.report.code,
          date: toBrazilDateString(ctx.report.startTime),
          pulls: doBoss.length,
          kill: kill !== undefined,
        });

        if (kill && (!boss.killDate || new Date(boss.killDate).getTime() > ctx.report.startTime)) {
          boss.killDate = new Date(ctx.report.startTime + kill.endTime).toISOString();
          boss.links.warcraftLogs = `https://www.warcraftlogs.com/reports/${ctx.report.code}?fight=${kill.id}`;
        }
      }

      log.sort((a, b) => a.date.localeCompare(b.date));
      boss.pullLog = log;

      // `pulls` é quantos pulls levou ATÉ matar, não o total da temporada:
      // a pergunta é "quanto custou esse boss", e voltar nele em farm toda
      // semana não pode encarecer a resposta. O log guarda tudo; a conta
      // para na noite do kill.
      const noiteDoKill = log.findIndex((entrada) => entrada.kill);
      const ateOKill = noiteDoKill >= 0 ? log.slice(0, noiteDoKill + 1) : log;
      boss.pulls = ateOKill.reduce((soma, entrada) => soma + entrada.pulls, 0);

      // E o total, que inclui o farm: as duas perguntas são legítimas e são
      // diferentes — "quanto custou matar" e "quanto rodamos nele".
      boss.pullsTotal = log.reduce((soma, entrada) => soma + entrada.pulls, 0);

      // O status é derivado, nunca escrito à mão: some junto com o log.
      if (log.length === 0) boss.status = "not_started";
      else if (log.some((entrada) => entrada.kill)) boss.status = "killed";
      else boss.status = "progress";

      if (boss.pulls === pullsAntes && estavaMorto === (boss.status === "killed")) continue;

      changes.push(
        boss.status === "killed" && !estavaMorto
          ? `${boss.name} (${label}): morto! (${boss.pulls} pull${boss.pulls !== 1 ? "s" : ""} no total)`
          : `${boss.name} (${label}): ${boss.pulls} pull(s) no total`
      );
    }
  }

  return changes;
}

/**
 * O boss já tinha caído ANTES desta noite, nesta dificuldade?
 *
 * É a definição operacional de farm, derivada do próprio log em vez de
 * configurada: se caiu numa noite anterior, a luta de hoje é farm; se não,
 * é progressão. A régua muda o que cada número significa — parse só existe
 * pra boss morto, e mecânica de progressão é o que decide a noite.
 */
export function ehFarm(boss: Boss, data: string): boolean {
  return (boss.pullLog ?? []).some((entrada) => entrada.kill && entrada.date < data);
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
