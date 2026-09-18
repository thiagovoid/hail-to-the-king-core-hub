/**
 * Quais bosses cada jogador ajudou a matar.
 *
 * A presença numa try sai dos eventos de cast que a métrica de cooldowns já
 * baixa: quem lançou alguma coisa naquela try estava nela. Não custa
 * requisição nenhuma a mais — é cruzamento de dado que já está em mãos.
 *
 * A conta é de KILLS, não de bosses distintos: se o core derrubar Nek'zali
 * em três semanas seguidas, quem esteve nas três tem três kills. A
 * dificuldade fica guardada junto porque distingue Normal de Heroico na hora
 * de mostrar quais foram — mas não deduplica nada.
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

/**
 * Por ator do relatório, um registro por try de kill em que ele estava.
 *
 * A chave é a TRY, não o boss: se o mesmo boss cair duas vezes na mesma
 * noite, são dois kills. O que não pode repetir é a mesma try, e por isso o
 * conjunto guarda ids de try.
 */
export function buildBossKills(
  eventos: EventoDeCast[],
  killsDaNoite: TryDeKill[]
): Map<number, BossMorto[]> {
  const porTry = new Map(killsDaNoite.map((kill) => [kill.id, kill]));
  const trysPorAtor = new Map<number, Set<number>>();

  for (const evento of eventos) {
    if (!porTry.has(evento.fight)) continue;

    let minhas = trysPorAtor.get(evento.sourceID);
    if (!minhas) trysPorAtor.set(evento.sourceID, (minhas = new Set()));
    minhas.add(evento.fight);
  }

  return new Map(
    [...trysPorAtor.entries()].map(([sourceID, trys]) => [
      sourceID,
      [...trys]
        .sort((a, b) => a - b)
        .map((fightId) => {
          const kill = porTry.get(fightId)!;
          return { encounterID: kill.encounterID, difficulty: kill.difficulty };
        }),
    ])
  );
}

/**
 * Quantos bosses o jogador ajudou a derrubar no conjunto de runs.
 *
 * Total de kills, com repetição: estar em três clears de Nek'zali conta
 * três. Mede participação em kill, não progressão — quem quiser "até onde o
 * core chegou" olha a barra de progressão, que é outra coisa.
 */
export function contarKills(runs: Array<BossMorto[] | undefined>): number {
  return runs.reduce((total, run) => total + (run?.length ?? 0), 0);
}
