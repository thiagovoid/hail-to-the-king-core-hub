import { describe, expect, it } from "vitest";

import { familiaDoConsumivel } from "./familiaDoConsumivel";

/** Tooltips reais, conferidos em 02/10 contra nether.wowhead.com. */
const ITEM = '<div class="q0">Item Effect</div><td>Instant</td>';
const CLASSE = '<div class="wowhead-tooltip-requirements">Requires Warrior</div>';

describe("familiaDoConsumivel", () => {
  /**
   * O caso que motivou tudo: a poção mais usada do core não tem "poção" no
   * nome, e por isso a checagem antiga nunca a via. O ícone vê.
   */
  it("reconhece poção cujo NOME não diz poção", () => {
    expect(familiaDoConsumivel(ITEM, "inv_12_profession_alchemy_lightpotion_yellow")).toBe("pocao");
    expect(familiaDoConsumivel(ITEM, "inv_12_profession_alchemy_voidpotion_red")).toBe("pocao");
    expect(familiaDoConsumivel(ITEM, "inv_potion_49")).toBe("pocao");
  });

  it("separa pedra de vida de poção", () => {
    // São dois itens do Portão, não um: a conversa "você não usou poção" é
    // diferente de "você não usou a pedra que o bruxo fez pra você".
    expect(familiaDoConsumivel(ITEM, "warlock_-healthstone")).toBe("pedra");
    // A versão melhorada troca o nome do ícone pra "bloodstone".
    expect(familiaDoConsumivel(ITEM, "warlock_-bloodstone")).toBe("pedra");
  });

  /**
   * Trinket também é efeito de item. Se o ícone não disser a família, a
   * resposta é "não sei" — e o Portão não cobra trinket.
   */
  it("não confunde trinket com consumível", () => {
    expect(familiaDoConsumivel(ITEM, "inv_121_trinket_raid_ulatek_ritualvessel")).toBeUndefined();
    expect(familiaDoConsumivel(ITEM, "inv_skinning_80_armoredscale")).toBeUndefined();
    expect(familiaDoConsumivel(ITEM, "inv_misc_emberweavebandagelight")).toBeUndefined();
  });

  it("não confunde magia de classe com consumível", () => {
    // Sem o "Item Effect" nada entra, por mais que o ícone pareça.
    expect(familiaDoConsumivel(CLASSE, "inv_potion_49")).toBeUndefined();
    expect(familiaDoConsumivel(undefined, "inv_potion_49")).toBeUndefined();
  });

  it("não chuta sem ícone", () => {
    expect(familiaDoConsumivel(ITEM, undefined)).toBeUndefined();
    expect(familiaDoConsumivel(ITEM, "")).toBeUndefined();
  });
});

describe("a ordem dos padrões", () => {
  /**
   * O ícone do frasco contém as DUAS palavras:
   * `inv_12_profession_alchemy_flask_sindoreipotion_black`. Testando poção
   * primeiro, todo frasco da temporada viraria poção — e a tela diria que o
   * core toma o dobro de poção e nunca toma frasco.
   */
  it("frasco não vira poção, mesmo com 'potion' no ícone", () => {
    expect(
      familiaDoConsumivel(ITEM, "inv_12_profession_alchemy_flask_sindoreipotion_black")
    ).toBe("frasco");
    expect(
      familiaDoConsumivel(ITEM, "inv_12_profession_alchemy_flask_sindoreipotion_red--")
    ).toBe("frasco");
  });

  /**
   * `Hearty Well Fed` é o BUFF da comida, não o uso do item, e por isso não
   * traz "Item Effect". Exigir a marca pra todo mundo apagaria a comida
   * inteira — e a tela voltaria a acusar o core de algo que ele fez.
   */
  it("reconhece comida, que é buff e não traz 'Item Effect'", () => {
    expect(familiaDoConsumivel(undefined, "spell_misc_food")).toBe("comida");
    expect(familiaDoConsumivel(CLASSE, "spell_misc_food")).toBe("comida");
  });
});

describe("quando o nome decide", () => {
  /**
   * `Flask of Tempered Swiftness` e `Flask of Alchemical Chaos` usam
   * `inv_potion_green` e `inv_potion_orange` — frascos de expansão antiga
   * com ícone genérico de poção. Pelo ícone virariam poção, e a tela diria
   * que o core toma poção que não tomou e não toma frasco que tomou.
   */
  it("frasco com ícone de poção continua frasco", () => {
    expect(familiaDoConsumivel(ITEM, "inv_potion_green", "Flask of Tempered Swiftness")).toBe("frasco");
    expect(familiaDoConsumivel(ITEM, "inv_potion_orange", "Flask of Alchemical Chaos")).toBe("frasco");
  });

  /**
   * O `Seriously Sharp Seashell` é trinket e usa
   * `inv_misc_food_legion_seashelld2`. Com o padrão largo `_food` ele virava
   * comida, e a tela dava crédito a quem não comeu.
   */
  it("trinket com ícone de comida não vira comida", () => {
    expect(
      familiaDoConsumivel(ITEM, "inv_misc_food_legion_seashelld2", "Seriously Sharp Seashell")
    ).toBeUndefined();
  });

  it("pedra de amolar conta como óleo", () => {
    // É o óleo do ferreiro: prepara a arma do mesmo jeito.
    expect(
      familiaDoConsumivel(undefined, "inv_12_profession_blacksmithing_whetstones_crimson", "Critical Ritual")
    ).toBe("oleo");
  });

  it("poção de verdade continua poção", () => {
    expect(familiaDoConsumivel(ITEM, "inv_potion_49", "Concentrated Silvermoon Health Potion")).toBe("pocao");
    expect(familiaDoConsumivel(ITEM, "inv_12_profession_alchemy_lightpotion_yellow", "Light's Potential")).toBe("pocao");
  });
});
