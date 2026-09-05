import type { WoWAnalyzerRawUptime } from "./WoWAnalyzerProvider";

/**
 * Uma run pode ter vários bosses mortos, mas o WoWAnalyzer só dá uptime por
 * fight individual — mesma agregação por média simples já usada pro
 * wipefestScore (ver providers/wipefest/normalize.ts), só que aqui o
 * provider já busca um jogador por vez, então não precisa casar nome.
 */
export function averageUptime(fightsRaw: WoWAnalyzerRawUptime[]): number | null {
  const values = fightsRaw.map((fight) => fight.uptime).filter((value): value is number => value !== null);
  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average);
}
