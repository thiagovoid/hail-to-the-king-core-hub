/**
 * A nota de "Ajudar", a partir da utilidade de grupo medida na noite.
 *
 * O dado bruto é o mesmo de Atacar e Defender: quanto do tempo de luta cada
 * magia ficou em recarga. Só que aqui ele NÃO pode ser usado cru, e medir a
 * temporada inteira mostrou por quê:
 *
 * | categoria    | mediana | máximo |
 * |--------------|---------|--------|
 * | interromper  |     1,5 |    5,3 |
 * | controlar    |     4,0 |   32,7 |
 * | levantar     |    11,1 |   36,4 |
 * | acelerar     |    31,6 |   95,3 |
 *
 * Um Kick de 15 segundos só chegaria a 100% se houvesse cast pra interromper
 * a cada 15 segundos a luta inteira — não há. Um Power Infusion de 2 minutos
 * usado em recarga chega a 95%. Na régua crua, o guerreiro que interrompeu
 * tudo que apareceu tiraria 1 e o sacerdote tiraria 95, e a nota estaria
 * medindo O KIT, não a pessoa. Era exatamente o que não podia acontecer.
 *
 * Então cada magia é normalizada pelo SEU próprio teto: o melhor que já se
 * fez com aquela ferramenta nesta temporada. Quem tem só Kick é medido
 * contra o melhor Kick; quem tem lust, contra o melhor lust. A pergunta vira
 * "você tirou dessa magia o que ela dá?", que é a mesma pergunta pra todo
 * mundo, independente do que cada um carrega.
 */

import type { PlayerPerformance } from "../../types/performance";

/**
 * O melhor aproveitamento já visto de cada magia, nas 113 noites-jogador.
 *
 * É uma régua PROVISÓRIA por construção, e isso é uma propriedade, não um
 * defeito: quando alguém usa melhor do que já se usou, o teto sobe e a régua
 * fica mais dura pra todo mundo — inclusive pra quem a levantou.
 *
 * Magia com poucas noites tem teto frouxo (Pummel tem uma só). Ela aperta
 * sozinha conforme a temporada anda.
 */
export const TETO_DE_APROVEITAMENTO = new Map<number, number>([
  [853, 15.7], // Hammer of Justice — controlar, 20 noites
  [391054, 36.4], // Intercessão — levantar, 20 noites
  [57994, 3.1], // Wind Shear — interromper, 15 noites
  [32182, 61.6], // Heroism — acelerar, 14 noites
  [10060, 95.3], // Power Infusion — acelerar, 13 noites
  [47528, 4.2], // Mind Freeze — interromper, 10 noites
  [183752, 1.8], // Disrupt — interromper, 10 noites
  [61999, 32.4], // Erguer Aliado — levantar, 8 noites
  [192077, 31.6], // Wind Rush Totem — acelerar, 8 noites
  [96231, 4.4], // Rebuke — interromper, 7 noites
  [115750, 5.1], // Blinding Light — controlar, 5 noites
  [2139, 5.3], // Counterspell — interromper, 4 noites
  [73325, 2.7], // Leap of Faith — socorrer, 4 noites
  [80353, 32.2], // Time Warp — acelerar, 4 noites
  [8122, 2], // Psychic Scream — controlar, 2 noites
  [30283, 5.4], // Shadowfury — controlar, 2 noites
  [32375, 9.5], // Mass Dispel — socorrer, 2 noites
  [51485, 1.6], // Earthgrab Totem — controlar, 2 noites
  [192058, 32.7], // Capacitor Totem — controlar, 2 noites
  [6552, 1.2], // Pummel — interromper, 1 noite
  [15487, 0.9], // Silence — interromper, 1 noite
  [20707, 13.9], // Pedra da Alma — levantar, 1 noite
  [207167, 0.7], // Blinding Sleet — controlar, 1 noite
  [207684, 4], // Sigil of Misery — controlar, 1 noite
  [221562, 6.3], // Asphyxiate — controlar, 1 noite
  [383013, 3.5], // Poison Cleansing Totem — socorrer, 1 noite
  [472433, 67.3], // Evangelism — socorrer, 1 noite
]);

/**
 * Teto de quem ainda não tem teto medido.
 *
 * Magia nova (alguém trocou de spec, entrou gente) não tem histórico. Usar
 * 100 exigiria manter o cooldown em recarga a luta inteira e daria nota
 * quase zero; usar o próprio uso daria 100 de graça. 10% é a mediana
 * aproximada do que as magias com histórico alcançam — a pessoa entra numa
 * régua plausível e ela se corrige na primeira recalibragem.
 */
export const TETO_PADRAO = 10;

