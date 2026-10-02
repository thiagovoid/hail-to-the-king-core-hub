/**
 * Que tipo de consumível é a magia — sem lista de nomes.
 *
 * O problema que isto resolve: `Light's Potential` é a poção mais usada do
 * core e não tem "poção" no nome. `Draught of Rampant Abandon`, `Liquid
 * Luster` e `Slumbering Soul Serum` também não. Casar por nome erra, e
 * manter lista à mão envelhece a cada temporada — foi o pedido explícito de
 * quem coordena: "não quero refazer essa lista toda season".
 *
 * Os dois sinais usados vêm do tooltip do Wowhead e não dependem de nome,
 * idioma ou patch:
 *
 * 1. **`Item Effect`** — o tooltip marca assim o que vem de item. Habilidade
 *    de classe traz `Requires Warrior` no lugar. É o que separa consumível e
 *    trinket de magia de classe.
 * 2. **O ícone** — identificador interno da Blizzard, em inglês, estável
 *    entre patches. `inv_potion_49`, `inv_12_profession_alchemy_lightpotion_yellow`
 *    e `..._voidpotion_red` são poções; `inv_121_trinket_raid_...` é trinket;
 *    `warlock_-healthstone` é pedra de vida.
 *
 * Conferido contra o log de 01/10: as três poções usadas batem, e os três
 * trinkets do tier (Soulcoiler Ritual Vessel, Ultradon Cuirass, Ritual
 * Wraps) ficam de fora — nenhum tem "potion" no ícone.
 */

/** As famílias que o Portão de Preparação rastreia separadamente. */
export type FamiliaDeConsumivel = "pocao" | "pedra" | "frasco" | "oleo";

/**
 * O tooltip diz que a magia vem de um item?
 *
 * Sem isto, `Healing Stream Totem` (que tem "stream" no ícone) e qualquer
 * magia de classe com ícone parecido entrariam por engano.
 */
const EFEITO_DE_ITEM = /Item Effect/i;

/**
 * Ícone → família, na ordem em que se testa.
 *
 * `healthstone` antes de `potion` porque a pedra de vida é o consumível que
 * mais se confunde com poção de cura na conversa — e queremos os dois
 * separados na tela, não somados.
 */
const POR_ICONE: Array<{ padrao: RegExp; familia: FamiliaDeConsumivel }> = [
  // "bloodstone" porque a versão melhorada da pedra usa o ícone
  // `warlock_-bloodstone` — a regra do ícone acerta a grande maioria e erra
  // casos assim, e é por isso que o catálogo é versionado e corrigível.
  { padrao: /healthstone|bloodstone/i, familia: "pedra" },
  { padrao: /potion/i, familia: "pocao" },
  { padrao: /flask|alchemy_bottle/i, familia: "frasco" },
  { padrao: /weaponoil|_oil_|sharpening|weightstone|whetstone/i, familia: "oleo" },
];

/**
 * A família, ou `undefined` quando não é consumível.
 *
 * `undefined` não quer dizer "não é nada": quer dizer que esta regra não
 * sabe. Trinket cai aqui de propósito — ele é efeito de item mas não é
 * consumível, e o Portão não cobra trinket.
 */
export function familiaDoConsumivel(
  tooltipHtml: string | undefined,
  icone: string | undefined
): FamiliaDeConsumivel | undefined {
  if (!tooltipHtml || !EFEITO_DE_ITEM.test(tooltipHtml)) return undefined;

  const alvo = (icone ?? "").toLowerCase();
  if (!alvo) return undefined;

  return POR_ICONE.find(({ padrao }) => padrao.test(alvo))?.familia;
}
