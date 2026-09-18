/**
 * Busca o tooltip de uma magia no Wowhead.
 *
 * `nether.wowhead.com/tooltip/spell/{id}` é endpoint público que devolve
 * JSON — sem navegador, sem scraping de HTML renderizado. É a alternativa
 * ao WoW Analyzer, que tem exatamente esses dados curados por spec mas
 * bloqueia automação via Cloudflare.
 *
 * Quem interpreta o texto é `spellCooldown.ts`; aqui só busca.
 */

import { parseSpellTooltip, type CooldownDaMagia, type WowheadTooltip } from "./spellCooldown";

const BASE = "https://nether.wowhead.com/tooltip/spell";

/** Requisições simultâneas. Baixo de propósito: o endpoint é cortesia deles. */
const CONCORRENCIA = 6;

async function fetchTooltip(spellId: number): Promise<WowheadTooltip | undefined> {
  const response = await fetch(`${BASE}/${spellId}?dataEnv=1&locale=0`, {
    headers: {
      // Identifica o projeto em vez de fingir ser um navegador qualquer.
      "user-agent": "HailToTheKingCoreHub/1.0 (+https://hailtotheking.com.br)",
      accept: "application/json",
    },
  });

  // Magia que não existe mais (id de patch antigo) responde 404. Não é erro
  // de coleta: é resposta, e vale registrar como "não é cooldown".
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`Wowhead respondeu ${response.status} para a magia ${spellId}`);

  return (await response.json()) as WowheadTooltip;
}

export interface VeredictoDeMagia {
  spellId: number;
  /** Ausente quando a magia não é cooldown — vira entrada ignorada no catálogo. */
  cooldown?: CooldownDaMagia;
}

/**
 * Consulta um lote de magias. Falha de rede numa magia não derruba o lote:
 * ela simplesmente fica sem veredito e volta a ser consultada na próxima
 * coleta, em vez de virar "ignorada" por engano e sumir pra sempre.
 */
export async function fetchSpellCooldowns(
  spellIds: number[],
  onProgress?: (feitos: number, total: number) => void
): Promise<VeredictoDeMagia[]> {
  const resultado: VeredictoDeMagia[] = [];
  let feitos = 0;

  for (let i = 0; i < spellIds.length; i += CONCORRENCIA) {
    const lote = spellIds.slice(i, i + CONCORRENCIA);

    const vereditos = await Promise.all(
      lote.map(async (spellId): Promise<VeredictoDeMagia | undefined> => {
        try {
          const tooltip = await fetchTooltip(spellId);
          return tooltip ? { spellId, cooldown: parseSpellTooltip(spellId, tooltip) } : undefined;
        } catch (error) {
          console.warn(
            `Falha ao consultar a magia ${spellId} no Wowhead: ${error instanceof Error ? error.message : error}`
          );
          return undefined;
        }
      })
    );

    for (const veredito of vereditos) if (veredito) resultado.push(veredito);

    feitos += lote.length;
    onProgress?.(Math.min(feitos, spellIds.length), spellIds.length);
  }

  return resultado;
}
