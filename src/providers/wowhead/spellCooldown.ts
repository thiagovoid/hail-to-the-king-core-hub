/**
 * Lê o tooltip de uma magia no Wowhead e extrai o que a métrica de
 * "Atacar corretamente" precisa: quanto tempo a habilidade fica em recarga,
 * quantas cargas ela tem e se é ofensiva, defensiva ou nenhuma das duas.
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

/**
 * Ofensivo, defensivo, ou nenhum dos dois.
 *
 * "utility" existe porque a maior parte das habilidades com recarga não é
 * nem uma coisa nem outra: stun, silêncio, battle res, invocação de pet,
 * deslocamento. Sem essa terceira gaveta elas caíam em "ofensivo" por
 * descarte e afundavam a média — na primeira coleta real, Hammer of Justice
 * usado uma vez na noite entrava valendo o mesmo que Avatar.
 */
export type TipoDeCooldown = "offensive" | "defensive" | "utility";

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
 * Trecho que não atravessa fim de frase — mas aceita ponto decimal.
 *
 * Os tooltips vêm cheios de número quebrado: "causing [(8.3% of Attack
 * Power) * 11] Shadow damage". Com um `[^.]` simples, o ponto do 8.3 cortava
 * o casamento e Death and Decay era classificada como utilidade. Aqui o
 * ponto só bloqueia quando NÃO é seguido de dígito.
 */
const MESMA_FRASE = "(?:[^.]|[.](?=[0-9]))";

const naMesmaFrase = (antes: string, depois: string, limite = 80) =>
  new RegExp(`${antes}${MESMA_FRASE}{0,${limite}}${depois}`, "i");

/**
 * Causa dano, ou aumenta o dano que você causa. É o sinal mais confiável:
 * buff puro de dano (Avatar, Metamorphosis) não aparece na tabela de dano
 * da WCL, então olhar o dano causado no log não resolveria.
 *
 * Não atravessar frase importa: "causing them to wander disoriented for 5
 * sec. Damage may cancel the effect" (Blinding Sleet) tem as duas palavras,
 * mas em orações diferentes — e a habilidade não dá dano nenhum.
 */
const SINAIS_OFENSIVOS = [
  naMesmaFrase("causing", "damage"),
  naMesmaFrase("dealing", "damage"),
  naMesmaFrase("deals?", "damage"),
  /inflict/i,
  /damage\s+you\s+deal/i,
  /damage\s+dealt/i,
  naMesmaFrase("increas[a-z]+", "damage", 40),
];

/**
 * Mitiga, absorve, cura ou dá vida temporária — o efeito é sobre o dano que
 * você (ou o grupo) toma. `\bheals?\b` com fronteira de palavra de propósito:
 * sem ela, "Healthstone" casaria com "heal".
 */
const SINAIS_DEFENSIVOS = [
  /damage\s+taken/i,
  /damage\s+you\s+take/i,
  /avoid\s+(?:all\s+)?damage/i,
  /absorb/i,
  /immune/i,
  /invulnerab/i,
  /\bheals?\b/i,
  naMesmaFrase("restor[a-z]+", "health", 40),
  naMesmaFrase("temporary", "health", 40),
  /maximum\s+health/i,
  // Esquiva e aparo: sem isso nenhum cooldown de tank era reconhecido como
  // defensivo. Dancing Rune Weapon não usa a palavra "damage" em lugar
  // nenhum — fala em "bolsters your defenses" e "parry chance".
  /\bparry\b/i,
  /\bdodge\b/i,
  /\bdefenses\b/i,
  // "taking 40% less damage for 12 sec" (Astral Shift): a construção não
  // usa "damage taken" nem "damage you take", e a habilidade caía em
  // utilidade — sem defensivo nenhum medido pro xamã.
  naMesmaFrase("taking", "less\\s+damage", 30),
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
 * Dano primeiro: habilidade híbrida (Shield Charge dá dano E concede Shield
 * Block) é, na prática, decisão de quando apertar pra atacar.
 */
export function classifyCooldown(texto: string): TipoDeCooldown {
  if (SINAIS_OFENSIVOS.some((sinal) => sinal.test(texto))) return "offensive";
  if (SINAIS_DEFENSIVOS.some((sinal) => sinal.test(texto))) return "defensive";
  return "utility";
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
