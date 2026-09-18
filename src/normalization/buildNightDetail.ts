/**
 * A noite try a try, e não só somada.
 *
 * O agregado da WCL responde "quanto você fez na noite". Não responde se
 * você estava na primeira pull, se atravessou uma try inteira sem bater em
 * nada, ou se o boss caiu sem você morrer uma vez. São perguntas de
 * sequência, e sequência só existe olhando luta por luta.
 *
 * Tudo aqui é indexado por `actorId` da WCL — a tradução pra id do roster
 * acontece na camada que chama, que é quem conhece o roster.
 */

export interface LutaDeBoss {
  id: number;
  encounterID: number;
  kill: boolean;
  /** `actorId` de quem estava no raide nesta try. */
  friendlyPlayers: number[];
}

export interface MorteNaTry {
  /** `id` da luta em que a morte aconteceu. */
  fight: number;
  /** `actorId` de quem morreu. */
  targetID: number;
}

export interface TrysDoJogador {
  /** Trys de boss em que estava no raide. */
  present: number;
  /** Trys de boss que a noite teve. É o denominador. */
  total: number;
  /** Faltou na primeira try e apareceu depois. */
  lateStart: boolean;
  /** Estava em alguma try e faltou na última. */
  earlyExit: boolean;
  /** Trys em que estava presente e não causou dano nenhum. */
  idle: number;
  /** Trys em que morreu e ainda assim foi o maior dano da try. */
  topDamageDead: number;
}

export interface TrysDeUmBoss {
  encounterID: number;
  /** Trys DESTE boss em que o jogador estava. */
  tries: number;
  /** O boss caiu numa try em que ele estava. */
  killed: boolean;
  /** Atravessou todas as trys dele sem morrer nenhuma vez. */
  flawless: boolean;
}

export interface DetalheDaNoite {
  tries: TrysDoJogador;
  bossTries: TrysDeUmBoss[];
}

/**
 * Detalhe por jogador, só pra quem esteve em pelo menos uma try.
 *
 * Reserva que ficou no log sem entrar em pull nenhuma fica de fora de
 * propósito: zero dano de quem nunca desceu não é a mesma coisa que zero
 * dano de quem estava lá.
 *
 * @param bosses trys de boss em ordem cronológica
 * @param mortes eventos de morte do log inteiro
 * @param danoPorTry dano por `actorId` em cada try, pela `id` da luta
 */
export function buildNightDetail(
  bosses: LutaDeBoss[],
  mortes: MorteNaTry[],
  danoPorTry: Map<number, Map<number, number>>
): Map<number, DetalheDaNoite> {
  const detalhe = new Map<number, DetalheDaNoite>();
  if (bosses.length === 0) return detalhe;

  const naPrimeira = new Set(bosses[0].friendlyPlayers);
  const naUltima = new Set(bosses[bosses.length - 1].friendlyPlayers);

  const morreuNaTry = new Set(mortes.map((morte) => `${morte.fight}:${morte.targetID}`));

  /** Quem liderou o dano de cada try. Empate entrega a todos os empatados. */
  const lideresDaTry = new Map<number, Set<number>>();
  for (const luta of bosses) {
    const dano = danoPorTry.get(luta.id);
    if (!dano || dano.size === 0) continue;

    const teto = Math.max(...dano.values());
    if (teto <= 0) continue;

    lideresDaTry.set(
      luta.id,
      new Set([...dano].filter(([, valor]) => valor === teto).map(([actorId]) => actorId))
    );
  }

  const participantes = new Set(bosses.flatMap((luta) => luta.friendlyPlayers));

  for (const actorId of participantes) {
    const presentes = bosses.filter((luta) => luta.friendlyPlayers.includes(actorId));

    let idle = 0;
    let topDamageDead = 0;

    for (const luta of presentes) {
      // Só conta ociosidade numa try em que ALGUÉM bateu. Try sem dano
      // nenhum na tabela é try sem dado — um pull cancelado em dois
      // segundos, uma luta que a WCL não tabelou — e não uma em que o raide
      // inteiro ficou parado. Em 27/08 isso dava "ocioso" pros 14.
      const teveAtividade = (lideresDaTry.get(luta.id)?.size ?? 0) > 0;
      if (teveAtividade && (danoPorTry.get(luta.id)?.get(actorId) ?? 0) === 0) idle += 1;

      const morreu = morreuNaTry.has(`${luta.id}:${actorId}`);
      if (morreu && lideresDaTry.get(luta.id)?.has(actorId)) topDamageDead += 1;
    }

    const porBoss = new Map<number, LutaDeBoss[]>();
    for (const luta of presentes) {
      porBoss.set(luta.encounterID, [...(porBoss.get(luta.encounterID) ?? []), luta]);
    }

    const bossTries: TrysDeUmBoss[] = [...porBoss].map(([encounterID, lutas]) => ({
      encounterID,
      tries: lutas.length,
      killed: lutas.some((luta) => luta.kill),
      flawless:
        lutas.some((luta) => luta.kill) &&
        lutas.every((luta) => !morreuNaTry.has(`${luta.id}:${actorId}`)),
    }));

    detalhe.set(actorId, {
      tries: {
        present: presentes.length,
        total: bosses.length,
        // Quem só entrou depois da primeira pull chegou atrasado. Quem
        // nunca entrou não está neste laço.
        lateStart: !naPrimeira.has(actorId),
        earlyExit: !naUltima.has(actorId),
        idle,
        topDamageDead,
      },
      bossTries,
    });
  }

  return detalhe;
}

/**
 * Quanto do dano do raide no trash veio de cada um, em porcentagem.
 *
 * Só faz sentido quando o log gravou trash: num log que começa na pull do
 * boss, todo mundo tem zero e ninguém está de bobeira. O `undefined` de
 * volta é o que diz "não dá pra saber".
 */
export function buildTrashShare(
  danoNoTrash: Map<number, number>,
  houveTrash: boolean
): Map<number, number> | undefined {
  if (!houveTrash) return undefined;

  const total = [...danoNoTrash.values()].reduce((soma, valor) => soma + valor, 0);
  if (total <= 0) return undefined;

  const share = new Map<number, number>();
  for (const [actorId, dano] of danoNoTrash) {
    share.set(actorId, Math.round((dano / total) * 1000) / 10);
  }

  return share;
}
