/**
 * Os cores da guilda, e o papel de cada personagem dentro de cada um.
 *
 * O papel passou a ser POR CORE porque ele é por core na vida real: alguém
 * é titular no Nemesis e suplente no Ômega, e um `type` só no personagem
 * não tem onde guardar as duas coisas.
 *
 * O que NÃO é por core é a identidade: `pertenceA` continua global, porque
 * alt é alt da pessoa e não do grupo. O que muda é a agregação — dois
 * personagens no mesmo core somam presença, e a mesma pessoa em cores
 * diferentes conta separado em cada um.
 */

import coresJson from "../../../data/guild/cores.json";

export type FormatoDeCore = "core" | "evento";

/** Papel do personagem DENTRO de um core. */
export type PapelNoCore = "main" | "alt" | "replace";

export interface Core {
  slug: string;
  nome: string;
  formato: FormatoDeCore;
  principal?: boolean;
}

/** Participação de um personagem nos cores. Ausente = não joga em nenhum. */
export type ParticipacaoEmCores = Record<string, { type: PapelNoCore }>;

export const CORES: Core[] = (coresJson.cores as Core[]).map((core) => ({
  ...core,
  formato: core.formato as FormatoDeCore,
}));

/**
 * O core que as páginas mostram enquanto a rota não tem o segmento [core].
 *
 * Cai no primeiro da lista se ninguém está marcado: é melhor mostrar um
 * core do que quebrar a página por falta de uma flag.
 */
export function corePrincipal(): Core {
  return CORES.find((core) => core.principal) ?? CORES[0];
}

export function coreDoSlug(slug: string): Core | undefined {
  return CORES.find((core) => core.slug === slug);
}

/** Só os que têm análise de temporada. Evento tem página de outro formato. */
export function coresDeRaide(): Core[] {
  return CORES.filter((core) => core.formato === "core");
}

/**
 * Lê o mapa de participação de uma entrada de roster.
 *
 * O cast mora AQUI, numa linha só, e não na assinatura de cada função:
 * quase tudo que chega nestas funções é o import do roster.json, e o
 * TypeScript infere pra `cores` um tipo por entrada — `{nemesis}` numa,
 * `{nemesis, omega}` noutra, `{omega}` na terceira. Essa união não casa
 * com tipo declarado nenhum, e exigir um na assinatura empurrava um
 * `as unknown as` pra cada chamador — o que desliga a checagem inteira em
 * vez de só a da forma de `cores`.
 *
 * Quem garante a união dos papéis é `Player.cores`, onde ela está
 * declarada, e o arquivo de dados.
 */
function participacao(personagem: object): Record<string, { type: string }> {
  return (personagem as { cores?: Record<string, { type: string }> }).cores ?? {};
}

/** O papel do personagem naquele core, ou undefined se ele não está nele. */
export function papelNoCore(personagem: object, slug: string): PapelNoCore | undefined {
  return participacao(personagem)[slug]?.type as PapelNoCore | undefined;
}

export function estaNoCore(personagem: object, slug: string): boolean {
  return papelNoCore(personagem, slug) !== undefined;
}

/** Os slugs dos cores em que o personagem joga, na ordem de `CORES`. */
export function coresDe(personagem: object): string[] {
  return CORES.filter((core) => estaNoCore(personagem, core.slug)).map((core) => core.slug);
}

/** Os nomes, pra quando a tela precisa mostrar e não filtrar. */
export function nomesDosCoresDe(personagem: object): string[] {
  return coresDe(personagem).map((slug) => coreDoSlug(slug)?.nome ?? slug);
}

/**
 * As semanas, com só as noites de um core.
 *
 * Semana sem noite daquele core continua na lista, vazia: tirar a semana
 * inteira mudaria a numeração que o resto do site usa pra contar.
 */
export function semanasDoCore<T extends { runs?: Array<{ core?: string }> }>(
  semanas: T[],
  slug: string
): T[] {
  return semanas.map((semana) => ({
    ...semana,
    runs: (semana.runs ?? []).filter((run) => run.core === slug),
  }));
}

/** Os personagens que jogam num core, no tipo em que entraram. */
export function jogadoresDoCore<T extends object>(jogadores: T[], slug: string): T[] {
  return jogadores.filter((jogador) => estaNoCore(jogador, slug));
}
