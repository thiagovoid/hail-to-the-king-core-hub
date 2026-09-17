import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildChecklistFromReference,
  resolveEnchantedSlots,
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

describe("resolveEnchantedSlots", () => {
  it("aceita os apelidos que os guias usam pro mesmo slot", () => {
    const helm = resolveEnchantedSlots([{ slot: "Helm", itemId: 1, name: "a" }]);
    const head = resolveEnchantedSlots([{ slot: "Head", itemId: 1, name: "a" }]);

    expect(helm.slots).toEqual(head.slots);
    expect(resolveEnchantedSlots([{ slot: "Boots", itemId: 1, name: "a" }]).slots).toEqual(
      resolveEnchantedSlots([{ slot: "Feet", itemId: 1, name: "a" }]).slots
    );
  });

  it("expande anel nos dois slots — o guia recomenda um encanto pros dois", () => {
    expect(resolveEnchantedSlots([{ slot: "Ring", itemId: 1, name: "a" }]).slots).toEqual([10, 11]);
  });

  it("não repete slot quando o guia lista o mesmo duas vezes", () => {
    const result = resolveEnchantedSlots([
      { slot: "Chest", itemId: 1, name: "a" },
      { slot: "Chest", itemId: 2, name: "b" },
    ]);

    expect(result.slots).toEqual([4]);
  });

  it("reporta rótulo desconhecido em vez de inventar um slot", () => {
    const result = resolveEnchantedSlots([{ slot: "Tabardo Mágico", itemId: 1, name: "a" }]);

    expect(result.slots).toEqual([]);
    expect(result.unknownLabels).toEqual(["Tabardo Mágico"]);
  });
});

describe("buildChecklistFromReference", () => {
  it("leva os item ids das gemas — mesmo espaço de id da WCL", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ gems: [{ slot: "Other Gems", itemId: 240894, name: "Flawless Versatile Peridot" }] })
    );

    expect(checklist.recommendedGemIds).toEqual([240894]);
  });

  it("deixa consumíveis não configurados — item id do guia não é spell id da aura", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ consumables: [{ type: "Flask", items: [{ itemId: 241324, name: "Flask of the Blood Knights" }] }] })
    );

    expect(Object.values(checklist.consumables).every((ids) => ids.length === 0)).toBe(true);
  });
});

describe("referência real da temporada", () => {
  it("toda spec coletada vira checklist com slots encantáveis", () => {
    const specs = Object.entries(REFERENCE.specs);
    expect(specs.length).toBeGreaterThan(0);

    for (const [key, spec] of specs) {
      const { checklist } = buildChecklistFromReference(spec);
      expect(checklist.enchantedSlots.length, `${key} ficou sem slot encantável`).toBeGreaterThan(0);
    }
  });

  it("spec cujo guia não traz tabela de gema fica sem a checagem, não com gema errada", () => {
    // Enhancement é o caso real: o guia do Wowhead lista só os encantos.
    // Sem recomendação, a checagem de gemas sai da conta (`unconfigured`) em
    // vez de reprovar o jogador por uma lacuna da fonte.
    const semGemas = Object.entries(REFERENCE.specs).filter(([, spec]) => spec.gems.length === 0);

    for (const [key, spec] of semGemas) {
      expect(buildChecklistFromReference(spec).checklist.recommendedGemIds, key).toEqual([]);
    }
  });

  it("nenhum rótulo de slot do guia ficou sem tradução", () => {
    const unknown = new Set<string>();
    for (const spec of Object.values(REFERENCE.specs)) {
      buildChecklistFromReference(spec).unknownSlotLabels.forEach((label) => unknown.add(label));
    }

    expect([...unknown]).toEqual([]);
  });

  it("a chave do arquivo é a mesma que specKey monta a partir do roster", () => {
    for (const [key, spec] of Object.entries(REFERENCE.specs)) {
      expect(specKey(spec.wowClass, spec.spec)).toBe(key);
    }
  });
});
