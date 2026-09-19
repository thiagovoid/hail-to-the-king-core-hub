/**
 * Quanto do tempo de luta cada cooldown do jogador ficou em recarga.
 *
 * A régua NÃO é "usos ÷ oportunidades". Conferido contra as telas do WoW
 * Analyzer que serviram de referência: uma habilidade de 1,5min com 7 casts
 * numa luta de ~12min aparece como 84%, e 7 × 90s ÷ 745s = 84%. Se fosse
 * usos ÷ oportunidades, 7/8 daria 87,5%, e o caso de Power Infusion
 * (8/14 casts exibido como 92%) não fecharia de jeito nenhum.
 *
 * A diferença importa na prática: quem segura o cooldown pro final da luta
 * "gastou" o uso, mas deixou a habilidade parada. Tempo em recarga penaliza
 * isso; contagem de usos, não.
 *
 * Puro: recebe os eventos já buscados e o catálogo já montado.
 */

import type { CooldownDaMagia, TipoDeCooldown } from "../wowhead/spellCooldown";

/** Evento de cast como a WCL devolve em `events(dataType: Casts)`. */
export interface EventoDeCast {
  timestamp: number;
  sourceID: number;
  abilityGameID: number;
  fight: number;
  /**
   * "cast" ou "begincast".
   *
   * Magia com tempo de conjuração emite os DOIS, e contar os dois é contar o
   * mesmo uso duas vezes — o Stormkeeper do jrxamã aparecia com 94 usos numa
   * noite de 47. Ver `ehUso`.
   */
  type?: string;
  /** Em quem. Só o `cast` traz o alvo de verdade; o `begincast` traz -1. */
  targetID?: number;
}

/**
 * O evento conta como USO da habilidade?
 *
 * Magia instantânea emite só `cast`. Magia com tempo de conjuração emite
 * `begincast` e depois `cast` — e contar os dois consumia duas cargas em vez
 * de uma, fazendo a habilidade parecer MAIS tempo em recarga do que ficou.
 * A eficiência saía inflada a favor do jogador.
 *
 * Conjuração interrompida emite só `begincast`, e aí não houve uso mesmo.
 */
export function ehUso(evento: { type?: string }): boolean {
  return evento.type !== "begincast";
}

export interface JanelaDeLuta {
  id: number;
  startTime: number;
  endTime: number;
}

export interface UsoDeCooldown {
  spellId: number;
  name: string;
  kind: TipoDeCooldown;
  /** Quantas vezes a habilidade foi usada na noite. */
  casts: number;
  /** Soma do tempo em recarga, em ms, limitado ao fim de cada try. */
  timeOnCooldownMs: number;
  /** Tempo de luta considerado — só as trys em que o jogador aparece. */
  possibleMs: number;
  /** 0-100. timeOnCooldownMs / possibleMs. */
  efficiency: number;
  /**
   * Quanto do dano do jogador na noite saiu desta habilidade, 0-100.
   * Ausente quando a tabela de dano não foi passada.
   */
  damageShare?: number;
}

export interface CooldownsDoJogador {
  sourceID: number;
  /**
   * Tempo de luta em que o jogador esteve presente — só as trys em que ele
   * aparece. Também serve de denominador do uptime: quem jogou 4 de 12 trys
   * não pode ser medido contra a noite inteira.
   */
  possibleMs: number;
  abilities: UsoDeCooldown[];
  /** Média simples das eficiências das habilidades usadas. Null sem nenhuma. */
  offensive: number | null;
  defensive: number | null;
}

/**
 * Tempo em recarga de UMA habilidade dentro de UMA try.
 *
 * Cargas mudam a conta e não dá pra ignorar: a habilidade só está "parada"
 * quando está com todas as cargas cheias. Por isso o modelo acompanha a
 * fração de cargas disponíveis em vez de um simples "livre a partir de X" —
 * com 2 cargas, usar as duas seguidas deixa a habilidade em recarga pelo
 * dobro do tempo, e é isso que o número precisa refletir.
 */
