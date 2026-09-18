/**
 * Lê o tooltip de uma magia no Wowhead e extrai o que a métrica de
 * "Atacar corretamente" precisa: quanto tempo a habilidade fica em recarga,
 * quantas cargas ela tem e se é ofensiva ou defensiva.
 *
 * Por que o tooltip e não o WoW Analyzer: o WoW Analyzer tem exatamente
 * esses dados curados por spec, mas está atrás de proteção anti-bot. O
 * `nether.wowhead.com/tooltip/spell/{id}` é público, estável e devolve JSON.
 *
 * O que ele NÃO devolve é um campo dizendo "ofensivo"/"defensivo" — isso não
 * existe na API (conferido). A classificação aqui é heurística em cima do
 * texto, e é por isso que o catálogo é gravado num arquivo versionado: erro
 * de classificação se corrige à mão no JSON e fica registrado no diff, em vez
 * de sumir dentro de um cálculo.
 */

/** Ofensivo x defensivo é decidido pelo efeito descrito, não pela escola de dano. */
export type TipoDeCooldown = "offensive" | "defensive";

export interface CooldownDaMagia {
  spellId: number;
  name: string;
  /** Duração da recarga em milissegundos. */
  cooldownMs: number;
  /** Cargas simultâneas. 1 quando o tooltip não menciona cargas. */
  charges: number;
  kind: TipoDeCooldown;
}

/** Resposta do endpoint de tooltip do Wowhead — só os campos que usamos. */
export interface WowheadTooltip {
  name?: string;
  tooltip?: string;
}

/**
 * Abaixo disso é rotação, não cooldown. Mirar em 30s inclui as habilidades
 * que o WoW Analyzer trata como cooldown nas telas que serviram de
 * referência (Eye Beam 30s, Colossus Smash 45s, Avatar 1,5min) e exclui o
 * preenchimento (Chaos Strike, que nem tem recarga).
 */
export const COOLDOWN_MINIMO_MS = 30_000;

/**
 * Frases que só aparecem em habilidade defensiva. Mitigação, absorção,
 * imunidade e cura própria — o efeito é sobre o dano que VOCÊ toma.
 */
const SINAIS_DEFENSIVOS = [
  /damage\s+taken/i,
  /damage\s+you\s+take/i,
  /avoid\s+(?:all\s+)?damage/i,
  /absorb/i,
  /immune/i,
  /invulnerab/i,
  /heals?\s+you/i,
];

function limparHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "1.5 min cooldown" / "30 sec cooldown" -> ms.
 * Devolve undefined quando a magia não tem recarga nenhuma.
 */
export function extractCooldownMs(texto: string): number | undefined {
  const match = texto.match(/([\d.]+)\s*(sec|min|hour)[a-z]*\s+(?:recharge|cooldown)/i);
  if (!match) return undefined;

  const valor = Number(match[1]);
  if (!Number.isFinite(valor) || valor <= 0) return undefined;

  const unidade = match[2].toLowerCase();
  const fator = unidade === "min" ? 60_000 : unidade === "hour" ? 3_600_000 : 1_000;
  return Math.round(valor * fator);
}

/** "2 Charges" -> 2. Sem menção a cargas, a habilidade tem uma só. */
export function extractCharges(texto: string): number {
  const match = texto.match(/(\d+)\s*Charges?/i);
  if (!match) return 1;
  const valor = Number(match[1]);
  return Number.isFinite(valor) && valor > 0 ? valor : 1;
}

/**
 * Defensivo quando o texto fala em reduzir/absorver dano recebido ou curar
 * a si mesmo. O resto é ofensivo — inclui os buffs puros de dano (Avatar,
 * Metamorphosis), que não causam dano direto e por isso não dá pra
 * classificar olhando a tabela de dano da WCL.
 */
export function classifyCooldown(texto: string): TipoDeCooldown {
  return SINAIS_DEFENSIVOS.some((sinal) => sinal.test(texto)) ? "defensive" : "offensive";
}

/**
 * Monta a entrada do catálogo. Devolve undefined quando a magia não é um
 * cooldown: sem recarga, ou com recarga curta demais pra ser decisão tática.
 */
export function parseSpellTooltip(spellId: number, tooltip: WowheadTooltip): CooldownDaMagia | undefined {
  const texto = limparHtml(tooltip.tooltip ?? "");
  if (!texto) return undefined;

  const cooldownMs = extractCooldownMs(texto);
  if (cooldownMs === undefined || cooldownMs < COOLDOWN_MINIMO_MS) return undefined;

  const name = tooltip.name?.trim() || texto.split(" ")[0];

  return {
    spellId,
    name,
    cooldownMs,
    charges: extractCharges(texto),
    kind: classifyCooldown(texto),
  };
}
