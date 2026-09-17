import { describe, expect, it } from "vitest";
import { parsePreparationGuide } from "./normalize";

/**
 * Recorte do HTML real de
 * wowhead.com/guide/classes/demon-hunter/havoc/enchants-gems-pve-dps,
 * incluindo os `<br />` soltos entre as linhas que a página tem de verdade.
 */
const REAL_HTML = `
<table><br /><tr><br /><td><b>Slot</b></td><br /><td><b>Best</b></td><br /></tr><br />
<tr><td>Weapon</td><td><a href="/item=273072/enchant-weapon-rite-of-the-hashey">Enchant Weapon - Rite of the Hash&#39;ey</a></td></tr><br />
<tr><td>Helm</td><td><a href="/item=244007/enchant-helm-empowered-rune-of-avoidance">Enchant Helm - Empowered Rune of Avoidance</a></td></tr><br />
<tr><td>Legs</td><td><a href="/item=244641/forest-hunters-armor-kit">Forest Hunter&#39;s Armor Kit</a></td></tr><br />
<tr><td>Ring</td><td><a href="/item=243957/enchant-ring-eyes-of-the-eagle">Enchant Ring - Eyes of the Eagle</a></td></tr><br />
<tr><td>Eversong Diamond</td><td><a href="/item=240983/indecipherable-eversong-diamond">Indecipherable Eversong Diamond</a></td></tr><br />
<tr><td>Other Gems</td><td><a href="/item=240908/flawless-masterful-garnet">Flawless Masterful Garnet</a></td></tr>
</table>
<table><br /><tr><td><b>Type</b></td><td><b>Best</b></td></tr><br />
<tr><td>Flask</td><td><a href="/item=241326/flask-of-the-shattered-sun">Flask of the Shattered Sun</a></td></tr><br />
<tr><td>Combat Potion</td><td><a href="/item=999001/potion-of-recklessness">Potion of Recklessness</a></td></tr><br />
<tr><td>Weapon Buffs</td><td><a href="/item=999002/thalassian-phoenix-oil">Thalassian Phoenix Oil</a></td></tr><br />
<tr><td>Food</td><td><a href="/item=999003/royal-roast">Royal Roast</a> / <a href="/item=999004/hearty-royal-roast">Hearty Royal Roast</a></td></tr>
</table>
`;

/**
 * Recorte do HTML real do guia de Enhancement Shaman, onde as gemas **não**
 * estão na tabela: vêm em prosa sob um `<h3>`, com as alternativas em `<ul>`.
 */
const GEMS_IN_PROSE_HTML = `
<h2 class="heading-size-2">Best Enhancement Shaman Gems and Enchants in Midnight Season 2</h2>
<table><tr><td><b>Slot</b></td><td><b>Best Enchant</b></td></tr>
<tr><td><b>Main Hand</b></td><td><a href="/item=273072/enchant-weapon-rite-of-the-hashey">Enchant Weapon - Rite of the Hash&#39;ey</a></td></tr>
<tr><td><b>Chest</b></td><td><a href="/item=243977/enchant-chest-mark-of-the-worldsoul">Enchant Chest - Mark of the Worldsoul</a></td></tr>
</table>
<h3 class="heading-size-3">Enhancement Shaman Gems</h3><br />Effects like <a href="/item=244003/enchant-chest-mark-of-the-magister">Enchant Chest - Mark of the Magister</a> gain value.<br />
<ul><li><b><i>With</i> 5+ Sockets</b><br />Eversong Diamond <b>&amp;ndash;</b> <a href="/item=240967/powerful-eversong-diamond">Powerful Eversong Diamond</a>.</li><li>Other Gems <b>&amp;ndash;</b> one each of <a href="/item=240900/flawless-quick-amethyst">Flawless Quick Amethyst</a> &amp; <a href="/item=240892/flawless-masterful-peridot">Flawless Masterful Peridot</a></li></ul>
<b><i>Without</i> 5+ Sockets</b><ul><li>Eversong Diamond <b>&amp;ndash;</b> <a href="/item=240983/indecipherable-eversong-diamond">Indecipherable Eversong Diamond</a>.</li></ul>
<h3 class="heading-size-3">Enhancement Shaman Weapon Enchant</h3><br />
The new enchant - <a href="/item=273072/enchant-weapon-rite-of-the-hashey">Enchant Weapon - Rite of the Hash&#39;ey</a> - is the ideal pick.
`;

