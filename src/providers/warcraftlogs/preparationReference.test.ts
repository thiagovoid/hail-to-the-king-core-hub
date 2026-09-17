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
  it("traduz o rótulo do guia pro número de slot da WCL", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ enchants: [
        { slot: "Helm", itemId: 1, name: "a" },
        { slot: "Weapon", itemId: 2, name: "b" },
      ] })
    );

    expect(checklist.enchantedSlots).toEqual([0, 15]);
  });

  it("aceita os apelidos que os guias usam pro mesmo slot", () => {
    const helm = buildChecklistFromReference(entry({ enchants: [{ slot: "Helm", itemId: 1, name: "a" }] }));
    const helmet = buildChecklistFromReference(entry({ enchants: [{ slot: "Helmet", itemId: 1, name: "a" }] }));

    expect(helm.checklist.enchantedSlots).toEqual(helmet.checklist.enchantedSlots);
  });

  it("expande anel nos dois slots — o guia recomenda um encanto pros dois", () => {
    const { checklist } = buildChecklistFromReference(entry({ enchants: [{ slot: "Ring", itemId: 1, name: "a" }] }));

    expect(checklist.enchantedSlots).toEqual([10, 11]);
  });

  it("reporta rótulo desconhecido em vez de inventar um slot", () => {
    const resultado = buildChecklistFromReference(entry({ enchants: [{ slot: "Tabardo Mágico", itemId: 1, name: "a" }] }));

    expect(resultado.checklist.enchantedSlots).toEqual([]);
    expect(resultado.unknownSlotLabels).toEqual(["Tabardo Mágico"]);
  });

  it("cobra gema no colar e nos dois anéis quando o guia recomenda gemas", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ gems: [{ slot: "Other Gems", itemId: 240894, name: "Flawless Versatile Peridot" }] })
    );

    expect(checklist.gemSlots).toEqual([1, 10, 11]);
  });

  it("não cobra gema de spec cujo guia não traz nenhuma", () => {
    expect(buildChecklistFromReference(entry({ gems: [] })).checklist.gemSlots).toEqual([]);
  });

  it("deixa consumíveis não configurados — item id do guia não é spell id da aura", () => {
    const { checklist } = buildChecklistFromReference(
      entry({ consumables: [{ type: "Flask", items: [{ itemId: 241324, name: "Flask of the Blood Knights" }] }] })
    );

    expect(Object.values(checklist.consumables).every((ids) => ids.length === 0)).toBe(true);
  });
});

describe("referência real da temporada", () => {
  it("toda spec coletada vira slots encantáveis utilizáveis", () => {
    const specs = Object.entries(REFERENCE.specs);
    expect(specs.length).toBeGreaterThan(0);

    for (const [key, spec] of specs) {
      const { checklist } = buildChecklistFromReference(spec);
      expect(checklist.enchantedSlots.length, `${key} ficou sem slot encantável`).toBeGreaterThan(0);
    }
  });

  it("nenhum rótulo de slot do guia ficou sem tradução", () => {
    const desconhecidos = new Set<string>();
    for (const spec of Object.values(REFERENCE.specs)) {
      buildChecklistFromReference(spec).unknownSlotLabels.forEach((l) => desconhecidos.add(l));
    }

    expect([...desconhecidos]).toEqual([]);
  });

  it("spec cujo guia não traz gema nenhuma fica sem a checagem, não reprovada", () => {
    const semGemas = Object.entries(REFERENCE.specs).filter(([, spec]) => spec.gems.length === 0);

    for (const [key, spec] of semGemas) {
      expect(buildChecklistFromReference(spec).checklist.gemSlots, key).toEqual([]);
    }
  });

  it("a chave do arquivo é a mesma que specKey monta a partir do roster", () => {
    for (const [key, spec] of Object.entries(REFERENCE.specs)) {
      expect(specKey(spec.wowClass, spec.spec)).toBe(key);
    }
  });
});
