/**
 * Funções utilitárias para o roster de jogadores.
 */

import type { Player, WowClass, MythicStats } from "@/types/index";

/**
 * Ordena jogadores por IO decrescente.
 * Jogadores com IO null vão para o final.
 * Empates mantêm a ordem relativa original (stable sort).
 * Nenhum jogador é perdido.
 */
export function sortPlayersByIo(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const ioA = a.raiderIo.io;
    const ioB = b.raiderIo.io;

    if (ioA === null && ioB === null) return 0;
    if (ioA === null) return 1;
    if (ioB === null) return -1;

    return ioB - ioA;
  });
}

/**
 * Mapa de cores por classe WoW usando classes Tailwind com hex inline.
 */
const CLASS_COLORS: Record<WowClass, string> = {
  "death-knight": "text-[#c41e3a]",
  "demon-hunter": "text-[#a330c9]",
  "druid": "text-[#ff7c0a]",
  "evoker": "text-[#33937f]",
  "hunter": "text-[#aad372]",
  "mage": "text-[#3fc7eb]",
  "monk": "text-[#00ff98]",
  "paladin": "text-[#f48cba]",
  "priest": "text-[#ffffff]",
  "rogue": "text-[#fff468]",
  "shaman": "text-[#0070dd]",
  "warlock": "text-[#8788ee]",
  "warrior": "text-[#c79c6e]",
};

/**
 * Retorna a classe Tailwind de cor correspondente à classe WoW.
 * Retorna "text-gray-300" para null/undefined.
 */
export function getClassColor(cls: WowClass | null | undefined): string {
  if (cls === null || cls === undefined) {
    return "text-gray-300";
  }
  return CLASS_COLORS[cls] ?? "text-gray-300";
}

/**
 * Calcula estatísticas de Mythic+ a partir do roster.
 * - avgIo: média dos IOs disponíveis (jogadores com io não-null)
 * - maxIo: maior IO individual
 * - distribution: contagem por faixa (>=2500, >=3000, >=3500, >=4000)
 */
export function computeMythicStats(players: Player[]): MythicStats {
  const iosWithValue = players
    .map((p) => p.raiderIo.io)
    .filter((io): io is number => io !== null);

  const avgIo =
    iosWithValue.length > 0
      ? Math.round(iosWithValue.reduce((sum, io) => sum + io, 0) / iosWithValue.length)
      : 0;

  const maxIo = iosWithValue.length > 0 ? Math.max(...iosWithValue) : 0;

  const distribution = {
    tier2500: iosWithValue.filter((io) => io >= 2500).length,
    tier3000: iosWithValue.filter((io) => io >= 3000).length,
    tier3500: iosWithValue.filter((io) => io >= 3500).length,
    tier4000: iosWithValue.filter((io) => io >= 4000).length,
  };

  return { avgIo, maxIo, distribution };
}
