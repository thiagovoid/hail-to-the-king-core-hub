import { describe, expect, it } from "vitest";
import { averageWipefestScores } from "./normalize";

describe("averageWipefestScores", () => {
  const players = [
    { id: "blackwatch", name: "Blackwatch" },
    { id: "heracranosx", name: "Heracranosx" },
  ];

  it("averages a player's score across every fight of the run", () => {
    const fights = [
      [{ name: "Blackwatch", score: 80, bonus: 8, itemLevel: 308 }],
      [{ name: "Blackwatch", score: 60, bonus: 4, itemLevel: 308 }],
    ];

    expect(averageWipefestScores(fights, players)).toEqual([{ playerId: "blackwatch", wipefestScore: 70 }]);
  });

  it("matches character names case-insensitively", () => {
    const fights = [[{ name: "BLACKWATCH", score: 90, bonus: 0, itemLevel: 308 }]];

    expect(averageWipefestScores(fights, players)).toEqual([{ playerId: "blackwatch", wipefestScore: 90 }]);
  });

  it("skips players absent from every fight instead of producing a 0", () => {
    const fights = [[{ name: "Blackwatch", score: 90, bonus: 0, itemLevel: 308 }]];

    expect(averageWipefestScores(fights, players)).toEqual([{ playerId: "blackwatch", wipefestScore: 90 }]);
  });

  it("rounds the average to the nearest integer", () => {
    const fights = [
      [{ name: "Blackwatch", score: 70, bonus: 0, itemLevel: 308 }],
      [{ name: "Blackwatch", score: 71, bonus: 0, itemLevel: 308 }],
    ];

    expect(averageWipefestScores(fights, players)).toEqual([{ playerId: "blackwatch", wipefestScore: 71 }]);
  });
});