/**
 * Interromper é contado pelo ATO e nunca pela magia, e isso foi um conserto
 * que a leitura do core pegou: a primeira versão media a recarga das magias
 * de interromper e o resultado contradizia o log. O Apocalipse interrompe
 * 34, 35, 19 vezes por noite; o Blackwatch, 13, 4, 2. Mesmo assim a
 * eficiência de Rebuke do Apocalipse saía em 0,9 contra 2,0 do Mind Freeze
 * do Blackwatch — invertido, porque a maior parte das interrupções de um
 * Paladino de Proteção sai do Avenger's Shield, que é rotação e não entra em
 * lista curada nenhuma. Medir a magia mede o kit; medir o ato mede a pessoa.
 */

/**
 * A nota de Ajudar, 0-100. Null quando a noite não tem utilidade medida.
 *
 * Null, e não zero: o caso comum é a spec não ter utilidade de grupo
 * nenhuma, e dimensão nula sai da média ponderada do Score em vez de
 * empurrar a pessoa pra baixo por algo que ela não escolheu.
 */
export function notaDeAjudar(
  helpDetail: PlayerPerformance["helpDetail"],
  utility?: PlayerPerformance["utility"],
  tries?: PlayerPerformance["tries"]
): number | null {
  const notas: number[] = [];

  // Interromper sai por fora: é medido pelo ATO, e as magias de interromper
  // saem da conta de recarga pra não contar a mesma coisa duas vezes.
  for (const habilidade of helpDetail ?? []) {
    if (habilidade.categoria === "interromper") continue;

    const teto = TETO_DE_APROVEITAMENTO.get(habilidade.spellId) ?? TETO_PADRAO;
    // Teto zero não existe na tabela, mas uma régua futura pode trazer um —
    // e dividir por zero viraria Infinity na nota de alguém.
    notas.push(teto <= 0 ? 100 : Math.min(100, (habilidade.efficiency / teto) * 100));
  }

  /**
   * Sem magia de utilidade medida, a dimensão continua nula — e o bônus de
   * interromper não resgata isso.
   *
   * Tentador seria deixar o bônus virar a nota, pra creditar quem só
   * interrompe. Mas 24 das 113 noites-jogador da temporada estão nesse caso,
   * e um bônus de no máximo 15 pontos virando nota daria Ajudar 15 pra quem
   * apertou o kick — punição vestida de crédito, que é exatamente o que a
   * régua nova existe pra acabar.
   *
   * Nula é o certo: a dimensão sai da média ponderada do Score e o peso se
   * redistribui, em vez de a pessoa carregar um número baixo por algo que
   * não temos como medir nela. O que ela interrompeu aparece como dado de
   * apoio na tela de qualquer jeito.
   */
  if (notas.length === 0) return null;

  const base = notas.reduce((soma, nota) => soma + nota, 0) / notas.length;

  /**
   * Interromper entra como PISO, não como parcela nem como acréscimo.
   *
   * Como parcela era a régua antiga, e ela puxava pra baixo quem apertava
   * pouco. Como acréscimo de 15 pontos ficou pior de outro jeito: o
   * Apocalipse, numa noite em que interrompeu 34 vezes — três vezes a parte
   * dele — saía com Ajudar 17, porque as magias dele naquela noite renderam
   * 3. Dizer que a ajuda dele ao grupo foi 17 é um número que ninguém
   * acredita, e a dimensão inteira perde crédito junto.
   *
   * Piso resolve os dois: nunca desce (o máximo com a base garante isso,
   * então apertar o kick uma vez continua não custando nada) e reconhece
   * quem carrega o trabalho de interromper mesmo quando o resto do kit não
   * foi usado.
   */
  return Math.round(Math.max(base, notaDeInterromper(utility)) * 10) / 10;
}

/**
 * A nota de interromper sozinha, 0-100 — usada como PISO de Ajudar.
 *
 * Interromper é dever de time, não de pessoa: o raide cobre 87% das
 * oportunidades em luta de boss, mas onze pessoas dividem isso de forma
 * muito desigual, e não existe no log quem era o designado. Punir o
 * indivíduo por uma falha que pode não ser dele seria acusar sem laudo — por
 * isso ela só pode levantar a nota, nunca baixá-la.
 *
 * A régua é a PARTE IGUAL: se onze pessoas interromperam naquelas trys,
 * cumprir um onze avos das oportunidades vale a nota cheia. Quem faz mais
 * não ganha além disso, porque o trabalho já estava coberto — e quem faz
 * menos não perde nada, porque o máximo com a base segura.
 */
export function notaDeInterromper(utility?: PlayerPerformance["utility"]): number {
  const dados = utility?.interrupcoes;
  if (!dados || dados.oportunidades === 0 || dados.seus === 0) return 0;

  // Sem ninguém interrompendo não há com quem dividir: a régua vira a
  // oportunidade inteira, que é o caso de quem interrompeu sozinho.
  const parteIgual = dados.oportunidades / Math.max(1, dados.pessoasQueInterromperam);

  return Math.min(100, (dados.seus / parteIgual) * 100);
}
