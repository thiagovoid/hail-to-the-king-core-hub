import { describe, expect, it } from "vitest";
import { buildGuideUrl, resolveSpecSlug } from "./specSlug";

const TEMPLATE = "https://www.wowhead.com/guide/classes/{class}/{spec}/enchants-gems-pve-{role}";

describe("resolveSpecSlug", () => {
  it("aceita a mesma spec escrita em inglês e em português", () => {
    expect(resolveSpecSlug("demon-hunter", "Havoc")).toBe("havoc");
    expect(resolveSpecSlug("demon-hunter", "Devastação")).toBe("havoc");
    expect(resolveSpecSlug("priest", "Shadow")).toBe("shadow");
    expect(resolveSpecSlug("priest", "Sombra")).toBe("shadow");
    expect(resolveSpecSlug("shaman", "Restoration")).toBe("restoration");
    expect(resolveSpecSlug("shaman", "Restauração")).toBe("restoration");
  });

  it("usa o mesmo slug pra spec repetida entre classes — a URL já é escopada por classe", () => {
    expect(resolveSpecSlug("death-knight", "Frost")).toBe("frost");
    expect(resolveSpecSlug("mage", "Geada")).toBe("frost");
    expect(buildGuideUrl({ template: TEMPLATE, wowClass: "mage", spec: "Geada", role: "dps" })).toBe(
      "https://www.wowhead.com/guide/classes/mage/frost/enchants-gems-pve-dps"
    );
  });

  it("devolve undefined pra spec desconhecida, em vez de chutar um slug", () => {
    expect(resolveSpecSlug("warrior", "Spec Inventada")).toBeUndefined();
  });
});

describe("buildGuideUrl", () => {
  it("monta a URL a partir do template", () => {
    expect(buildGuideUrl({ template: TEMPLATE, wowClass: "demon-hunter", spec: "Havoc", role: "dps" })).toBe(
      "https://www.wowhead.com/guide/classes/demon-hunter/havoc/enchants-gems-pve-dps"
    );
  });

  it("usa o papel na URL", () => {
    expect(buildGuideUrl({ template: TEMPLATE, wowClass: "paladin", spec: "Protection", role: "tank" })).toBe(
      "https://www.wowhead.com/guide/classes/paladin/protection/enchants-gems-pve-tank"
    );
  });

  it("devolve undefined quando a spec não é reconhecida", () => {
    expect(buildGuideUrl({ template: TEMPLATE, wowClass: "warrior", spec: "???", role: "dps" })).toBeUndefined();
  });
});
