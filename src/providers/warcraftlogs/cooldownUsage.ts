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
  catalogo: Map<number, CooldownDaMagia>
): CooldownsDoJogador[] {
  const porJanela = new Map(janelas.map((j) => [j.id, j]));

  // jogador -> try -> habilidade -> timestamps
  const castsPorJogador = new Map<number, Map<number, Map<number, number[]>>>();
  const trysPorJogador = new Map<number, Set<number>>();

  for (const evento of eventos) {
    if (!porJanela.has(evento.fight)) continue;

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

    const acumulado = new Map<number, { casts: number; tempo: number }>();
    for (const [fightId, porHabilidade] of castsPorJogador.get(sourceID) ?? []) {
      const janela = porJanela.get(fightId)!;
      for (const [spellId, timestamps] of porHabilidade) {
        const magia = catalogo.get(spellId)!;
        const atual = acumulado.get(spellId) ?? { casts: 0, tempo: 0 };
        atual.casts += timestamps.length;
        atual.tempo += tempoEmRecarga(timestamps, janela, magia.cooldownMs, magia.charges);
        acumulado.set(spellId, atual);
      }
    }

    const abilities: UsoDeCooldown[] = [...acumulado.entries()]
      // "utility" fica de fora: stun, silêncio, battle res e invocação de
      // pet não são decisão de atacar nem de se defender, e entravam na
      // média afundando a nota (ver classifyCooldown).
      .filter(([spellId]) => catalogo.get(spellId)!.kind !== "utility")
      .map(([spellId, dados]) => {
        const magia = catalogo.get(spellId)!;
        return {
          spellId,
          name: magia.name,
          kind: magia.kind,
          casts: dados.casts,
          timeOnCooldownMs: Math.round(dados.tempo),
          possibleMs,
          efficiency: Math.round((dados.tempo / possibleMs) * 1000) / 10,
        };
      })
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
