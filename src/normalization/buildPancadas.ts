/**
 * A pancada cruzada com o defensivo que estava na mão.
 *
 * Defender é a dimensão mais frágil do Score e a que mais pesa no tank (45),
 * porque ela prova o lado errado da frase: mede que você apertou o botão,
 * nunca que havia o que mitigar. "Você não usou Anti-Magic Zone" não acusa
 * nada sozinho — pode não ter existido o que absorver, e foi exatamente essa
 * a crítica que derrubou a primeira versão.
 *
 * Aqui os dois lados se encontram. Uma pancada grande com defensivo pronto
 * vira "levou 812k de Gravebound, 71% da sua vida, com Anti-Magic Zone na
 * mão" — uma frase que tem laudo, data e conserto.
 *
 * O filtro é deliberadamente estreito. Dos 25.474 golpes arquivados, quase
 * todos são irrelevantes: o que ensina alguma coisa é o golpe que levou um
 * naco da vida E tinha como ser mitigado. Acusar mais que isso é voltar a
 * falar sem provar.
 */

import type { PancadaLevada } from "../providers/warcraftlogs/biggestHits";

/**
 * Quanto da vida o golpe precisa levar pra virar assunto.
 *
 * Um terço: abaixo disso o golpe é rotina de raide — todo mundo leva, toda
 * luta, e apontar cada um seria o mesmo ruído dos sites que só despejam
 * número. Um terço da vida num golpe é o que faz o healer assustar e o que
 * um humano lembra de ter acontecido.
 */
export const FATIA_DA_VIDA = 1 / 3;

/** Uma pancada que vale ser mostrada, com tudo que a explica. */
export interface PancadaExplicada {
  /** A try em que aconteceu. */
  fight: number;
  /** Segundos desde o começo da luta — o mesmo relógio das mortes. */
  atSecond: number;
  /** O que bateu. Sem nome não é laudo, é "habilidade 1234567". */
  ability?: string;
  /** O que doeu, depois de absorção e redução. */
  amount: number;
  /** Quanto da vida total isso representou, 0-100. */
  fatiaDaVida?: number;
  /**
   * Defensivos que estavam fora de recarga no instante do golpe.
   *
   * Vazio quando não havia nada na mão — e aí o golpe não acusa ninguém,
   * porque não havia o que fazer.
   */
  defensivosProntos: string[];
}

/**
 * As pancadas que merecem virar frase, da mais cara pra mais barata.
 *
 * `defensivosProntos` é uma função e não um mapa porque a resposta depende do
 * instante: a mesma magia está pronta às 0:30 e em recarga às 0:45.
 */
export function buildPancadas(
  pancadas: Iterable<PancadaLevada>,
  actorId: number,
  inicioDaTry: Map<number, number>,
  nomeDaHabilidade: (gameID: number) => string | undefined,
  defensivosProntos: (actorId: number, quando: number) => string[],
  quantas = 3
): PancadaExplicada[] {
  const minhas: PancadaExplicada[] = [];

  for (const pancada of pancadas) {
    if (pancada.targetID !== actorId) continue;

    /**
     * Sem `maxHitPoints` a fatia não é calculável, e o golpe entra sem ela em
     * vez de ficar de fora: "levou 812k de Gravebound" continua sendo um
     * laudo, só é um laudo mais pobre. Inventar um denominador seria pior.
     */
    const fatia =
      pancada.maxHitPoints && pancada.maxHitPoints > 0
        ? (pancada.amount / pancada.maxHitPoints) * 100
        : undefined;

    if (fatia !== undefined && fatia < FATIA_DA_VIDA * 100) continue;

    const comeco = inicioDaTry.get(pancada.fight);
    if (comeco === undefined) continue;

    minhas.push({
      fight: pancada.fight,
      atSecond: Math.round((pancada.timestamp - comeco) / 1000),
      ability: nomeDaHabilidade(pancada.abilityGameID),
      amount: pancada.amount,
      ...(fatia !== undefined && { fatiaDaVida: Math.round(fatia) }),
      defensivosProntos: defensivosProntos(actorId, pancada.timestamp),
    });
  }

  return minhas.sort((a, b) => b.amount - a.amount).slice(0, quantas);
}
