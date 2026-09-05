import type { OverallPerformanceScore, ScoreDimensionKey } from "./index";

export interface CoachRecommendation {
  /** Dimensão com o menor score entre as disponíveis, ou null sem dado suficiente. */
  focusKey: ScoreDimensionKey | null;
  focusLabel: string | null;
  message: string;
}

// Score Engine já usa 80 como o corte "verde" (ver PerformanceScoreCard) —
// mesmo critério aqui: abaixo disso vira foco de desenvolvimento, acima
// disso é reconhecimento, não cobrança.
const STRONG_THRESHOLD = 80;

// Uma recomendação por dimensão, não por jogador — genérica o suficiente
// pra fazer sentido pra qualquer role/classe. Nada específico de boss ou
// de guild aqui (isso é conteúdo editorial, não cabe numa recomendação
// gerada automaticamente).
const RECOMMENDATIONS: Record<ScoreDimensionKey, string> = {
  parse: "Seu parse está abaixo da meta. Revise prioridade de dano, rotação e uso de consumíveis antes da próxima raid.",
  mechanics: "Mecânicas estão custando pontos. Reveja os guias dos bosses atuais focando nos erros mais recorrentes do seu personagem.",
  cooldowns: "O uso de cooldowns está abaixo do ideal. Planeje quando usá-los antes de cada pull, alinhado com o resto do grupo.",
  deaths: "Mortes acima do esperado nas últimas runs. Priorize sobrevivência — ler a mecânica com atenção vale mais que um pull de dano a mais.",
  preparation: "Preparação (consumíveis, ready checks) está deixando performance na mesa — é o jeito mais fácil de ganhar pontos sem mudar a execução.",
};

/**
 * Coach Virtual (doc: "6.6 Coach Virtual") — recomendação gerada a partir
 * da dimensão mais fraca do Score Geral do jogador. Puramente derivado do
 * Score Engine, sem coleta nova.
 *
 * Doc: "O sistema deve focar em desenvolvimento, e não em punição" —
 * por isso um jogador sólido em tudo (nenhuma dimensão abaixo de
 * STRONG_THRESHOLD) recebe reconhecimento, não uma cobrança forçada sobre
 * qual das suas notas altas é "a mais baixa".
 */
export function buildCoachRecommendation(score: OverallPerformanceScore): CoachRecommendation {
  const scored = score.dimensions.filter(
    (dimension): dimension is typeof dimension & { score: number } => dimension.score !== null
  );

  if (scored.length === 0) {
    return {
      focusKey: null,
      focusLabel: null,
      message: "Ainda não há dados suficientes pra gerar uma recomendação.",
    };
  }

  const weakest = scored.reduce((worst, dimension) => (dimension.score < worst.score ? dimension : worst));

  if (weakest.score >= STRONG_THRESHOLD) {
    return {
      focusKey: weakest.key,
      focusLabel: weakest.label,
      message: "Performance sólida em todas as frentes disponíveis. Continue assim.",
    };
  }

  return {
    focusKey: weakest.key,
    focusLabel: weakest.label,
    message: RECOMMENDATIONS[weakest.key],
  };
}
