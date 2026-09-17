/**
 * Interpretação do guia "Enchants & Consumables" do Wowhead.
 *
 * A página traz duas tabelas simples:
 *   - "Slot"/"Best" → encanto recomendado por slot, e às vezes as gemas;
 *   - "Type"/"Best" → flask, poção, óleo, runa, comida.
 *
 * **As gemas não estão sempre na tabela.** O Wowhead não é consistente entre
 * guias: parte das specs lista a gema como linha ("Eversong Diamond",
 * "Other Gems"), outras escrevem em prosa sob um `<h3>` de "Gems", com a
 * recomendação dentro de um `<ul>` — é o caso do Enhancement. Por isso são
 * lidas das duas formas e unidas por ID.
 *
 * Cada célula/item tem um `<a href="/item=ID/slug">Nome</a>`, então sai daqui
 * tanto o ID quanto o nome — o ID é o que casa com as gemas do log, o nome
 * é o que casa com as auras de consumível.
 *
 * Tudo puro: recebe HTML, devolve estrutura. Sem rede.
 */

export interface WowheadItem {
  itemId: number;
  name: string;
}

export interface WowheadEnchantRecommendation extends WowheadItem {
  /** Rótulo do slot como o Wowhead escreve ("Weapon", "Helm", "Ring"...). */
  slot: string;
}

export interface WowheadConsumableRecommendation {
  /** Rótulo do tipo como o Wowhead escreve ("Flask", "Combat Potion"...). */
  type: string;
  /** Uma linha pode recomendar mais de um item (ex: comida normal e a "Hearty"). */
  items: WowheadItem[];
}

export interface WowheadPreparationGuide {
  enchants: WowheadEnchantRecommendation[];
  gems: WowheadEnchantRecommendation[];
  consumables: WowheadConsumableRecommendation[];
}

/**
 * Rótulos da primeira tabela que são slot de equipamento. O que não estiver
 * aqui é tratado como linha de gema ("Eversong Diamond", "Other Gems") —
 * a lista de slots encantáveis muda por tier, então é o Wowhead que manda,
 * não uma lista fixa nossa.
 */
const GEAR_SLOT_LABELS = new Set([
  "weapon",
  "weapons",
  "main hand",
  "off hand",
  "helm",
  "helmet",
  "head",
  "shoulder",
  "shoulders",
  "cloak",
  "back",
  "chest",
  "bracer",
  "bracers",
  "wrist",
  "gloves",
  "hands",
  "belt",
  "waist",
  "legs",
  "boots",
  "feet",
  "ring",
  "rings",
]);

/**
 * Encanto pelo nome do item. "Enchant ..." cobre a maioria; os outros são os
 * consumíveis de armadura, que não levam o prefixo mas também não são gema.
 * Serve como rede de segurança quando o rótulo do slot vem numa grafia nova.
 */
function looksLikeEnchant(name: string): boolean {
  return /^enchant\b/i.test(name) || /\b(armor kit|spellthread|jewelbinder)\b/i.test(name);
}

/**
 * Pedras usadas como gema nesta expansão — extraídas dos guias que listam as
 * gemas em tabela, não de uma lista inventada.
 *
 * Só filtra o caminho da prosa, onde não há estrutura pra confiar: o texto
 * cita itens condicionais que não são gema (o guia de Retribution menciona o
 * anel "Loa Worshiper's Band" pra explicar uma escolha de stat).
 *
 * Se um tier trouxer uma pedra nova e ela ficar de fora daqui, o efeito é a
 * spec perder a recomendação — a checagem vira `unconfigured` e sai da nota.
 * Nunca o contrário. É o lado seguro do erro.
 */
const GEM_STONES = /\b(diamond|garnet|peridot|amethyst|lapis|ruby|emerald|sapphire|topaz|opal|onyx)\b/i;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractItems(cellHtml: string): WowheadItem[] {
  const items: WowheadItem[] = [];
  for (const match of cellHtml.matchAll(/<a[^>]+href="[^"]*\/item=(\d+)[^"]*"[^>]*>(.*?)<\/a>/gs)) {
    const name = stripTags(match[2]);
    if (name) items.push({ itemId: Number(match[1]), name });
  }
  return items;
}

interface ParsedRow {
  label: string;
  items: WowheadItem[];
}

function parseTables(html: string): Array<{ header: string; rows: ParsedRow[] }> {
  const tables: Array<{ header: string; rows: ParsedRow[] }> = [];

  for (const tableMatch of html.matchAll(/<table[^>]*>(.*?)<\/table>/gs)) {
    const rows: ParsedRow[] = [];
    let header = "";

    for (const rowMatch of tableMatch[1].matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((cell) => cell[1]);
      if (cells.length < 2) continue;

      const label = stripTags(cells[0]);
      if (!label) continue;

      // Primeira linha com rótulo é o cabeçalho ("Slot" ou "Type").
      if (!header) {
        header = label.toLowerCase();
        continue;
      }

      rows.push({ label, items: extractItems(cells[1]) });
    }

    if (rows.length > 0) tables.push({ header, rows });
  }

  return tables;
}

