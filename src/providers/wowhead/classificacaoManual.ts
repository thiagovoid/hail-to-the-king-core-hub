/**
 * Onde o tooltip erra, e onde o log não consegue ver.
 *
 * A classificação automática tem duas fontes, e cada uma tem um cego:
 *
 * 1. O TEXTO do tooltip (`classifyCooldown`), que procura frases de dano.
 *    Erra quando a habilidade é ofensiva sem dizer "damage" — Ascendance
 *    Elemental transforma o jogador e acelera Lava Burst sem citar dano em
 *    lugar nenhum.
 *
 * 2. O DANO no log (`categoriaEfetiva`), que promove utilidade a ofensiva
 *    quando ela responde por parte relevante do dano. Erra em buff PURO:
 *    Recklessness e Power Infusion não causam dano próprio, só aumentam o
 *    que sai — e portanto não aparecem na tabela de dano.
 *
 * O cruzamento das duas cobre quase tudo. O que sobra é esta tabela, e ela
 * é curta de propósito: cada entrada aqui é uma que as duas fontes erraram,
 * não uma preferência.
 *
 * Nada de meta, nada de peso: isto diz só em qual balde a magia cai.
 */
import type { TipoDeCooldown } from "./spellCooldown";

/**
 * Consumível não é kit: é compra.
 *
 * Poção, flask e pedra de vida já são cobrados no Portão de Preparação, e
 * medi-los de novo no aproveitamento de cooldown cobraria a mesma coisa duas
 * vezes. Trinket fica de fora desta regra de propósito — decisão do core de
 * 21/09/2026: apertar o trinket na recarga é execução, igual apertar a
 * habilidade.
 */
const PADRAO_DE_CONSUMIVEL = /\b(potion|flask|healthstone|draught|elixir)\b/i;
const PADRAO_DE_PEDRA = /\bhealthstone\b/i;

/**
 * Recarga de poção em combate. É o que separa consumível de trinket.
 *
 * Nome sozinho não separa: "Freightrunner's Flask" tem 90s de recarga e foi
 * usada 26,8 vezes por noite — é trinket com nome de flask, porque flask de
 * verdade não tem recarga e se bebe uma vez. Já toda poção real da temporada
 * tem 300s e sai 1 a 14 vezes por noite, que é uma por luta.
 *
 * Pedra de vida fica fora da regra de tempo: tem 60s e é consumível do mesmo
 * jeito. É criada pelo bruxo em vez de comprada, então nem aparece no
 * Portão — e continua não devendo pontuar em lugar nenhum.
 */
const RECARGA_DE_POCAO_MS = 300_000;

export function ehConsumivel(nome: string, cooldownMs: number): boolean {
  if (PADRAO_DE_PEDRA.test(nome)) return true;
  return PADRAO_DE_CONSUMIVEL.test(nome) && cooldownMs >= RECARGA_DE_POCAO_MS;
}

/**
 * A categoria certa quando as duas fontes automáticas erram.
 *
 * Chave é o `spellId`, nunca o nome: Ascendance tem três ids, um por spec do
 * xamã, e são magias diferentes com o mesmo nome. Classificar por nome
 * marcaria o Ascendance de Restauração como dano junto com o Elemental.
 */
export const CLASSIFICACAO_MANUAL = new Map<number, TipoDeCooldown>([
  // ---- Buff puro de dano: não aparece na tabela de dano do log ----

  // Ascendance Elemental (114050) e Aperfeiçoamento (114051). O do
  // Aperfeiçoamento já era promovido sozinho, porque Windfury aparece no
  // log; o Elemental é transformação pura e escapava. O de Restauração
  // (114052) fica FORA: é cooldown de cura, e entrar aqui o mandaria pra
  // Atacar, medindo a coisa errada num healer.
  [114050, "offensive"],
  [114051, "offensive"],

  // Recklessness (warrior): aumenta dano e geração de fúria, sem causar dano.
  [1719, "offensive"],

  // Power Infusion: aumenta o dano de quem recebe. Vale pro Sacerdote tanto
  // lançado em si quanto dado a outro — nos dois casos é decisão ofensiva.
  [10060, "offensive"],

  // Malevolence (bruxo): dano ao longo do tempo via Malefic Rapture.
  [442726, "offensive"],

  // Holy Word: Chastise — causa dano e atordoa. Dano primeiro, pela mesma
  // regra que rege Shield Charge.
  [88625, "offensive"],
]);

/**
 * A classificação final de uma magia, com a tabela manual por cima.
 *
 * A ordem importa: manual ganha do automático, porque a tabela só existe
 * pros casos em que o automático já se provou errado.
 */
export function classificacaoFinal(
  spellId: number,
  nome: string,
  cooldownMs: number,
  automatica: TipoDeCooldown
): TipoDeCooldown | "consumivel" {
  if (ehConsumivel(nome, cooldownMs)) return "consumivel";
  return CLASSIFICACAO_MANUAL.get(spellId) ?? automatica;
}
