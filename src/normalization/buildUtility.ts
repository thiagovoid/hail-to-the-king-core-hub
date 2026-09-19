/**
 * Utilidade: o trabalho que não aparece em dano nem em cura.
 *
 * Interromper um cast que mataria o raide, tirar um debuff da pessoa certa,
 * levantar quem caiu — nada disso entra no Score hoje, e é o que costuma
 * separar um grupo que limpa heroico de um que não passa. Numa noite de 12
 * trys foram 22 interrupções e 79 dispels: evento raro, alto impacto.
 *
 * Tudo aqui é indexado por `actorId` da WCL, como o resto de
 * `buildNightDetail` — a tradução pra id do roster fica na camada que chama.
 */

/** Um evento de interrupção ou dispel, como a WCL entrega. */
export interface EventoDeUtilidade {
  sourceID: number;
  /** Só em dispel: se o que saiu era buff do inimigo, não debuff nosso. */
  isBuff?: boolean;
}

/** Um cast, pro battle rez sair sem chamada nova. */
export interface CastParaRez {
  sourceID: number;
  abilityGameID: number;
}

/**
 * As magias de ressurreição EM COMBATE.
 *
 * `Resurrects` não existe no enum de eventos da WCL — conferido no CI, ela
 * sugere "Resources". Mas battle rez é um cast como outro qualquer, e os
 * casts já vêm todos no bruto: dá pra derivar sem uma requisição a mais.
 *
 * Só as de combate entram. Ressurreição fora de combate é rotina de wipe,
 * não decisão sob pressão — e o que se quer reconhecer aqui é a segunda.
 */
export const MAGIAS_DE_BATTLE_REZ = new Map<number, string>([
  [20484, "Renascimento"], // Druida
  [61999, "Erguer Aliado"], // Cavaleiro da Morte
  [20707, "Pedra da Alma"], // Bruxo — aplicada antes, usada na morte
  [391054, "Intercessão"], // Paladino
  [265116, "Ressuscitador Automático"], // Engenharia
]);

export interface UtilidadeDoJogador {
  /** Casts inimigos interrompidos. */
  interrupts: number;
  /** Debuffs tirados de alguém do raide. */
  dispels: number;
  /** Buffs arrancados do inimigo — outra grandeza, contada separada. */
  purges: number;
  /** Battle rez lançados. */
  battleRez: number;
}

const VAZIO: UtilidadeDoJogador = { interrupts: 0, dispels: 0, purges: 0, battleRez: 0 };

/**
 * Quanto de utilidade cada ator entregou na noite.
 *
 * Só quem fez alguma coisa aparece: zero não é o mesmo que ausente, e quem
 * não tem interrupção na spec não pode ser medido por ela.
 */
export function buildUtility(
  interrupts: EventoDeUtilidade[],
  dispels: EventoDeUtilidade[],
  casts: CastParaRez[]
): Map<number, UtilidadeDoJogador> {
  const porAtor = new Map<number, UtilidadeDoJogador>();

  const doAtor = (sourceID: number) => {
    const atual = porAtor.get(sourceID) ?? { ...VAZIO };
    porAtor.set(sourceID, atual);
    return atual;
  };

  for (const evento of interrupts) doAtor(evento.sourceID).interrupts += 1;

  for (const evento of dispels) {
    // Tirar debuff do amigo e arrancar buff do inimigo são decisões
    // diferentes; somar as duas esconderia qual delas a pessoa faz.
    if (evento.isBuff) doAtor(evento.sourceID).purges += 1;
    else doAtor(evento.sourceID).dispels += 1;
  }

  for (const cast of casts) {
    if (MAGIAS_DE_BATTLE_REZ.has(cast.abilityGameID)) doAtor(cast.sourceID).battleRez += 1;
  }

  return porAtor;
}