/**
 * Gemas escritas fora da tabela: acha as seções cujo título fala de gema e
 * lê as recomendações até o próximo título.
 *
 * Três precauções, todas motivadas por páginas reais:
 *
 * 1. O título que mistura os assuntos ("Best X Gems and Enchants in...") é
 *    pulado — ele engloba a tabela de encantos inteira.
 * 2. Quando a seção tem lista, só a lista vale. O parágrafo de abertura cita
 *    itens a título de explicação, não de recomendação: o guia de Restoration
 *    Shaman menciona "Enchant Chest - Mark of the Magister" e "Arcanoweave
 *    Spellthread" ao falar de mana.
 * 3. Quando **não** tem lista, aí sim a prosa vale — é o caso do Unholy Death
 *    Knight, que escreve as gemas direto no parágrafo. Sem essa saída, a spec
 *    ficaria sem nenhuma recomendação.
 *
 * Nos dois caminhos, item com cara de encanto é descartado: é o que impede a
 * regra 3 de reintroduzir o problema da regra 2.
 *
 * O resultado é de propósito um superconjunto: o guia costuma trazer
 * alternativas ("com 5+ soquetes" / "sem"). Como a checagem só pergunta se a
 * gema equipada está entre as recomendadas, aceitar as variantes é o
 * comportamento certo.
 */
function parseGemSections(html: string): WowheadItem[] {
  const headings = [...html.matchAll(/<h([23])[^>]*>(.*?)<\/h\1>/gs)];
  const items: WowheadItem[] = [];

  for (const [index, heading] of headings.entries()) {
    const title = stripTags(heading[2]);
    if (!/gem/i.test(title) || /enchant/i.test(title)) continue;

    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const section = html.slice(start, end);

    const listItems = [...section.matchAll(/<li[^>]*>(.*?)<\/li>/gs)];

    if (listItems.length > 0) {
      const fromList = listItems.flatMap((listItem) => extractItems(listItem[1]));
      items.push(...fromList.filter((item) => !looksLikeEnchant(item.name)));
      continue;
    }

    // Sem lista, a prosa é a única fonte — e aí exige-se que o nome seja de
    // uma pedra conhecida, porque o texto cita itens que não são gema.
    items.push(...extractItems(section).filter((item) => GEM_STONES.test(item.name)));
  }

  return items;
}

/**
 * Lê o HTML do guia e devolve as recomendações. Lança se nenhuma tabela
 * reconhecível aparecer — é sinal de que o Wowhead mudou o layout, e falhar
 * alto é melhor que gravar um arquivo de referência vazio em silêncio.
 */
export function parsePreparationGuide(html: string): WowheadPreparationGuide {
  const tables = parseTables(html);

  const slotTable = tables.find((table) => table.header.includes("slot"));
  const typeTable = tables.find((table) => table.header.includes("type"));

  if (!slotTable && !typeTable) {
    throw new Error(
      "Nenhuma tabela de 'Slot' ou 'Type' encontrada no guia do Wowhead — o layout da página provavelmente mudou."
    );
  }

  const enchants: WowheadEnchantRecommendation[] = [];
  const gems: WowheadEnchantRecommendation[] = [];

  for (const row of slotTable?.rows ?? []) {
    const item = row.items[0];
    if (!item) continue;

    // O rótulo manda, mas um item chamado "Enchant ..." é encanto mesmo que o
    // guia escreva o slot de um jeito que ainda não conhecemos ("Helmet" em
    // vez de "Helm", por exemplo). Sem isso, a grafia nova cairia calada no
    // balde de gemas e reprovaria a gema legítima do jogador.
    const isEnchant = GEAR_SLOT_LABELS.has(row.label.toLowerCase()) || looksLikeEnchant(item.name);
    const target = isEnchant ? enchants : gems;
    target.push({ slot: row.label, itemId: item.itemId, name: item.name });
  }

  // Une as gemas escritas em prosa, sem repetir as que a tabela já trouxe.
  const seenGemIds = new Set(gems.map((gem) => gem.itemId));
  for (const item of parseGemSections(html)) {
    if (seenGemIds.has(item.itemId)) continue;
    seenGemIds.add(item.itemId);
    gems.push({ slot: "Gems", itemId: item.itemId, name: item.name });
  }

  const consumables: WowheadConsumableRecommendation[] = (typeTable?.rows ?? [])
    .filter((row) => row.items.length > 0)
    .map((row) => ({ type: row.label, items: row.items }));

  return { enchants, gems, consumables };
}
