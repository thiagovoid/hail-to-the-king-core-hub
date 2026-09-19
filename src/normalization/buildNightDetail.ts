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
  /** Duração da try, em ms. Separa luta de pull cancelada. */
  durationMs: number;
  /** Fim da try, no mesmo relógio dos eventos de morte. Ver `custoDaMorte`. */
  endTime: number;
  /** `actorId` de quem estava no raide nesta try. */
  friendlyPlayers: number[];
}

/**
 * Abaixo disto a try é pull cancelada, não luta.
 *
 * Em 27/08 uma try durou 20 segundos com treze pessoas dentro e uma só
 * causando dano — alguém puxou errado e o grupo resetou. Contada como luta,
 * ela dava "atravessou uma try sem bater em nada" pra doze pessoas de uma
 * vez. As trys de verdade daquela noite foram de 75 a 382 segundos.
 */
export const TRY_MINIMA_MS = 30_000;

export interface MorteNaTry {
  /** `id` da luta em que a morte aconteceu. */
  fight: number;
  /** `actorId` de quem morreu. */
  targetID: number;
  /** Quando aconteceu, no mesmo relógio do `endTime` da luta. */
  timestamp: number;
}

/**
 * O que uma morte custou: quanto tempo o raide seguiu lutando sem você.
 *
 * Contar morte crua puniria resiliência. Progressão em mítico é 200, 300
 * trys, e "pode wipar, galera" produz um monte de morte que não é erro de
 * ninguém — é cumprir a call e economizar tempo do grupo.
 *
 * Medir o custo em vez de classificar a morte resolve isso sem limiar e sem
 * heurística: morrer três segundos antes do wipe custa três segundos, morrer
 * no começo de uma luta de 500s custa 500. A call de wipe sai perto de zero
 * por construção, não por exceção.
 *
 * Medido no log de 15/09: Apocalipse e Dagom morreram 11 e 12 vezes — custo
 * real de 93s contra 1006s, porque nove das onze do Apocalipse foram nos
 * últimos dez segundos da try.
 */
export interface CustoDasMortes {
  /** Segundos que o raide seguiu lutando sem você. */
  seconds: number;
  /** % do tempo de luta da noite que você passou morto com a luta viva. */
  share: number;
  /** Mortes em try que virou kill — o boss caiu sem você. A mais cara que existe. */
  inKills: number;
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
  /** O que as mortes custaram de verdade. Ver `CustoDasMortes`. */
  deathCost: CustoDasMortes;
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
/**
 * A try foi luta de verdade, e não pull cancelada nem try sem dado?
 *
 * Duas formas de falso positivo, dois guardas. A curta demais é o reset; a
 * que quase ninguém bateu é o reset também, visto pelo outro lado — e a sem
 * tabela nenhuma é buraco de coleta. Nenhuma delas é gente parada, e é só
 * disso que "Turista" deveria falar.
 */
function valeComoLuta(luta: LutaDeBoss, danoPorTry: Map<number, Map<number, number>>): boolean {
  if (luta.durationMs < TRY_MINIMA_MS) return false;

  const bateram = [...(danoPorTry.get(luta.id)?.values() ?? [])].filter((total) => total > 0).length;
  if (bateram === 0) return false;

  return bateram * 2 >= luta.friendlyPlayers.length;
}

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

  /** O tempo de luta da noite — denominador do custo das mortes. */
  const tempoDeLutaMs = bosses.reduce((soma, luta) => soma + luta.durationMs, 0);

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

  const porId = new Map(bosses.map((luta) => [luta.id, luta]));
  const participantes = new Set(bosses.flatMap((luta) => luta.friendlyPlayers));

  for (const actorId of participantes) {
    const presentes = bosses.filter((luta) => luta.friendlyPlayers.includes(actorId));

    let idle = 0;
    let topDamageDead = 0;

    for (const luta of presentes) {
      if (
        valeComoLuta(luta, danoPorTry) &&
        (danoPorTry.get(luta.id)?.get(actorId) ?? 0) === 0
      ) {
        idle += 1;
      }

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

    /**
     * O custo, morte a morte: o que sobrou de luta depois dela.
     *
     * Sem limiar. A call de wipe sai perto de zero porque a try acaba logo
     * em seguida, não porque alguém decidiu que aquela morte "não conta".
     */
    let msMorto = 0;
    let emKills = 0;
    for (const morte of mortes) {
      if (morte.targetID !== actorId) continue;
      const luta = porId.get(morte.fight);
      if (!luta) continue;

      msMorto += Math.max(0, luta.endTime - morte.timestamp);
      if (luta.kill) emKills += 1;
    }

    detalhe.set(actorId, {
      deathCost: {
        seconds: Math.round(msMorto / 1000),
        share: tempoDeLutaMs > 0 ? Math.round((msMorto / tempoDeLutaMs) * 1000) / 10 : 0,
        inKills: emKills,
      },
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
