/**
 * Tradução de `class` + `spec` + `role` do roster para a URL do guia no
 * Wowhead. O padrão de URL é regular, então dá pra montar em vez de manter
 * 19 links na mão:
 *
 *   /guide/classes/<classe>/<spec>/enchants-gems-pve-<papel>
 *
 * O roster tem spec em português e em inglês misturados (o cadastro manual
 * usa PT, o rascunho gerado pela WCL usa EN), por isso o mapa abaixo aceita
 * as duas grafias. Spec fora do mapa **não** vira URL chutada: o coletor
 * reporta e pula, pra não gravar referência errada.
 */

export type Role = "tank" | "healer" | "dps";

/** Nome de spec (PT ou EN, sem acento e em minúsculas) → slug do Wowhead. */
const SPEC_SLUGS: Record<string, string> = {
  // Death Knight
  sangue: "blood",
  blood: "blood",
  frost: "frost",
  gelo: "frost",
  unholy: "unholy",
  profano: "unholy",
  // Demon Hunter
  havoc: "havoc",
  devastacao: "havoc",
  vengeance: "vengeance",
  vinganca: "vengeance",
  // Druid
  balance: "balance",
  equilibrio: "balance",
  feral: "feral",
  guardian: "guardian",
  guardiao: "guardian",
  restoration: "restoration",
  restauracao: "restoration",
  // Evoker
  devastation: "devastation",
  preservation: "preservation",
  augmentation: "augmentation",
  // Hunter
  beastmastery: "beast-mastery",
  "beast mastery": "beast-mastery",
  "mestre de feras": "beast-mastery",
  marksmanship: "marksmanship",
  puntaria: "marksmanship",
  pontaria: "marksmanship",
  survival: "survival",
  sobrevivencia: "survival",
  // Mage
  arcane: "arcane",
  arcano: "arcane",
  fire: "fire",
  fogo: "fire",
  geada: "frost",
  // Monk
  brewmaster: "brewmaster",
  mistweaver: "mistweaver",
  windwalker: "windwalker",
  // Paladin
  holy: "holy",
  santo: "holy",
  protection: "protection",
  protecao: "protection",
  retribution: "retribution",
  retribuicao: "retribution",
  // Priest
  discipline: "discipline",
  disciplina: "discipline",
  shadow: "shadow",
  sombra: "shadow",
  // Rogue
  assassination: "assassination",
  outlaw: "outlaw",
  subtlety: "subtlety",
  // Shaman
  elemental: "elemental",
  enhancement: "enhancement",
  aperfeicoamento: "enhancement",
  // Warlock
  affliction: "affliction",
  aflicao: "affliction",
  demonology: "demonology",
  demonologia: "demonology",
  destruction: "destruction",
  destruicao: "destruction",
  // Warrior
  arms: "arms",
  bracos: "arms",
  fury: "fury",
  furia: "fury",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Não precisa desambiguar spec repetida entre classes (Frost existe em Mage
 * e Death Knight): a URL do Wowhead já é escopada por classe, então
 * /mage/frost/ e /death-knight/frost/ convivem.
 */
export function resolveSpecSlug(_wowClass: string, spec: string): string | undefined {
  return SPEC_SLUGS[normalize(spec)];
}

export interface BuildGuideUrlInput {
  template: string;
  wowClass: string;
  spec: string;
  role: Role;
}

/**
 * Monta a URL do guia. `{class}`, `{spec}` e `{role}` no template são
 * substituídos. Devolve undefined quando a spec não está mapeada — quem
 * chama decide o que fazer (reportar e pular).
 */
export function buildGuideUrl(input: BuildGuideUrlInput): string | undefined {
  const specSlug = resolveSpecSlug(input.wowClass, input.spec);
  if (!specSlug) return undefined;

  return input.template
    .replace("{class}", normalize(input.wowClass))
    .replace("{spec}", specSlug)
    .replace("{role}", input.role);
}
