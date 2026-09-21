import { describe, expect, it } from "vitest";

import { classificacaoFinal, ehConsumivel, CLASSIFICACAO_MANUAL } from "./classificacaoManual";

describe("ehConsumivel", () => {
  it("separa poção de trinket pela RECARGA, não pelo nome", () => {
    /**
     * "Freightrunner's Flask" tem 90s e saiu 26,8 vezes por noite — é
     * trinket com nome de flask, porque flask de verdade não tem recarga e
     * se bebe uma vez. Pelo nome ela seria excluída junto com as poções.
     */
    expect(ehConsumivel("Freightrunner's Flask", 90_000)).toBe(false);
    expect(ehConsumivel("Potion of Recklessness", 300_000)).toBe(true);
    expect(ehConsumivel("Draught of Rampant Abandon", 300_000)).toBe(true);
  });

  it("pedra de vida é consumível mesmo com recarga curta", () => {
    // 60s, e é criada pelo bruxo em vez de comprada — nem aparece no Portão.
    expect(ehConsumivel("Healthstone", 60_000)).toBe(true);
    expect(ehConsumivel("Demonic Healthstone", 60_000)).toBe(true);
  });

  it("não confunde habilidade de classe com consumível", () => {
    expect(ehConsumivel("Ascendance", 180_000)).toBe(false);
    expect(ehConsumivel("Power Infusion", 120_000)).toBe(false);
    expect(ehConsumivel("Avenging Wrath", 120_000)).toBe(false);
  });
});

describe("classificacaoFinal", () => {
  it("a tabela manual ganha do automático", () => {
    // Ascendance Elemental cai em "utility" pelo tooltip, porque transforma
    // o jogador sem citar dano.
    expect(classificacaoFinal(114050, "Ascendance", 180_000, "utility")).toBe("offensive");
  });

  it("deixa o Ascendance de RESTAURAÇÃO fora da tabela", () => {
    /**
     * Os três ids têm o mesmo nome e são magias diferentes. O de
     * Restauração é cooldown de cura: promovê-lo mandaria um botão de cura
     * pra Atacar e mediria a coisa errada num healer.
     */
    expect(CLASSIFICACAO_MANUAL.has(114052)).toBe(false);
    expect(classificacaoFinal(114052, "Ascendance", 180_000, "defensive")).toBe("defensive");
  });

  it("consumível ganha de tudo, inclusive da tabela manual", () => {
    // Uma poção classificada como ofensiva pelo tooltip continua sendo
    // poção: o Portão já cobra tê-la, e pontuar de novo cobra duas vezes.
    expect(classificacaoFinal(999, "Potion of Zealotry", 300_000, "offensive")).toBe("consumivel");
  });

  it("não mexe no que o automático já acerta", () => {
    expect(classificacaoFinal(31884, "Avenging Wrath", 120_000, "offensive")).toBe("offensive");
    expect(classificacaoFinal(642, "Divine Shield", 300_000, "defensive")).toBe("defensive");
    expect(classificacaoFinal(1044, "Blessing of Freedom", 60_000, "utility")).toBe("utility");
  });

  it("a tabela é curta — cada entrada é um erro provado, não preferência", () => {
    expect(CLASSIFICACAO_MANUAL.size).toBeLessThanOrEqual(12);
  });
});