export function tempoEmRecarga(
  casts: number[],
  janela: { startTime: number; endTime: number },
  cooldownMs: number,
  maxCargas: number
): number {
  if (cooldownMs <= 0) return 0;

  const cargasMax = Math.max(1, maxCargas);
  let cargas = cargasMax;
  let ultimo = janela.startTime;
  let acumulado = 0;

  const avancarAte = (t: number) => {
    const delta = Math.max(0, t - ultimo);
    if (cargas < cargasMax) {
      // Quanto ainda falta de recarga pra voltar ao topo. O tempo "parado"
      // depois disso não conta.
      const faltaParaCheio = (cargasMax - cargas) * cooldownMs;
      acumulado += Math.min(delta, faltaParaCheio);
      cargas = Math.min(cargasMax, cargas + delta / cooldownMs);
    }
    ultimo = t;
  };

  for (const t of [...casts].sort((a, b) => a - b)) {
    if (t < janela.startTime || t > janela.endTime) continue;
    avancarAte(t);
    // Clamp em 0: talento que reduz recarga faz o log ter mais casts do que
    // o cooldown genérico do tooltip permite. Melhor subestimar do que
    // deixar a carga negativa e inflar o tempo depois.
    cargas = Math.max(0, cargas - 1);
  }

  avancarAte(janela.endTime);
  return acumulado;
}

/**
 * Piso de participação no dano pra um cooldown ofensivo entrar na nota.
 *
 * Existe porque a média desarmada deixava uma habilidade situacional
 * definir o número: na coleta de 15/09, um jogador com 97% de uptime ficou
 * com nota 52 porque o único "cooldown ofensivo" detectado foi um gap
 * closer que causa dano incidental (Feral Lunge, 8% de aproveitamento).
 * Um gap closer não é decisão de dano; Eye Beam é. A diferença entre os
 * dois está no dano que cada um representa, não no texto do tooltip.
 */
export const PARTICIPACAO_MINIMA_NO_DANO = 2;

/**
 * A partir daqui, a habilidade é decisão planejada, não reflexo.
 *
 * Existe porque participação no dano sozinha não separa dois casos que
 * parecem iguais: Feral Lunge (gap closer, 30s, 0,00% do dano) e Ascendance
 * (o cooldown do xamã Aperfeiçoamento, 3 min, 0,24%). As duas causam quase
 * nada de dano próprio — a de Ascendance sai com o nome de OUTRAS
 * habilidades, porque ela transforma seus ataques.
 *
 * O que separa as duas é a recarga. Ninguém tem uma habilidade de 3 minutos
 * que aperta sem pensar. Usar a quantidade de usos pra decidir seria pior:
 * quem nunca aperta o cooldown o veria sair da conta e ganharia nota por
 * isso — exatamente o contrário do que a métrica mede.
 */
export const COOLDOWN_MAIOR_MS = 90_000;

/**
 * Piso pra o dano próprio de um cooldown longo não ser só arredondamento.
 *
 * "Qualquer dano acima de zero" era permissivo demais: Earth Elemental, que
 * é invocação e não decisão de dano, tem uma fração de 0,00% e entrava
 * valendo o mesmo que Ascendance — derrubando o jogador de 98 pra 75.
 * Ascendance tem 0,24%, sessenta vezes mais. O corte fica no meio, longe
 * das duas.
 */
export const PARTICIPACAO_MINIMA_COOLDOWN_LONGO = 0.1;

/**
 * A categoria que vale pra pontuação DESTE jogador.
 *
 * O tooltip nem sempre diz que a habilidade é ofensiva. Doom Winds, o
 * cooldown de dano do xamã Aperfeiçoamento, não usa a palavra "damage" em
 * lugar nenhum — fala em Windfury — e caía em "utility", deixando o jogador
 * sem nenhum cooldown ofensivo medido. O dano que ela representa é um sinal
 * melhor do que o texto: utilidade que responde por parte relevante do dano
 * do jogador é, na prática, cooldown ofensivo.
 *
 * A promoção é por jogador de propósito: a mesma magia pode ser dano numa
 * spec e só utilidade em outra.
 */
export function categoriaEfetiva(
  kind: TipoDeCooldown,
  cooldownMs: number,
  damageShare: number | undefined
): TipoDeCooldown {
  if (kind !== "utility") return kind;
  // Sem dano nenhum: stun, battle res, invocação, deslocamento. Fica fora
  // por mais longa que seja a recarga (Reincarnation tem 30 minutos).
  if (damageShare === undefined) return "utility";
  if (cooldownMs >= COOLDOWN_MAIOR_MS) {
    return damageShare >= PARTICIPACAO_MINIMA_COOLDOWN_LONGO ? "offensive" : "utility";
  }
  return damageShare >= PARTICIPACAO_MINIMA_NO_DANO ? "offensive" : "utility";
}

