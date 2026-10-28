/**
 * Que tipo de consumível é a magia — sem lista de nomes.
 *
 * O problema que isto resolve: `Light's Potential` é a poção mais usada do
 * core e não tem "poção" no nome. `Draught of Rampant Abandon`, `Liquid
 * Luster` e `Slumbering Soul Serum` também não. Casar por nome erra, e
 * manter lista à mão envelhece a cada temporada — foi o pedido explícito de
 * quem coordena: "não quero refazer essa lista toda season".
 *
 * O sinal é o ÍCONE: identificador interno da Blizzard, em inglês, estável
 * entre patches e independente do nome do item. `inv_potion_49` e
 * `inv_12_profession_alchemy_lightpotion_yellow` são poção; `spell_misc_food`
 * é comida; `inv_121_trinket_raid_...` é trinket e não entra.
 *
 * Conferido contra o log de 01/10: as poções, os frascos e a comida de 17
 * jogadores batem, e os três trinkets do tier ficam de fora.
 */

/** As famílias que o Portão de Preparação rastreia separadamente. */
import { extractCooldownMs, limparHtml } from "./spellCooldown";

export type FamiliaDeConsumivel = "pocao" | "pedra" | "frasco" | "comida" | "oleo";

/**
 * Recarga acima disto não é consumível de combate — é brinquedo.
 *
 * Toda poção da temporada tem 300s: são oito, todas iguais. O
 * `Aracnoshape` tem 3600s e o tooltip diz "Morph into a giant spider" —
 * brinquedo cosmético que passou por poção porque o ícone é
 * `inv_alchemy_70_potion2` e contém a palavra, e porque "Item Effect"
 * estava lá como em qualquer item.
 *
 * O teto é generoso de propósito: o dobro da recarga real da poção ainda
 * cabe embaixo dele, e uma hora não chega perto. Não é lista de item — é a
 * mesma ideia do `ehConsumivel`, que já usa tempo de recarga pra separar
 * consumível de trinket com nome parecido.
 */
const RECARGA_DEMAIS_MS = 600_000;

/**
 * O tooltip diz que a magia vem de um item?
 *
 * Serve pra separar poção e pedra de magia de classe com ícone parecido —
 * magia de classe traz `Requires Warrior` no lugar. Comida NÃO passa por
 * aqui: `Hearty Well Fed` é o buff, não o uso do item, e não traz a marca.
 */
const EFEITO_DE_ITEM = /Item Effect/i;

/**
 * Ícone → família, **na ordem em que se testa**, e a ordem é o perigo.
 *
 * `frasco` vem antes de `pocao` porque o ícone do frasco contém as duas
 * palavras: `inv_12_profession_alchemy_flask_sindoreipotion_black`. Testando
 * poção primeiro, todo frasco da temporada viraria poção — e a tela diria
 * que o core toma o dobro de poção e nunca toma frasco.
 *
 * `exigeItemEffect` é por família: comida é buff e não carrega a marca, mas
 * `spell_misc_food` não se confunde com habilidade de classe nenhuma.
 */
const POR_ICONE: Array<{
  padrao: RegExp;
  familia: FamiliaDeConsumivel;
  exigeItemEffect: boolean;
}> = [
  // "bloodstone" porque a versão melhorada da pedra usa `warlock_-bloodstone`.
  { padrao: /healthstone|bloodstone/i, familia: "pedra", exigeItemEffect: true },
  { padrao: /flask/i, familia: "frasco", exigeItemEffect: true },
  { padrao: /potion/i, familia: "pocao", exigeItemEffect: true },
  { padrao: /weaponoil|_oil_|sharpening|weightstone|whetstone/i, familia: "oleo", exigeItemEffect: false },
  // `spell_misc_food` e não `_food`: o `Seriously Sharp Seashell` é trinket
  // e usa `inv_misc_food_legion_seashelld2` — o padrão largo o transformava
  // em comida, e a tela daria crédito de comida a quem não comeu.
  { padrao: /^spell_misc_food/i, familia: "comida", exigeItemEffect: false },
];

/**
 * Quando o NOME decide, porque o ícone não dá conta.
 *
 * `Flask of Tempered Swiftness` e `Flask of Alchemical Chaos` usam
 * `inv_potion_green` e `inv_potion_orange` — frascos de expansão antiga com
 * ícone genérico de poção. Pelo ícone virariam poção, e a tela diria que o
 * core toma poção que não tomou e não toma frasco que tomou.
 *
 * Isto NÃO é a lista por temporada que se quis evitar: é um padrão de nome,
 * não um inventário de itens. Frasco novo que se chame "Flask of alguma
 * coisa" entra sozinho.
 */
const NOME_DECIDE: Array<{ padrao: RegExp; familia: FamiliaDeConsumivel }> = [
  { padrao: /\bflask\b/i, familia: "frasco" },
  { padrao: /\bwell fed\b/i, familia: "comida" },
];

/**
 * A família, ou `undefined` quando não é consumível.
 *
 * `undefined` não quer dizer "não é nada": quer dizer que esta regra não
 * sabe. Trinket cai aqui de propósito — é efeito de item mas não é
 * consumível, e o Portão não cobra trinket.
 */
export function familiaDoConsumivel(
  tooltipHtml: string | undefined,
  icone: string | undefined,
  nome?: string
): FamiliaDeConsumivel | undefined {
  const porNome = nome ? NOME_DECIDE.find(({ padrao }) => padrao.test(nome)) : undefined;
  if (porNome) return porNome.familia;

  const alvo = (icone ?? "").toLowerCase();
  if (!alvo) return undefined;

  const achado = POR_ICONE.find(({ padrao }) => padrao.test(alvo));
  if (!achado) return undefined;

  if (achado.exigeItemEffect && !EFEITO_DE_ITEM.test(tooltipHtml ?? "")) return undefined;

  // Depois do ícone, não antes: comida e óleo não declaram recarga nenhuma,
  // e cortar por tempo primeiro os derrubaria junto.
  const recarga = extractCooldownMs(limparHtml(tooltipHtml ?? ""));
  if (recarga !== undefined && recarga > RECARGA_DEMAIS_MS) return undefined;

  return achado.familia;
}
