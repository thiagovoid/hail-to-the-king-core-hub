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
  /** 3 = Normal, 4 = Heroico. Separa a mesma luta em duas réguas. */
  difficulty: number;
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
  /** O que matou, quando o log identifica. */
  abilityGameID?: number;
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
  /** 3 = Normal, 4 = Heroico — o mesmo boss em duas dificuldades é duas linhas. */
  difficulty: number;
  /** Trys DESTE boss em que o jogador estava. */
  tries: number;
  /** O boss caiu numa try em que ele estava. */
  killed: boolean;
  /** Atravessou todas as trys dele sem morrer nenhuma vez. */
  flawless: boolean;
  /** Dano por segundo SÓ nas trys deste boss. Ausente sem tabela de dano. */
  dps?: number;
  /** Mortes deste jogador neste boss. */
  deaths: number;
  /** O que as mortes neste boss custaram — segundos e % do tempo dele. */
  deathCost: { seconds: number; share: number };
}

/**
 * Abaixo disto, entre a sua morte e o fim da try, a piada se escreve
 * sozinha: você caiu e o raide inteiro veio junto.
 *
 * Dez segundos é curto de propósito. A call de wipe já derruba todo mundo
 * junto o tempo todo, e o que se quer aqui é o caso em que a SUA morte foi
 * o primeiro dominó — não o wipe combinado.
 */
export const DOMINO_MS = 10_000;

/** Morrer antes disso, contado do início da try, é "nem deu tempo". */
export const SPEEDRUN_MS = 30_000;

/**
 * O jeito como as mortes aconteceram — não quantas, nem quanto custaram.
 *
 * Tudo aqui é zoeira, e é por isso que existe separado do `deathCost`: o
 * custo é o que entra no Score e precisa ser justo com quem cumpre a call
 * de wipe. Isto aqui é o grupo rindo de um tombo, e um tombo é engraçado
 * independente de ter sido caro.
 */
export interface AssinaturaDasMortes {
  /** Trys em que você foi o primeiro do raide a cair, com mais gente caindo depois. */
  primeiroACair: number;
  /** Trys em que você morreu e a try acabou em até 10 segundos. */
  efeitoDomino: number;
  /** Trys em que morreu nos primeiros 30 segundos. */
  speedrun: number;
  /** Trys em que passou mais tempo morto do que vivo. */
  fantasma: number;
}

/**
 * Uma morte, com o contexto que a torna legível.
 *
 * "18,5% do tempo morto" é verdade e não se entende. "Sentinelas, try 7:
 * caiu aos 1:12 de 3:40, Gotículas Tóxicas" é a mesma informação dita de um
 * jeito que dá pra agir — e conecta Sobreviver com Mecânicas, que hoje são
 * duas conversas separadas sobre o mesmo tombo.
 */
export interface MorteDetalhada {
  encounterID: number;
  difficulty: number;
  /** Em que segundo da try a pessoa caiu. */
  atSecond: number;
  /** Quanto durou a try, em segundos. É o que dá escala ao número acima. */
  fightSeconds: number;
  /** Segundos que o raide seguiu lutando depois desta morte. */
  afterSeconds: number;
  /** Nome da habilidade que matou, quando o log identifica. */
  ability?: string;
  /**
   * Defensivos que estavam FORA de recarga no instante da morte.
   *
   * É o cruzamento que transforma o dado em conversa. "Você não usou Anti-Magic
   * Zone" não comunica nada — pode não haver o que mitigar. "Você morreu para
   * Gravebound, o raide lutou 4 minutos sem você, e o Anti-Magic Zone estava
   * na sua mão" comunica.
   *
   * Sozinho ele ainda não separa: 94% das 1048 mortes da temporada tinham
   * ALGUM defensivo pronto. O que separa é cruzar com o custo da morte e com
   * a causa ter nome — aí caem pra 13%.
   */
  readyDefensives?: string[];
}

export interface DetalheDaNoite {
  tries: TrysDoJogador;
  bossTries: TrysDeUmBoss[];
  /** O que as mortes custaram de verdade. Ver `CustoDasMortes`. */
  deathCost: CustoDasMortes;
  /** Como elas aconteceram. Ver `AssinaturaDasMortes`. */
  deathSignature: AssinaturaDasMortes;
  /** Morte a morte, com boss, momento e causa. Ver `MorteDetalhada`. */
  deathDetail: MorteDetalhada[];
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
  danoPorTry: Map<number, Map<number, number>>,
  /** Traduz o id da habilidade que matou. Sem ela, a morte fica sem causa. */
  nomeDaHabilidade?: (abilityGameID: number) => string | undefined,
  /** Quais defensivos deste ator estavam prontos naquele instante. */
  defensivosProntos?: (actorId: number, timestamp: number) => string[]
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

  /**
   * Quem abriu o placar de cada try, quando houve placar pra abrir.
   *
   * Só conta com DUAS mortes ou mais: ser o primeiro de um só é ser também
   * o último, e a piada é sobre ter puxado a fila. Empate no mesmo
   * milissegundo entrega aos dois, como no resto das disputadas.
   */
  const primeirosACair = new Map<number, Set<number>>();
  for (const luta of bosses) {
    const daTry = mortes.filter((morte) => morte.fight === luta.id);
    if (daTry.length < 2) continue;

    const primeiro = Math.min(...daTry.map((morte) => morte.timestamp));
    primeirosACair.set(
      luta.id,
      new Set(daTry.filter((morte) => morte.timestamp === primeiro).map((m) => m.targetID))
    );
  }

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