/**
 * Se a habilidade entra na nota da sua categoria.
 *
 * "Não aparece na tabela de dano" é a definição observável de buff puro:
 * Avatar e Avenging Wrath não causam dano próprio, só aumentam o que você
 * causa. Isso substituiu uma tentativa de detectar buff pelo texto do
 * tooltip, que marcava Shattering Throw — habilidade que causa dano — como
 * buff e a isentava do filtro.
 *
 * Defensivo nunca é filtrado: mitigação não aparece na tabela de dano, e
 * filtrar apagaria a categoria inteira.
 */
export function contaParaNota(
  uso: UsoDeCooldown,
  cooldownMs: number,
  temTabelaDeDano: boolean
): boolean {
  if (uso.kind === "defensive") return true;
  if (!temTabelaDeDano) return true;
  // Não aparece na tabela de dano = não causa dano próprio, só aumenta o
  // seu. É assim que Avatar e Avenging Wrath se apresentam no log.
  if (uso.damageShare === undefined) return true;
  // Recarga longa é decisão planejada: entra mesmo representando pouco dano
  // direto (Shattering Throw, 3 min). Mas dano de arredondamento não conta
  // como dano — ver PARTICIPACAO_MINIMA_COOLDOWN_LONGO.
  if (cooldownMs >= COOLDOWN_MAIOR_MS) return uso.damageShare >= PARTICIPACAO_MINIMA_COOLDOWN_LONGO;
  return uso.damageShare >= PARTICIPACAO_MINIMA_NO_DANO;
}

/** Nomes vêm de fontes diferentes (Wowhead e WCL); compara sem depender de caixa. */
function chaveDeNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Participação de cada habilidade no dano de cada jogador, a partir da
 * tabela de DamageDone da WCL. A chave externa é o id do ator, que é o
 * mesmo `sourceID` dos eventos de cast.
 *
 * A chave interna é o NOME, não o id da magia: em boa parte das habilidades
 * o id que aparece no cast é diferente do id que aparece no dano (Eye Beam
 * é lançada com um id e causa dano com outro). Cruzar por id não casava
 * quase nada, e o filtro de relevância simplesmente não rodava.
 */
export function buildDamageShares(
  porJogadorCru: Array<{ sourceID: number; abilities: Array<{ name?: string; total?: number }> }>
): Map<number, Map<string, number>> {
  const porJogador = new Map<number, Map<string, number>>();

  for (const jogador of porJogadorCru) {
    const total = jogador.abilities.reduce((soma, h) => soma + (h.total ?? 0), 0);
    if (total <= 0) continue;

    const porHabilidade = new Map<string, number>();
    for (const habilidade of jogador.abilities) {
      if (!habilidade.name || habilidade.total === undefined) continue;
      const chave = chaveDeNome(habilidade.name);
      porHabilidade.set(chave, (porHabilidade.get(chave) ?? 0) + (habilidade.total / total) * 100);
    }

    porJogador.set(jogador.sourceID, porHabilidade);
  }

  return porJogador;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((soma, v) => soma + v, 0) / valores.length;
}

/**
 * Agrega a noite inteira por jogador.
 *
 * `possibleMs` conta só as trys em que o jogador aparece nos eventos — quem
 * entrou no meio da noite não é penalizado pelas trys em que estava fora.
 */
