import type { PlayerPerformance } from "../../types/performance";
import type { CorePerformanceTargets, CoreTarget } from "../../types/index";
import { calculateGoalProgress } from "../metrics";

export type ScoreDimensionKey = "parse" | "mechanics" | "cooldowns" | "preparation";

export interface ScoreDimension {
  key: ScoreDimensionKey;
  label: string;
  /** Peso da dimensão — os quatro somam exatamente 100. */
  weight: number;
  /** O que a métrica mede, pra explicar a nota na interface. */
  description: string;
  /** De onde o dado vem (ou por que ainda não vem). */
  source: string;
  /**
   * Sub-nota 0-100 da dimensão, ou null quando o dado por trás dela ainda
   * não é coletado. Dimensão null fica de fora da média ponderada — nunca
   * conta como 0, pra métrica que não temos não puxar o jogador pra baixo.
   */
  score: number | null;
  /** Meta do core usada nessa dimensão, pra UI conseguir explicar a nota. */
  target: CoreTarget;
}

export interface OverallPerformanceScore {
  /** Média ponderada das dimensões disponíveis, renormalizada pra 100. Null quando nenhuma tem dado. */
  overall: number | null;
  dimensions: ScoreDimension[];
}

/**
 * Pesos das quatro dimensões. Somam 100 — quando Mortes (peso 15) saiu da
 * contabilização, os 15 pontos foram redistribuídos mantendo a ordem de
 * importância original (Parse > Mecânicas > Cooldowns > Preparação), em vez
 * de deixar os quatro somando 85.
 */
const DIMENSION_META: Record<ScoreDimensionKey, { label: string; weight: number; description: string; source: string }> = {
  parse: {
    label: "Parse",
    weight: 35,
    description:
      "Percentil do seu dano (ou cura) comparado com jogadores da mesma spec no mesmo boss e dificuldade. 60 significa que você ficou acima de 60% deles.",
    source:
      "Warcraft Logs. Só existe para boss morto — wipe não recebe ranking, então esse número olha os bosses que caíram na noite.",
  },
  mechanics: {
    label: "Mecânicas",
    weight: 30,
    description: "Erros de execução de mecânica ao longo da noite — dano evitável tomado, soak perdido, etc.",
    source: "Wipefest. Coleta ainda não rodou com dado real, por isso aparece sem dado.",
  },
  cooldowns: {
    label: "Cooldowns",
    weight: 25,
    description: "Percentual de uso correto dos seus cooldowns ao longo da noite.",
    source: "WoW Analyzer. Sem coleta hoje: o site bloqueia automação via Cloudflare.",
  },
  preparation: {
    label: "Preparação",
    weight: 10,
    description:
      "Quanto do equipamento está encantado e gemado, comparado ao que o guia da sua spec recomenda. Vale a presença, não o item exato: encanto ou gema fora do BIS conta igual. Consumíveis ainda não entram na conta.",
    source: "Warcraft Logs (gear do log) + Wowhead (quantos encantos e gemas se espera na sua spec).",
  },
};

function progress(value: number | undefined, target: CoreTarget): number | null {
  if (value === undefined) return null;
  return calculateGoalProgress(value, target.target, target.direction);
}

/**
 * Score Engine: Score Geral 0-100 de um jogador numa noite de raid,
 * comparando cada dimensão contra a meta do core (igual pra todo mundo,
 * definida em `config.performanceTargets` do arquivo da temporada).
 *
 * O insumo é a noite inteira: desde que a agregação da WCL passou a somar
 * todas as trys (kills + wipes), `dps`/`hps` e as notas do Wipefest cobrem
 * a noite toda, não só os kills. A exceção é `parse`: a WCL só calcula
 * percentil pra kill — wipe não tem ranking, então esse número continua
 * sendo o melhor parse entre os bosses mortos na noite.
 *
 * Mortes saíram da contabilização por hora (segue coletado, aparece no
 * histórico, mas não pontua). Cooldowns e Preparação ainda não têm coleta:
 * Cooldowns depende do WoW Analyzer (bloqueado pela Cloudflare) e
 * Preparação de um passe novo na WCL sobre gear/consumíveis.
 *
 * Dimensão sem dado é descartada e seu peso é redistribuído entre as que
 * têm — em vez de assumir um denominador fixo de 100 pontos.
 */
export function calculateOverallScore(
  performance: PlayerPerformance,
  targets: CorePerformanceTargets
): OverallPerformanceScore {
  const dimensions: ScoreDimension[] = [
    {
      key: "parse",
      ...DIMENSION_META.parse,
      target: targets.parse,
      score: progress(performance.parse, targets.parse),
    },
    {
      key: "mechanics",
      ...DIMENSION_META.mechanics,
      target: targets.mechanics,
      score: progress(performance.mechanics?.errors, targets.mechanics),
    },
    {
      key: "cooldowns",
      ...DIMENSION_META.cooldowns,
      target: targets.cooldowns,
      score: progress(performance.uptime, targets.cooldowns),
    },
    {
      key: "preparation",
      ...DIMENSION_META.preparation,
      target: targets.preparation,
      score: progress(performance.preparation, targets.preparation),
    },
  ];

  const available = dimensions.filter(
    (dimension): dimension is ScoreDimension & { score: number } => dimension.score !== null
  );

  if (available.length === 0) {
    return { overall: null, dimensions };
  }

  const totalWeight = available.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weightedSum = available.reduce((sum, dimension) => sum + dimension.weight * dimension.score, 0);

  return { overall: Math.round(weightedSum / totalWeight), dimensions };
}
