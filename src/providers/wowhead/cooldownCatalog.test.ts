import { describe, expect, it } from "vitest";

import { CATALOGO_VAZIO, catalogToMap, mergeCatalog, spellsFaltando, type CooldownCatalogFile } from "./cooldownCatalog";
import type { CooldownDaMagia } from "./spellCooldown";

const AVATAR: CooldownDaMagia = {
  spellId: 107574,
  name: "Avatar",
  cooldownMs: 90_000,
  charges: 1,
  kind: "offensive",
  buff: false,
};

const base: CooldownCatalogFile = {
  generatedAt: "2026-09-01T00:00:00.000Z",
  cooldowns: { "107574": { name: "Avatar", cooldownMs: 90_000, charges: 1, kind: "offensive", buff: false } },
  ignored: [344862],
};

describe("catalogToMap", () => {
  it("reidrata as entradas com o spellId numérico", () => {
    expect(catalogToMap(base).get(107574)).toEqual(AVATAR);
  });

  it("aceita catálogo vazio", () => {
    expect(catalogToMap(CATALOGO_VAZIO).size).toBe(0);
  });
});

describe("spellsFaltando", () => {
  it("devolve só o que ainda não tem veredito", () => {
    expect(spellsFaltando(base, [107574, 344862, 555])).toEqual([555]);
  });

  // Sem isso, as ~180 magias de rotação de cada noite seriam reconsultadas
  // toda semana pra chegar sempre à mesma conclusão.
  it("não repete consulta de magia já descartada", () => {
    expect(spellsFaltando(base, [344862])).toEqual([]);
  });

  it("não repete o mesmo id visto várias vezes", () => {
    expect(spellsFaltando(base, [555, 555, 555])).toEqual([555]);
  });

  it("descarta id inválido vindo do log", () => {
    expect(spellsFaltando(base, [0, -1])).toEqual([]);
  });
});

describe("mergeCatalog", () => {
  const agora = "2026-09-18T00:00:00.000Z";

  it("adiciona cooldown novo", () => {
    const resultado = mergeCatalog(CATALOGO_VAZIO, [{ spellId: 107574, cooldown: AVATAR }], agora);
    expect(resultado.cooldowns["107574"].name).toBe("Avatar");
    expect(resultado.generatedAt).toBe(agora);
  });

  it("registra como ignorada a magia que não é cooldown", () => {
    const resultado = mergeCatalog(CATALOGO_VAZIO, [{ spellId: 999 }], agora);
    expect(resultado.ignored).toContain(999);
    expect(resultado.cooldowns).toEqual({});
  });

  // A classificação ofensivo/defensivo é heurística. Se a coleta
  // sobrescrevesse a correção manual, a curadoria não serviria pra nada.
  it("preserva correção feita à mão no arquivo", () => {
    const corrigido: CooldownCatalogFile = {
      ...base,
      cooldowns: { "107574": { name: "Avatar", cooldownMs: 90_000, charges: 1, kind: "defensive", buff: false } },
    };

    const resultado = mergeCatalog(corrigido, [{ spellId: 107574, cooldown: AVATAR }], agora);
    expect(resultado.cooldowns["107574"].kind).toBe("defensive");
  });

  it("ordena por id pra manter o diff do commit legível", () => {
    const resultado = mergeCatalog(
      CATALOGO_VAZIO,
      [
        { spellId: 300, cooldown: { ...AVATAR, spellId: 300 } },
        { spellId: 100, cooldown: { ...AVATAR, spellId: 100 } },
      ],
      agora
    );

    expect(Object.keys(resultado.cooldowns)).toEqual(["100", "300"]);
  });
});