export function buildCooldownUsage(
  eventos: EventoDeCast[],
  janelas: JanelaDeLuta[],
  catalogo: Map<number, CooldownDaMagia>,
  /** Ver buildDamageShares. Sem isto, nenhuma habilidade é filtrada. */
  damageShares?: Map<number, Map<string, number>>
): CooldownsDoJogador[] {
  const porJanela = new Map(janelas.map((j) => [j.id, j]));

  // jogador -> try -> habilidade -> timestamps
  const castsPorJogador = new Map<number, Map<number, Map<number, number[]>>>();
  const trysPorJogador = new Map<number, Set<number>>();

  for (const evento of eventos) {
    if (!porJanela.has(evento.fight)) continue;
    if (!ehUso(evento)) continue;

    let trys = trysPorJogador.get(evento.sourceID);
    if (!trys) trysPorJogador.set(evento.sourceID, (trys = new Set()));
    trys.add(evento.fight);

    if (!catalogo.has(evento.abilityGameID)) continue;

    let porTry = castsPorJogador.get(evento.sourceID);
    if (!porTry) castsPorJogador.set(evento.sourceID, (porTry = new Map()));

    let porHabilidade = porTry.get(evento.fight);
    if (!porHabilidade) porTry.set(evento.fight, (porHabilidade = new Map()));

    const lista = porHabilidade.get(evento.abilityGameID);
    if (lista) lista.push(evento.timestamp);
    else porHabilidade.set(evento.abilityGameID, [evento.timestamp]);
  }

  const resultado: CooldownsDoJogador[] = [];

  for (const [sourceID, trys] of trysPorJogador) {
    const possibleMs = [...trys].reduce((soma, id) => {
      const janela = porJanela.get(id)!;
      return soma + (janela.endTime - janela.startTime);
    }, 0);
    if (possibleMs <= 0) continue;

    const sharesDoJogador = damageShares?.get(sourceID);

    // Agrupado por NOME, não por id: a mesma habilidade aparece com ids
    // diferentes conforme o talento (Immolation Aura saía duas vezes no
    // detalhe do mesmo jogador, com aproveitamentos diferentes). Pra quem lê
    // a tela é uma habilidade só, e contá-la duas vezes distorce a média.
    const acumulado = new Map<string, { magia: CooldownDaMagia; casts: number; tempo: number }>();
    for (const [fightId, porHabilidade] of castsPorJogador.get(sourceID) ?? []) {
      const janela = porJanela.get(fightId)!;

      // Junta os ids do mesmo nome ANTES de calcular: senão cada id entra
      // com a recarga cheia e o tempo sai inflado.
      const porNome = new Map<string, { magia: CooldownDaMagia; timestamps: number[] }>();
      for (const [spellId, timestamps] of porHabilidade) {
        const magia = catalogo.get(spellId)!;
        const chave = chaveDeNome(magia.name);
        const atual = porNome.get(chave);
        if (atual) atual.timestamps.push(...timestamps);
        else porNome.set(chave, { magia, timestamps: [...timestamps] });
      }

      for (const [chave, { magia, timestamps }] of porNome) {
        const atual = acumulado.get(chave) ?? { magia, casts: 0, tempo: 0 };
        atual.casts += timestamps.length;
        atual.tempo += tempoEmRecarga(timestamps, janela, magia.cooldownMs, magia.charges);
        acumulado.set(chave, atual);
      }
    }

    const abilities: UsoDeCooldown[] = [...acumulado.entries()]
      .map(([chave, dados]) => {
        const share = sharesDoJogador?.get(chave);
        return {
          magia: dados.magia,
          uso: {
            spellId: dados.magia.spellId,
            name: dados.magia.name,
            // Pode virar "offensive" aqui: ver categoriaEfetiva.
            kind: categoriaEfetiva(dados.magia.kind, dados.magia.cooldownMs, share),
            casts: dados.casts,
            timeOnCooldownMs: Math.round(dados.tempo),
            possibleMs,
            efficiency: Math.round((dados.tempo / possibleMs) * 1000) / 10,
            ...(share === undefined ? {} : { damageShare: Math.round(share * 100) / 100 }),
          } satisfies UsoDeCooldown,
        };
      })
      // Stun, silêncio, battle res e invocação de pet não são decisão de
      // atacar nem de se defender, e entravam na média afundando a nota.
      .filter(({ uso }) => uso.kind !== "utility")
      .filter(({ uso, magia }) => contaParaNota(uso, magia.cooldownMs, sharesDoJogador !== undefined))
      .map(({ uso }) => uso)
      .sort((a, b) => a.efficiency - b.efficiency);

    resultado.push({
      sourceID,
      possibleMs,
      abilities,
      offensive: media(abilities.filter((a) => a.kind === "offensive").map((a) => a.efficiency)),
      defensive: media(abilities.filter((a) => a.kind === "defensive").map((a) => a.efficiency)),
    });
  }

  return resultado.sort((a, b) => a.sourceID - b.sourceID);
}
