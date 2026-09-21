/**
 * Catálogo de cooldowns por magia, versionado em
 * data/seasons/<season>/cooldown-catalog.json.
 *
 * Por que arquivo e não consulta ao vivo: o raide aperta ~200 magias
 * distintas por noite, e a recarga de cada uma só muda quando muda o patch.
 * Consultar tudo toda semana seria caro e frágil; e, principalmente, a
 * classificação ofensivo/defensivo é heurística (ver spellCooldown.ts) —
 * num arquivo commitado, um erro de classificação se corrige à mão e fica
 * registrado no diff.
 *
 * O catálogo guarda também o que NÃO é cooldown (`ignored`). Sem isso, as
 * ~180 magias de rotação de cada noite seriam reconsultadas toda semana pra
 * chegar sempre à mesma conclusão.
 */

import type { CooldownDaMagia, TipoDeCooldown } from "./spellCooldown";
import { classificacaoFinal } from "./classificacaoManual";

export interface CooldownCatalogFile {
  generatedAt: string;
  /** Chave é o spellId em texto — é o que o JSON permite. */
  cooldowns: Record<string, { name: string; cooldownMs: number; charges: number; kind: TipoDeCooldown }>;
  /** Magias já consultadas que não são cooldown. Evita reconsulta. */
  ignored: number[];
}

export const CATALOGO_VAZIO: CooldownCatalogFile = {
  generatedAt: "",
  cooldowns: {},
  ignored: [],
};

/**
 * O catálogo como o motor lê, já com a correção manual por cima.
 *
 * A correção entra AQUI e não no `mergeCatalog` porque ele pula o que já
 * está catalogado — uma magia classificada errada na primeira coleta ficaria
 * errada pra sempre. Aplicando na leitura, as 193 entradas existentes são
 * corrigidas sem reescrever o arquivo nem voltar ao Wowhead.
 *
 * Consumível some do mapa: poção, flask e pedra de vida já são cobrados no
 * Portão de Preparação, e medi-los de novo no aproveitamento de cooldown
 * cobraria a mesma coisa duas vezes. Trinket fica — apertá-lo na recarga é
 * execução, igual apertar a habilidade.
 */
export function catalogToMap(file: CooldownCatalogFile): Map<number, CooldownDaMagia> {
  const mapa = new Map<number, CooldownDaMagia>();

  for (const [chave, dados] of Object.entries(file.cooldowns ?? {})) {
    const spellId = Number(chave);
    if (!Number.isFinite(spellId)) continue;

    const kind = classificacaoFinal(spellId, dados.name, dados.cooldownMs, dados.kind);
    if (kind === "consumivel") continue;

    mapa.set(spellId, { spellId, ...dados, kind });
  }

  return mapa;
}

/**
 * Quais dos IDs vistos no log ainda não têm veredito no catálogo — nem como
 * cooldown, nem como ignorado.
 */
export function spellsFaltando(file: CooldownCatalogFile, vistos: Iterable<number>): number[] {
  const conhecidos = new Set<number>([
    ...Object.keys(file.cooldowns ?? {}).map(Number),
    ...(file.ignored ?? []),
  ]);

  const faltando = new Set<number>();
  for (const id of vistos) {
    if (id > 0 && !conhecidos.has(id)) faltando.add(id);
  }

  return [...faltando].sort((a, b) => a - b);
}

/**
 * Incorpora vereditos novos. `undefined` no cooldown significa "consultei e
 * não é cooldown" — vai pra lista de ignorados.
 *
 * Não sobrescreve entrada existente: correção feita à mão no JSON tem que
 * sobreviver à próxima coleta, senão a curadoria não serve pra nada.
 */
export function mergeCatalog(
  file: CooldownCatalogFile,
  vereditos: Array<{ spellId: number; cooldown?: CooldownDaMagia }>,
  agora: string
): CooldownCatalogFile {
  const cooldowns = { ...(file.cooldowns ?? {}) };
  const ignored = new Set(file.ignored ?? []);

  for (const { spellId, cooldown } of vereditos) {
    const chave = String(spellId);
    if (chave in cooldowns || ignored.has(spellId)) continue;

    if (cooldown) cooldowns[chave] = {
      name: cooldown.name,
      cooldownMs: cooldown.cooldownMs,
      charges: cooldown.charges,
      kind: cooldown.kind,
    };
    else ignored.add(spellId);
  }

  return {
    generatedAt: agora,
    // Ordenado por id pra o diff do commit mostrar só o que mudou de
    // verdade, em vez de uma reordenação inteira a cada coleta.
    cooldowns: Object.fromEntries(
      Object.entries(cooldowns).sort(([a], [b]) => Number(a) - Number(b))
    ),
    ignored: [...ignored].sort((a, b) => a - b),
  };
}