describe("parsePreparationGuide — gemas em prosa", () => {
  const guide = parsePreparationGuide(GEMS_IN_PROSE_HTML);

  it("acha as gemas mesmo quando o guia não as põe em tabela", () => {
    expect(guide.gems.map((gem) => gem.itemId)).toEqual([240967, 240900, 240892, 240983]);
  });

  it("mantém as alternativas — a checagem aceita qualquer uma das recomendadas", () => {
    expect(guide.gems.map((gem) => gem.name)).toContain("Powerful Eversong Diamond");
    expect(guide.gems.map((gem) => gem.name)).toContain("Indecipherable Eversong Diamond");
  });

  it("não confunde encanto com gema: a seção de arma fica fora", () => {
    expect(guide.gems.map((gem) => gem.itemId)).not.toContain(273072);
    expect(guide.enchants.map((enchant) => enchant.slot)).toEqual(["Main Hand", "Chest"]);
  });

  it("classifica pelo nome quando o rótulo do slot é uma grafia desconhecida", () => {
    // "Helmet" (em vez de "Helm") aparece em guias reais. Antes de tratar o
    // nome "Enchant ...", esse encanto entrava como gema.
    const html = `<table><tr><td><b>Slot</b></td><td><b>Best</b></td></tr>
      <tr><td>Fivela Exótica</td><td><a href="/item=1/e">Enchant Helm - Empowered Hex of Leeching</a></td></tr></table>`;
    const parsed = parsePreparationGuide(html);

    expect(parsed.gems).toEqual([]);
    expect(parsed.enchants.map((enchant) => enchant.name)).toEqual(["Enchant Helm - Empowered Hex of Leeching"]);
  });

  it("ignora item citado na prosa quando a seção tem lista", () => {
    // O parágrafo cita um encanto pra explicar sinergia, não pra recomendar
    // uma gema. Contá-lo faria a gema real do jogador virar "não recomendada".
    expect(guide.gems.map((gem) => gem.itemId)).not.toContain(244003);
  });

  it("lê a prosa quando a seção não tem lista nenhuma", () => {
    // Unholy Death Knight escreve as gemas direto no parágrafo. Sem esta
    // saída, a spec ficaria sem recomendação alguma.
    const html = `<table><tr><td><b>Slot</b></td><td><b>Best</b></td></tr>
      <tr><td>Chest</td><td><a href="/item=243977/e">Enchant Chest - Mark of the Worldsoul</a></td></tr></table>
      <h3>Unholy Death Knight Gems</h3>
      You'll want <a href="/item=240983/indecipherable-eversong-diamond">Indecipherable Eversong Diamond</a> as your Diamond,
      then <a href="/item=240908/flawless-masterful-garnet">Flawless Masterful Garnet</a>.
      <h3>Unholy Death Knight Weapon Enchant</h3>`;

    expect(parsePreparationGuide(html).gems.map((gem) => gem.itemId)).toEqual([240983, 240908]);
  });

  it("na prosa, aceita só o que é pedra — encanto e equipamento citados ficam fora", () => {
    // Os dois casos reais: o guia de Resto cita encantos ao falar de mana, e
    // o de Retribution cita um anel ("Band") como condicional de stat.
    const html = `<table><tr><td><b>Slot</b></td><td><b>Best</b></td></tr>
      <tr><td>Chest</td><td><a href="/item=243977/e">Enchant Chest - Mark of the Worldsoul</a></td></tr></table>
      <h3>Gems</h3>
      Effects like <a href="/item=244003/enchant-chest-mark">Enchant Chest - Mark of the Magister</a> and
      <a href="/item=240155/arcanoweave-spellthread">Arcanoweave Spellthread</a> gain value, so use
      <a href="/item=240968/telluric-eversong-diamond">Telluric Eversong Diamond</a>.
      If you have <a href="/item=251513/loa-worshipers-band">Loa Worshiper's Band</a>, use a Peridot.`;

    expect(parsePreparationGuide(html).gems.map((gem) => gem.itemId)).toEqual([240968]);
  });
});

describe("parsePreparationGuide", () => {
  const guide = parsePreparationGuide(REAL_HTML);

  it("separa encantos de slot das linhas de gema", () => {
    expect(guide.enchants.map((e) => e.slot)).toEqual(["Weapon", "Helm", "Legs", "Ring"]);
    expect(guide.gems.map((g) => g.slot)).toEqual(["Eversong Diamond", "Other Gems"]);
  });

  it("extrai o itemId do link, que é o que casa com as gemas do log", () => {
    expect(guide.gems).toEqual([
      { slot: "Eversong Diamond", itemId: 240983, name: "Indecipherable Eversong Diamond" },
      { slot: "Other Gems", itemId: 240908, name: "Flawless Masterful Garnet" },
    ]);
  });

  it("decodifica entidades HTML no nome", () => {
    expect(guide.enchants[0].name).toBe("Enchant Weapon - Rite of the Hash'ey");
  });

  it("guarda todos os itens quando a linha recomenda mais de um", () => {
    const food = guide.consumables.find((c) => c.type === "Food");

    expect(food?.items.map((i) => i.name)).toEqual(["Royal Roast", "Hearty Royal Roast"]);
  });

  it("lê os consumíveis com tipo e item", () => {
    expect(guide.consumables.map((c) => c.type)).toEqual(["Flask", "Combat Potion", "Weapon Buffs", "Food"]);
    expect(guide.consumables[0].items[0]).toEqual({ itemId: 241326, name: "Flask of the Shattered Sun" });
  });

  it("falha alto quando o layout muda, em vez de devolver referência vazia", () => {
    expect(() => parsePreparationGuide("<p>página sem tabela</p>")).toThrow(/layout/i);
  });
});
