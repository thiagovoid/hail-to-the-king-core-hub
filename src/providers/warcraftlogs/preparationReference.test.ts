import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildChecklistFromReference,
  specKey,
  type PreparationReference,
  type PreparationReferenceEntry,
} from "./preparationReference";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const REFERENCE: PreparationReference = JSON.parse(
  readFileSync(path.resolve(HERE, "../../../data/seasons/midnight-s2/preparation-reference.json"), "utf-8")
);

function entry(overrides: Partial<PreparationReferenceEntry> = {}): PreparationReferenceEntry {
  return {
    wowClass: "warrior",
    spec: "Proteção",
    role: "tank",
    url: "https://example.test",
    enchants: [],
    gems: [],
    consumables: [],
    ...overrides,
  };
}

describe("specKey", () => {
  it("normaliza acento e caixa, pra spec em PT casar com a chave gravada", () => {
    expect(specKey("Warrior", "Proteção")).toBe("warrior|protecao");
    expect(specKey("warrior", "protecao")).toBe("warrior|protecao");
  });
});

describe("buildChecklistFromReference", () => {
  it("usa a contagem de encantos do guia como denominador, não como lista", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ enchants: [
        { slot: "Helm", itemId: 1, name: "a" },
        { slot: "Chest", itemId: 2, name: "b" },
      ] })
    );

    expect(checklist.recommendedEnchantCount).toBe(2);
  });

  it("espera os três soquetes de joia quando o guia recomenda gemas", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ gems: [{ slot: "Other Gems", itemId: 240894, name: "Flawless Versatile Peridot" }] })
    );

    expect(checklist.expectedGems).toBe(3);
  });

  it("não cobra gema de spec cujo guia não traz nenhuma", () => {
    const { checklist } = buildChecklistFromReference(entry({ gems: [] }));

    expect(checklist.expectedGems).toBe(0);
  });

  it("deixa consumíveis não configurados — item id do guia não é spell id da aura", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ consumables: [{ type: "Flask", items: [{ itemId: 241324, name: "Flask of the Blood Knights" }] }] })
    );

    expect(Object.values(checklist.consumables).every((ids) => ids.length === 0)).toBe(true);
  });
});

describe("referência real da temporada", () => {
  it("toda spec coletada vira um denominador de encantos utilizável", () => {
    const specs = Object.entries(REFERENCE.specs);
    expect(specs.length).toBeGreaterThan(0);

    for (const [key, spec] of specs) {
      const { checklist } = buildChecklistFromReference(spec);
      expect(checklist.recommendedEnchantCount, `${key} ficou sem encanto recomendado`).toBeGreaterThan(0);
    }
  });

  it("spec cujo guia não traz gema nenhuma fica sem a checagem, não reprovada", () => {
    const semGemas = Object.entries(REFERENCE.specs).filter(([, spec]) => spec.gems.length === 0);

    for (const [key, spec] of semGemas) {
      expect(buildChecklistFromReference(spec).checklist.expectedGems, key).toBe(0);
    }
  });

  it("a chave do arquivo é a mesma que specKey monta a partir do roster", () => {
    for (const [key, spec] of Object.entries(REFERENCE.specs)) {
      expect(specKey(spec.wowClass, spec.spec)).toBe(key);
    }
  });
});
