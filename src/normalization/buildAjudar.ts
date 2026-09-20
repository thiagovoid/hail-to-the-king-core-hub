/**
 * "Ajudar": o que você fez PELO GRUPO.
 *
 * É a dimensão que faltava. Atacar mede o seu dano, Defender mede a sua
 * sobrevivência, Curar mede o seu ofício — e nenhuma delas vê o kick que
 * salvou a try, o totem que segurou os adds, o lust na hora certa. Esse
 * trabalho não aparece em número nenhum do log e é o que costuma separar um
 * grupo que limpa heroico de um que não passa.
 *
 * A régua é VOCÊ CONTRA VOCÊ MESMO, e isso não é slogan: a nota é o tempo em
 * que os SEUS cooldowns de utilidade ficaram em recarga, contra a recarga
 * DELES. Exatamente a mesma conta de Atacar e Defender.
 *
 * Três consequências, todas de propósito:
 *
 * 1. **Kit diferente não penaliza.** Quem não tem lust não é medido por
 *    lust: a magia que você não tem simplesmente não entra na sua média.
 *    Quem não tem utilidade de grupo nenhuma fica com a dimensão NULA, e
 *    dimensão nula sai da média ponderada do Score em vez de virar zero.
 * 2. **Não compara ninguém com ninguém.** O denominador é a recarga da sua
 *    própria magia, não o que o resto do raide fez.
 * 3. **Recarga curta não vira vantagem.** Um kick de 15s e um lust de 5min
 *    são medidos pela mesma pergunta — "ficou parado na sua mão?" —, e não
 *    por quantidade de usos, que favoreceria quem tem cooldown curto.
 */

import type { CooldownsDoJogador, UsoDeCooldown } from "../providers/warcraftlogs/cooldownUsage";
import type { CooldownDaMagia } from "../providers/wowhead/spellCooldown";
import type { PlayerPerformance } from "../types/performance";

/** Pra que serve a magia. Só explica na tela; não muda a conta. */
export type CategoriaDeAjuda =
  | "acelerar"
  | "controlar"
  | "interromper"
  | "socorrer"
  | "levantar";

export const ROTULO_DA_CATEGORIA: Record<CategoriaDeAjuda, string> = {
  acelerar: "Acelerar o raide",
  controlar: "Controlar adds",
  interromper: "Interromper",
  socorrer: "Socorrer alguém",
  levantar: "Levantar quem caiu",
};

/**
 * A lista CURADA de utilidade de grupo.
 *
 * Curada, e não automática, porque a gaveta "utility" do catálogo do Wowhead
 * é o que sobra depois de separar ofensivo e defensivo — e o que sobra são
 * 89 magias em que Flurry (2001 usos na temporada), Immolation Aura (1745) e
 * Divine Steed (1380) convivem com Bloodlust e Mass Dispel. Pontuar aquela
 * gaveta daria nota por apertar botão de rotação e por montar no cavalo.
 *
 * O critério de entrada é um só: **a magia faz alguma coisa por OUTRA
 * pessoa**. Mobilidade pessoal, defensivo pessoal e cooldown de dano ficam
 * de fora — os dois últimos já são medidos em Defender e Atacar, e contar de
 * novo aqui faria o mesmo acerto valer dobrado.
 */
export const UTILIDADE_DE_GRUPO = new Map<number, CategoriaDeAjuda>([
  // --- acelerar o raide ---
  [2825, "acelerar"], // Bloodlust
  [32182, "acelerar"], // Heroism
  [80353, "acelerar"], // Time Warp
  [192077, "acelerar"], // Wind Rush Totem
  [10060, "acelerar"], // Power Infusion

  // --- controlar adds ---
  [192058, "controlar"], // Capacitor Totem
  [51485, "controlar"], // Earthgrab Totem
  [108199, "controlar"], // Gorefiend's Grasp
  [115750, "controlar"], // Blinding Light
  [207167, "controlar"], // Blinding Sleet
  [207684, "controlar"], // Sigil of Misery
  [30283, "controlar"], // Shadowfury
  [8122, "controlar"], // Psychic Scream
  [853, "controlar"], // Hammer of Justice
  [20549, "controlar"], // War Stomp
  [221562, "controlar"], // Asphyxiate
  [19577, "controlar"], // Intimidation
  [187650, "controlar"], // Freezing Trap

  // --- socorrer alguém ---
  [73325, "socorrer"], // Leap of Faith
  [108280, "socorrer"], // Healing Tide Totem
  [383013, "socorrer"], // Poison Cleansing Totem
  [32375, "socorrer"], // Mass Dispel
  [472433, "socorrer"], // Evangelism

  // --- levantar quem caiu ---
  [391054, "levantar"], // Intercessão (Paladino)
  [61999, "levantar"], // Erguer Aliado (Cavaleiro da Morte)
  [20707, "levantar"], // Pedra da Alma (Bruxo)

  // --- interromper ---
  //
  // Elas entram junto das de recarga longa de propósito: a pergunta é a
  // mesma pros dois lados ("ficou parado na sua mão?"), e é ela que impede
  // que um kick de 15s valha mais que um lust de 5min só por caber mais
  // vezes na luta.
  [1766, "interromper"], // Kick
  [2139, "interromper"], // Counterspell
  [6552, "interromper"], // Pummel
  [47528, "interromper"], // Mind Freeze
  [57994, "interromper"], // Wind Shear
  [96231, "interromper"], // Rebuke
  [183752, "interromper"], // Disrupt
  [19647, "interromper"], // Spell Lock
  [147362, "interromper"], // Counter Shot
  [15487, "interromper"], // Silence
  [116705, "interromper"], // Spear Hand Strike
  [106839, "interromper"], // Skull Bash
  [351338, "interromper"], // Quell
]);

