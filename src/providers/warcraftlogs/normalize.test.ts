import { describe, expect, it } from "vitest";
import {
  buildRunPlayers,
  calculateAggregateDurationMs,
  calculateMetricValue,
  classNameToSlug,
  countDeaths,
  parseWclProfile,
  sameCharacterName,
  selectAggregateFights,
  slugifyId,
  toBrazilDateString,
  translateRace,
  type WclFight,
  type WclFightTables,
  type WclRankingEntry,
} from "./normalize";

describe("parseWclProfile", () => {
  it("extracts region/realm/name from a WCL profile URL", () => {
    expect(parseWclProfile("https://www.warcraftlogs.com/character/us/nemesis/Voidwar")).toEqual({
      region: "US",
      realm: "nemesis",
      name: "Voidwar",
    });
  });

  it("throws on an invalid URL", () => {
    expect(() => parseWclProfile("https://example.com/nope")).toThrow();
  });
});

describe("sameCharacterName", () => {
  it("ignores case", () => {
    expect(sameCharacterName("Voidwar", "voidwar")).toBe(true);
    expect(sameCharacterName("Voidwar", "Blackwatch")).toBe(false);
  });
});

describe("classNameToSlug", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(classNameToSlug("DeathKnight")).toBe("death-knight");
    expect(classNameToSlug("Warrior")).toBe("warrior");
  });
});

describe("slugifyId", () => {
  it("lowercases and dedupes against existing ids", () => {
    const existing = new Set(["voidwar"]);
    expect(slugifyId("Newguy", existing)).toBe("newguy");
    expect(slugifyId("Voidwar", existing)).toBe("voidwar-2");
  });
});

describe("toBrazilDateString", () => {
  it("shifts UTC into Brazil's fixed -03:00 offset", () => {
    // 2026-08-28T00:30:00Z (raid at 21:30 BRT on the 27th)
    expect(toBrazilDateString(Date.UTC(2026, 7, 28, 0, 30))).toBe("2026-08-27");
  });
});

describe("countDeaths", () => {
  it("counts only matching-name events, case-insensitively", () => {
    const events = [{ name: "Voidwar" }, { name: "voidwar" }, { name: "Blackwatch" }];
    expect(countDeaths(events, "Voidwar")).toBe(2);
  });
});

describe("selectAggregateFights", () => {
  const fight = (id: number, kill: boolean): WclFight => ({
    id,
    encounterID: 1,
    name: "Boss",
    kill,
    difficulty: 5,
    startTime: 0,
    endTime: 1000,
  });

  it("uses killed fights when there are any", () => {
    const raid = [fight(1, false), fight(2, true)];
    const killed = [fight(2, true)];
    expect(selectAggregateFights(raid, killed)).toBe(killed);
  });

  it("falls back to every raid fight on a 100% wipe night", () => {
    const raid = [fight(1, false), fight(2, false)];
    expect(selectAggregateFights(raid, [])).toBe(raid);
  });
});

describe("calculateAggregateDurationMs", () => {
  it("sums fight durations", () => {
    const fights: WclFight[] = [
      { id: 1, encounterID: 1, name: "A", kill: true, difficulty: 5, startTime: 0, endTime: 1000 },
      { id: 2, encounterID: 1, name: "A", kill: true, difficulty: 5, startTime: 5000, endTime: 8000 },
    ];
    expect(calculateAggregateDurationMs(fights)).toBe(4000);
  });
});

describe("calculateMetricValue", () => {
  it("divides total by duration in seconds, not activeTime", () => {
    expect(calculateMetricValue(200_000, 10_000)).toBe(20_000);
  });
});

describe("translateRace", () => {
  it("translates known races to Portuguese", () => {
    expect(translateRace("Dwarf")).toBe("Anão");
  });

  it("falls back to the original value for unknown races", () => {
    expect(translateRace("Something New")).toBe("Something New");
  });

  it("returns empty string for missing race", () => {
    expect(translateRace(undefined)).toBe("");
  });
});

describe("buildRunPlayers", () => {
  const tables = (entries: { name: string; total: number; activeTime: number; itemLevel: number }[]): WclFightTables => ({
    damage: { data: { entries } },
    healing: { data: { entries: [] } },
    summary: { data: { deathEvents: [{ name: "Voidwar" }], playerDetails: {} } },
  });

  it("computes dps and best parse among killed encounters, skipping players absent from the entries", () => {
    const aggregateTables = tables([{ name: "Voidwar", total: 480_200, activeTime: 10_000, itemLevel: 290 }]);
    const rankings: WclRankingEntry[] = [
      {
        characterName: "Voidwar",
        encounterID: 1,
        metric: "dps",
        ranks: [
          { report: { code: "AbC123", fightID: 2 }, rankPercent: 84.2 },
          { report: { code: "AbC123", fightID: 2 }, rankPercent: 91.7 },
          { report: { code: "OTHER", fightID: 2 }, rankPercent: 99 },
        ],
      },
    ];

    const result = buildRunPlayers({
      reportCode: "AbC123",
      aggregateFightIds: [2],
      aggregateDurationMs: 10_000,
      aggregateTables,
      fullTables: aggregateTables,
      rankings,
      players: [
        { id: "voidwar", role: "dps", profile: { region: "US", realm: "nemesis", name: "Voidwar" } },
        { id: "ghost", role: "dps", profile: { region: "US", realm: "nemesis", name: "Ghost" } },
      ],
    });

    expect(result).toEqual([
      { playerId: "voidwar", dps: 48_020, parse: 92, itemLevel: 290, deaths: 1 },
    ]);
  });
});
