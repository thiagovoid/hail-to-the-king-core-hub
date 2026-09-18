/**
 * Parse a partir dos rankings do **próprio relatório**.
 *
 * A primeira tentativa usava `encounterRankings`, o ranking global do
 * personagem — e ele não inclui os logs do core: conferido no CI, os oito
 * relatórios da temporada não aparecem lá, e o único rank encontrado veio de
 * um log de fora. Por isso a dimensão de maior peso ficava sempre sem dado.
 *
 * `reportData.report.rankings` é outra coisa: são os percentis calculados
 * para aquele relatório, que é o que a página da WCL mostra. Vem por fight e
 * por jogador, e não depende de o log estar rankeado globalmente.
 *
 * Bônus: é **uma** chamada por relatório, contra uma por jogador por
 * encontro na versão anterior — bem mais barato no orçamento de pontos da
 * API.
 *
 * Puro: recebe o que a API devolveu, devolve estrutura. Sem rede.
 */

export interface WclRankedCharacter {
  name?: string;
  /** Percentil 0-100 do jogador naquele fight. É o "parse". */
  rankPercent?: number;
}

export interface WclRankedFight {
  fightID?: number;
  encounter?: { id?: number; name?: string };
  difficulty?: number;
  /** 1 = kill. A WCL só calcula percentil pra kill. */
  kill?: number;
  /** Baldes por papel: tanks, healers, dps. */
  roles?: Record<string, { characters?: WclRankedCharacter[] } | undefined>;
}

export interface WclReportRankings {
  data?: WclRankedFight[];
}

/** Comparação de nome de personagem: a WCL varia a caixa entre endpoints. */
function mesmoNome(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface ParseDoJogador {
  /** Melhor percentil entre os kills da noite. */
  parse: number;
  /** Em quantos kills o jogador foi rankeado — deixa o número rastreável. */
  kills: number;
}

/**
 * Melhor parse de cada jogador entre os kills do relatório.
 *
 * Só kill entra: a WCL não calcula percentil pra wipe, então uma noite de
 * progressão sem kill nenhum fica legitimamente sem parse — e isso é
 * diferente de parse zero.
 *
 * Fica com o melhor, não a média, porque é assim que a WCL e o jogador leem
 * "meu parse naquele boss".
 */
export function buildParseByPlayer(rankings: WclReportRankings | undefined): Map<string, ParseDoJogador> {
  const resultado = new Map<string, ParseDoJogador>();

  for (const fight of rankings?.data ?? []) {
    if (!fight.kill) continue;

    for (const balde of Object.values(fight.roles ?? {})) {
      for (const personagem of balde?.characters ?? []) {
        const nome = personagem.name;
        const percentil = personagem.rankPercent;
        if (!nome || percentil === undefined || percentil === null) continue;

        const chave = nome.toLowerCase();
        const atual = resultado.get(chave);

        if (!atual) resultado.set(chave, { parse: percentil, kills: 1 });
        else resultado.set(chave, { parse: Math.max(atual.parse, percentil), kills: atual.kills + 1 });
      }
    }
  }

  return resultado;
}

/** Acha o parse de um personagem, tolerando diferença de caixa no nome. */
export function findParse(
  porJogador: Map<string, ParseDoJogador>,
  characterName: string
): ParseDoJogador | undefined {
  const direto = porJogador.get(characterName.toLowerCase());
  if (direto) return direto;

  for (const [nome, valor] of porJogador) {
    if (mesmoNome(nome, characterName)) return valor;
  }
  return undefined;
}
