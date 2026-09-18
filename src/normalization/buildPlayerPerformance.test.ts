import { describe, expect, it } from "vitest";
import { buildPlayerPerformance } from "./buildPlayerPerformance";

describe("buildPlayerPerformance", () => {
  it("carries playerId and deaths through with no provider contributions", () => {
    expect(buildPlayerPerformance({ playerId: "voidwar", deaths: 2 })).toEqual({
      playerId: "voidwar",
      deaths: 2,
    });
  });

  it("merges the WarcraftLogs contribution in", () => {
    const result = buildPlayerPerformance({
      playerId: "voidwar",
      deaths: 0,
      warcraftLogs: { dps: 69768, parse: 87, itemLevel: 636 },
    });

    expect(result).toEqual({
      playerId: "voidwar",
      deaths: 0,
      dps: 69768,
      parse: 87,
      itemLevel: 636,
    });
  });

  it("junta a contribuição do Wipefest com a da WarcraftLogs", () => {
    const result = buildPlayerPerformance({
      playerId: "voidwar",
      deaths: 1,
      warcraftLogs: { dps: 69768, attack: { score: 78, uptime: 81, cooldowns: 75 } },
      wipefest: { wipefestScore: 92, mechanics: { errors: 1 } },
    });

    expect(result).toEqual({
      playerId: "voidwar",
      deaths: 1,
      dps: 69768,
      attack: { score: 78, uptime: 81, cooldowns: 75 },
      wipefestScore: 92,
      mechanics: { errors: 1 },
    });
  });
});
