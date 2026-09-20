/**
 * As maiores pancadas que cada pessoa levou em cada try.
 *
 * Defender é hoje a dimensão mais frágil do score, e é a que mais pesa no
 * tank. O motivo é que ela prova o lado errado da frase: ela mede que você
 * apertou o botão, nunca que havia o que mitigar. "Você não usou Anti-Magic
 * Zone" não comunica nada — pode não ter existido o que absorver.
 *
 * O que falta é o outro lado: o instante em que a porrada chegou. Com ele a
 * frase vira "você levou 812k de Gravebound, 71% da sua vida, com Anti-Magic
 * Zone na mão", que é acionável e tem laudo.
 *
 * Também é o que fecha o buraco de Sobreviver: 494 das 973 mortes da
 * temporada não sabem dizer de quê, porque a tabela agregada da WCL trunca
 * em 5 habilidades e a que matou raramente está entre as 5 maiores. O evento
 * traz o nome junto, sem truncagem.
 */

/** Uma pancada levada, já reduzida ao que a análise usa. */
export interface PancadaLevada {
  /** A try. */
  fight: number;
  timestamp: number;
  /** Quem levou. */
  targetID: number;
  abilityGameID: number;
  /** O que sobrou depois de absorção e redução — o dano que doeu. */
  amount: number;
  /** O que teria doído sem nenhuma mitigação. A diferença é o que você evitou. */
  unmitigatedAmount?: number;
  absorbed?: number;
  /** Vida no instante seguinte ao golpe, e o total. Dá o "% da vida". */
  hitPoints?: number;
  maxHitPoints?: number;
}

/**
 * Quantas pancadas guardar por pessoa em cada try.
 *
 * O bruto de DamageTaken é dominado por tiques periódicos de 2k que não
 * ensinam nada e que, arquivados, multiplicariam o repositório. Guardar as
 * 20 maiores custa +5% no archive (medido: 26.460 eventos na temporada
 * inteira) e cobre com folga o que um humano consegue corrigir numa luta.
 *
 * A escolha é um TETO DE VOLUME, não um filtro de significado: nenhum limiar
 * de "o que é grande" entra aqui, porque essa é uma decisão de análise e
 * análise se refaz. Guardar as 20 maiores deixa a régua pra depois.
 */
export const PANCADAS_POR_TRY = 20;

/**
 * Reduz o fluxo bruto às `PANCADAS_POR_TRY` maiores de cada pessoa em cada try.
 *
 * Feito na coleta de propósito: o que não é guardado nunca precisou trafegar
 * pro git, e o que é guardado já chega na forma que a análise lê.
 */
export function maioresPancadas(
  eventos: PancadaLevada[],
  quantas: number = PANCADAS_POR_TRY
): PancadaLevada[] {
  const porPessoaEtry = new Map<string, PancadaLevada[]>();

  for (const evento of eventos) {
    // Golpe totalmente absorvido não tirou vida de ninguém: ele não é
    // evidência de que faltou defensivo, é evidência do contrário.
    if (evento.amount <= 0) continue;

    const chave = `${evento.fight}:${evento.targetID}`;
    const lista = porPessoaEtry.get(chave) ?? [];
    lista.push(evento);
    porPessoaEtry.set(chave, lista);
  }

  const escolhidas: PancadaLevada[] = [];
  for (const lista of porPessoaEtry.values()) {
    lista.sort((a, b) => b.amount - a.amount);
    escolhidas.push(...lista.slice(0, quantas));
  }

  // Em ordem de tempo: é assim que o cruzamento com a recarga dos defensivos
  // vai percorrer, e é assim que um humano lê a luta.
  return escolhidas.sort((a, b) => a.timestamp - b.timestamp);
}