/**
 * As interrupções com a recarga escrita à mão.
 *
 * O catálogo do Wowhead corta tudo abaixo de 30 segundos, porque abaixo
 * disso é rotação e não cooldown (ver COOLDOWN_MINIMO_MS) — e é um corte
 * certo pro resto do site. Só que ele derruba justamente as interrupções:
 * Wind Shear tem 12s, Kick e Pummel 15s. Sem esta tabela, "Ajudar" ficaria
 * sem a utilidade que o core mais usa (105 Wind Shear, 56 Counterspell e 30
 * Pummel na temporada).
 *
 * São números estáveis do jogo, não dado coletado. Se uma mudar de patch, o
 * conserto é aqui e vale pra temporada inteira.
 */
export const RECARGA_DAS_INTERRUPCOES = new Map<number, CooldownDaMagia>([
  [1766, { spellId: 1766, name: "Kick", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [2139, { spellId: 2139, name: "Counterspell", cooldownMs: 24_000, charges: 1, kind: "utility" }],
  [6552, { spellId: 6552, name: "Pummel", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [47528, { spellId: 47528, name: "Mind Freeze", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [57994, { spellId: 57994, name: "Wind Shear", cooldownMs: 12_000, charges: 1, kind: "utility" }],
  [96231, { spellId: 96231, name: "Rebuke", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [183752, { spellId: 183752, name: "Disrupt", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [19647, { spellId: 19647, name: "Spell Lock", cooldownMs: 24_000, charges: 1, kind: "utility" }],
  [147362, { spellId: 147362, name: "Counter Shot", cooldownMs: 24_000, charges: 1, kind: "utility" }],
  [116705, { spellId: 116705, name: "Spear Hand Strike", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [106839, { spellId: 106839, name: "Skull Bash", cooldownMs: 15_000, charges: 1, kind: "utility" }],
  [351338, { spellId: 351338, name: "Quell", cooldownMs: 40_000, charges: 1, kind: "utility" }],
]);

export interface AjudaDoJogador {
  help: NonNullable<PlayerPerformance["help"]>;
  helpDetail: NonNullable<PlayerPerformance["helpDetail"]>;
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * Monta a dimensão a partir dos cooldowns já medidos da noite.
 *
 * Devolve `undefined` quando a pessoa não tem NENHUMA utilidade de grupo
 * medida. É diferente de nota zero: zero diria "tinha e não usou", e o caso
 * comum aqui é "a spec não tem". A dimensão ausente sai da média ponderada
 * do Score, que é a regra da casa pra dado que não existe.
 */
export function buildAjudar(cooldowns: CooldownsDoJogador | undefined): AjudaDoJogador | undefined {
  const deGrupo: UsoDeCooldown[] = (cooldowns?.abilities ?? []).filter((habilidade) =>
    UTILIDADE_DE_GRUPO.has(habilidade.spellId)
  );

  if (deGrupo.length === 0) return undefined;

  const media = deGrupo.reduce((soma, h) => soma + h.efficiency, 0) / deGrupo.length;

  return {
    help: {
      score: arredondar(media),
      abilities: deGrupo.length,
      casts: deGrupo.reduce((soma, h) => soma + h.casts, 0),
    },
    // Do pior aproveitado pro melhor: o topo da lista é o que treinar.
    helpDetail: deGrupo
      .slice()
      .sort((a, b) => a.efficiency - b.efficiency)
      .map((habilidade) => ({
        spellId: habilidade.spellId,
        name: habilidade.name,
        casts: habilidade.casts,
        efficiency: habilidade.efficiency,
        categoria: UTILIDADE_DE_GRUPO.get(habilidade.spellId)!,
      })),
  };
}
