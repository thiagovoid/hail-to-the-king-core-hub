import { sameCharacterName } from "../warcraftlogs/normalize";
import type { WipefestRawFightScores } from "./WipefestProvider";

export interface WipefestPlayerAverage {
  playerId: string;
  wipefestScore: number;
}

/**
 * Uma run (noite de raid) pode ter vários bosses mortos, mas o Wipefest só
 * dá um score por fight individual — faz a média simples entre os fights da
 * run, mesma granularidade de agregação que dps/parse da WCL já usam pra run.
 */
export function averageWipefestScores(
  fightsRaw: WipefestRawFightScores[],
  players: Array<{ id: string; name: string }>
): WipefestPlayerAverage[] {
  const result: WipefestPlayerAverage[] = [];

  for (const player of players) {
    const scores: number[] = [];
    for (const fight of fightsRaw) {
      const entry = fight.find((p) => sameCharacterName(p.name, player.name));
      if (entry) scores.push(entry.score);
    }
    if (scores.length === 0) continue;

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    result.push({ playerId: player.id, wipefestScore: Math.round(average) });
  }

  return result;
}