    /**
     * Agrupado por boss E dificuldade: o mesmo encontro no Normal e no
     * Heroico são duas lutas diferentes, com dano e mortes que não se somam.
     */
    const porBoss = new Map<string, LutaDeBoss[]>();
    for (const luta of presentes) {
      const chave = `${luta.encounterID}:${luta.difficulty}`;
      porBoss.set(chave, [...(porBoss.get(chave) ?? []), luta]);
    }

    const bossTries: TrysDeUmBoss[] = [...porBoss.values()].map((lutas) => {
      const idsDasLutas = new Set(lutas.map((luta) => luta.id));
      const tempoMs = lutas.reduce((soma, luta) => soma + luta.durationMs, 0);

      const dano = lutas.reduce(
        (soma, luta) => soma + (danoPorTry.get(luta.id)?.get(actorId) ?? 0),
        0
      );

      // O custo das mortes DESTE boss, mesma conta da noite inteira: o que
      // sobrou de luta depois de cada morte.
      let msMorto = 0;
      let mortesAqui = 0;
      for (const morte of mortes) {
        if (morte.targetID !== actorId || !idsDasLutas.has(morte.fight)) continue;
        const luta = porId.get(morte.fight)!;
        msMorto += Math.max(0, luta.endTime - morte.timestamp);
        mortesAqui += 1;
      }

      return {
        encounterID: lutas[0].encounterID,
        difficulty: lutas[0].difficulty,
        tries: lutas.length,
        killed: lutas.some((luta) => luta.kill),
        flawless:
          lutas.some((luta) => luta.kill) &&
          lutas.every((luta) => !morreuNaTry.has(`${luta.id}:${actorId}`)),
        // Sem dano medido não se inventa zero: a ausência do número é
        // diferente de ter feito nada.
        ...(dano > 0 && tempoMs > 0 ? { dps: Math.round(dano / (tempoMs / 1000)) } : {}),
        deaths: mortesAqui,
        deathCost: {
          seconds: Math.round(msMorto / 1000),
          share: tempoMs > 0 ? Math.round((msMorto / tempoMs) * 1000) / 10 : 0,
        },
      };
    });

    /**
     * O custo, morte a morte: o que sobrou de luta depois dela.
     *
     * Sem limiar. A call de wipe sai perto de zero porque a try acaba logo
     * em seguida, não porque alguém decidiu que aquela morte "não conta".
     */
    let msMorto = 0;
    let emKills = 0;

    // A assinatura só olha try que vale como luta: numa pull cancelada de 20
    // segundos todo mundo é "speedrun ao cemitério", e a piada perde a graça
    // quando ela acusa o grupo inteiro.
    const assinatura: AssinaturaDasMortes = {
      primeiroACair: 0,
      efeitoDomino: 0,
      speedrun: 0,
      fantasma: 0,
    };

    const deathDetail: MorteDetalhada[] = [];

    for (const morte of mortes) {
      if (morte.targetID !== actorId) continue;
      const luta = porId.get(morte.fight);
      if (!luta) continue;

      const sobrou = Math.max(0, luta.endTime - morte.timestamp);
      msMorto += sobrou;
      if (luta.kill) emKills += 1;

      const inicioDaLuta = luta.endTime - luta.durationMs;
      deathDetail.push({
        encounterID: luta.encounterID,
        difficulty: luta.difficulty,
        atSecond: Math.max(0, Math.round((morte.timestamp - inicioDaLuta) / 1000)),
        fightSeconds: Math.round(luta.durationMs / 1000),
        afterSeconds: Math.round(sobrou / 1000),
        ...(() => {
          const prontos = defensivosProntos?.(actorId, morte.timestamp) ?? [];
          return prontos.length > 0 ? { readyDefensives: prontos } : {};
        })(),
        ...(morte.abilityGameID !== undefined
          ? (() => {
              const nome = nomeDaHabilidade?.(morte.abilityGameID);
              return nome ? { ability: nome } : {};
            })()
          : {}),
      });

      if (!valeComoLuta(luta, danoPorTry)) continue;

      const inicio = luta.endTime - luta.durationMs;
      const vivo = morte.timestamp - inicio;
      const morto = luta.endTime - morte.timestamp;

      const abriuOPlacar = primeirosACair.get(luta.id)?.has(actorId) ?? false;

      if (vivo <= SPEEDRUN_MS) assinatura.speedrun += 1;
      if (morto > vivo) assinatura.fantasma += 1;
      if (abriuOPlacar) assinatura.primeiroACair += 1;

      // O dominó exige as DUAS coisas: você caiu primeiro E o raide veio
      // junto logo em seguida. Só "morreu perto do fim do wipe" disparava em
      // 92 das 113 noites — todo wipe termina com todo mundo no chão, e a
      // medalha estaria dizendo "você estava num wipe", o que não tem graça.
      if (abriuOPlacar && morto <= DOMINO_MS && !luta.kill) assinatura.efeitoDomino += 1;
    }

    detalhe.set(actorId, {
      deathCost: {
        seconds: Math.round(msMorto / 1000),
        share: tempoDeLutaMs > 0 ? Math.round((msMorto / tempoDeLutaMs) * 1000) / 10 : 0,
        inKills: emKills,
      },
      deathSignature: assinatura,
      // Da mais cara pra mais barata: o topo é a morte que mais custou ao
      // raide, que é a que vale conversar.
      deathDetail: deathDetail.sort((a, b) => b.afterSeconds - a.afterSeconds),
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
