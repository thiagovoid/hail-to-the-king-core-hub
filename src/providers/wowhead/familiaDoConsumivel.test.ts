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
