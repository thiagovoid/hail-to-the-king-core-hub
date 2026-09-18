/**
 * Quais bosses cada jogador ajudou a matar.
 *
 * A presença numa try sai dos eventos de cast que a métrica de cooldowns já
 * baixa: quem lançou alguma coisa naquela try estava nela. Não custa
 * requisição nenhuma a mais — é cruzamento de dado que já está em mãos.
 *
 * Dificuldade entra na chave porque Nek'zali no Normal e no Heroico são dois
 * kills diferentes, e é assim que o jogo trata. Quem contar "bosses da
 * season" somando as duas está contando outra coisa.
 */

import type { EventoDeCast, JanelaDeLuta } from "./cooldownUsage";

export interface BossMorto {
  encounterID: number;
  /** Código da WCL: 3 = Normal, 4 = Heroico, 5 = Mítico. */
  difficulty: number;
}

export interface TryDeKill extends JanelaDeLuta {
  encounterID: number;
  difficulty: number;
}

/** Identidade de um kill. Mesmo boss em dificuldades diferentes não colide. */
export function chaveDoKill(kill: BossMorto): string {
  return `${kill.encounterID}-${kill.difficulty}`;
}

/**
 * Por ator do relatório, os bosses que ele viu morrer.
 *
 * Sem repetição dentro do mesmo relatório: matar o mesmo boss duas vezes na
 * mesma noite continua sendo um boss.
 */
export function buildBossKills(
  eventos: EventoDeCast[],
  killsDaNoite: TryDeKill[]
): Map<number, BossMorto[]> {
  const porTry = new Map(killsDaNoite.map((kill) => [kill.id, kill]));
  const porAtor = new Map<number, Map<string, BossMorto>>();

  for (const evento of eventos) {
    const kill = porTry.get(evento.fight);
    if (!kill) continue;

    let meus = porAtor.get(evento.sourceID);
    if (!meus) porAtor.set(evento.sourceID, (meus = new Map()));

    const morto: BossMorto = { encounterID: kill.encounterID, difficulty: kill.difficulty };
    meus.set(chaveDoKill(morto), morto);
  }

  return new Map(
    [...porAtor.entries()].map(([sourceID, mortos]) => [
      sourceID,
      [...mortos.values()].sort(
        (a, b) => a.difficulty - b.difficulty || a.encounterID - b.encounterID
      ),
    ])
  );
}

/**
 * Quantos bosses distintos o jogador matou no conjunto de runs.
 *
 * Distintos, não kills: matar Nek'zali Normal em três semanas seguidas é um
 * boss da season, não três. É a pergunta "quantos bosses você já derrubou",
 * não "quantas vezes você apertou".
 */
export function contarBossesDistintos(runs: Array<BossMorto[] | undefined>): number {
  const vistos = new Set<string>();

  for (const run of runs) {
    for (const kill of run ?? []) vistos.add(chaveDoKill(kill));
  }

  return vistos.size;
}
