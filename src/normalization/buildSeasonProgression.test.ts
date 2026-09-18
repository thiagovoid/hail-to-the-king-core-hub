import { describe, expect, it } from "vitest";
import { computeWeekNumber, updateBossProgression, updateRecentLogs, type SeasonConfigFile } from "./buildSeasonProgression";
import type { WclFight } from "../providers/warcraftlogs/normalize";
import type { WclReportRef } from "../providers/warcraftlogs/WarcraftLogsProvider";
import type { Boss } from "../types/index";

function boss(overrides: Partial<Boss>): Boss {
  return {
    id: "boss",
    name: "Boss",
    encounterID: 100,
    status: "not_started",
    pulls: 0,
    bestPullPercent: null,
    killDate: null,
    links: { warcraftLogs: null, wipefest: null, video: null },
    ...overrides,
  };
}

function season(overrides: Partial<SeasonConfigFile> = {}): SeasonConfigFile {
  return {
    config: {
      coreName: "Core Nemesis",
      guild: "Hail to the King",
      realm: "Nemesis",
      currentSeason: "Midnight Season 2",
      currentRaid: "Abismo Venenoso",
      lastUpdated: "2026-08-29T17:24:00.000Z",
      raidWeekAnchor: "2026-08-18",
      performanceTargets: {
        parse: { target: 60, direction: "higher", description: "Parse mínimo" },
        mechanics: { target: 2, direction: "lower", description: "Erros mecânicos" },
        attack: { target: 70, direction: "higher", description: "Uso de cooldowns" },
        preparation: { target: 60, direction: "higher", description: "Itens de preparação" },
      },
      nextRaid: { date: "2026-09-01", time: "21:30", objective: "Progressão" },
    },
    bossesNormal: [],
    bossesHeroic: [],
    recentLogs: [],
    ...overrides,
  };
}

function report(overrides: Partial<WclReportRef> = {}): WclReportRef {
  return { code: "ABC123", startTime: 1_000_000_000_000, ...overrides };
}

function fight(overrides: Partial<WclFight>): WclFight {
  return {
    id: 1,
    encounterID: 100,
    name: "Boss",
    kill: false,
    difficulty: 3,
    startTime: 0,
    endTime: 300_000,
    ...overrides,
  };
}

describe("computeWeekNumber", () => {
  const anchor = "2026-08-18"; // terça-feira, semana 1

  it("returns 1 for the anchor date itself", () => {
    expect(computeWeekNumber(anchor, new Date("2026-08-18T12:00:00.000Z").getTime())).toBe(1);
  });

  it("returns 1 for the last day before the next reset (day 6)", () => {
    expect(computeWeekNumber(anchor, new Date("2026-08-24T23:00:00.000Z").getTime())).toBe(1);
  });

  it("returns 2 exactly 7 days after the anchor", () => {
    expect(computeWeekNumber(anchor, new Date("2026-08-25T00:00:00.000Z").getTime())).toBe(2);
  });

  it("matches the real season boundaries observed (week 4 around day 22-23)", () => {
    expect(computeWeekNumber(anchor, new Date("2026-09-09T00:00:00.000Z").getTime())).toBe(4);
    expect(computeWeekNumber(anchor, new Date("2026-09-10T00:00:00.000Z").getTime())).toBe(4);
  });

  it("never returns less than 1, even for a reference before the anchor", () => {
    expect(computeWeekNumber(anchor, new Date("2026-01-01T00:00:00.000Z").getTime())).toBe(1);
  });
});

describe("updateBossProgression", () => {
  it("does nothing when no fight matches the boss's encounterID/difficulty", () => {
    const s = season({ bossesNormal: [boss({ id: "b1", encounterID: 100, status: "not_started" })] });
    const changes = updateBossProgression(s, [{ report: report(), raidFights: [fight({ encounterID: 999 })] }]);

    expect(changes).toEqual([]);
    expect(s.bossesNormal[0].status).toBe("not_started");
    expect(s.bossesNormal[0].pulls).toBe(0);
  });

  it("counts wipes as pulls and bumps not_started to progress, without a kill", () => {
    const s = season({ bossesNormal: [boss({ id: "b1", encounterID: 100, status: "not_started", pulls: 2 })] });
    const changes = updateBossProgression(s, [
      { report: report(), raidFights: [fight({ kill: false }), fight({ kill: false, id: 2 })] },
    ]);

    expect(s.bossesNormal[0].status).toBe("progress");
    expect(s.bossesNormal[0].pulls).toBe(4);
    expect(s.bossesNormal[0].killDate).toBeNull();
    expect(s.bossesNormal[0].links.warcraftLogs).toBeNull();
    expect(changes).toEqual(["Boss (Normal): +2 pull(s), 4 no total"]);
  });

  it("marks a boss killed, sets killDate from report.startTime + fight.endTime, and the WCL link", () => {
    const s = season({ bossesNormal: [boss({ id: "b1", encounterID: 100, status: "progress", pulls: 3 })] });
    const r = report({ code: "REPORT1", startTime: 1_757_000_000_000 });
    const killFight = fight({ id: 7, kill: true, endTime: 500_000 });

    const changes = updateBossProgression(s, [{ report: r, raidFights: [killFight] }]);

    expect(s.bossesNormal[0].status).toBe("killed");
    expect(s.bossesNormal[0].pulls).toBe(4);
    expect(s.bossesNormal[0].killDate).toBe(new Date(1_757_000_000_000 + 500_000).toISOString());
    expect(s.bossesNormal[0].links.warcraftLogs).toBe("https://www.warcraftlogs.com/reports/REPORT1?fight=7");
    expect(changes).toEqual(["Boss (Normal): morto! (4 pulls no total)"]);
  });

  it("never touches a boss that is already killed, even if a matching fight shows up again", () => {
    const s = season({
      bossesNormal: [
        boss({
          id: "b1",
          encounterID: 100,
          status: "killed",
          pulls: 5,
          killDate: "2026-08-18T21:30:00.000Z",
          links: { warcraftLogs: "https://www.warcraftlogs.com/reports/OLD?fight=1", wipefest: null, video: null },
        }),
      ],
    });

    const changes = updateBossProgression(s, [{ report: report(), raidFights: [fight({ kill: true })] }]);

    expect(changes).toEqual([]);
    expect(s.bossesNormal[0]).toMatchObject({ pulls: 5, killDate: "2026-08-18T21:30:00.000Z" });
    expect(s.bossesNormal[0].links.warcraftLogs).toBe("https://www.warcraftlogs.com/reports/OLD?fight=1");
  });

  it("routes by difficulty: a Heroic fight (difficulty 4) never updates the Normal bucket for the same encounterID", () => {
    const s = season({
      bossesNormal: [boss({ id: "b1", encounterID: 100, status: "not_started" })],
      bossesHeroic: [boss({ id: "b1", encounterID: 100, status: "not_started" })],
    });

    updateBossProgression(s, [{ report: report(), raidFights: [fight({ difficulty: 4, kill: true })] }]);

    expect(s.bossesNormal[0].status).toBe("not_started");
    expect(s.bossesHeroic[0].status).toBe("killed");
  });

  it("aggregates fights across multiple reports in the same run", () => {
    const s = season({ bossesNormal: [boss({ id: "b1", encounterID: 100, status: "not_started" })] });

    const changes = updateBossProgression(s, [
      { report: report({ code: "R1" }), raidFights: [fight({ kill: false })] },
      { report: report({ code: "R2" }), raidFights: [fight({ kill: true, id: 3 })] },
    ]);

    expect(s.bossesNormal[0].status).toBe("killed");
    expect(s.bossesNormal[0].pulls).toBe(2);
    expect(s.bossesNormal[0].links.warcraftLogs).toBe("https://www.warcraftlogs.com/reports/R2?fight=3");
    expect(changes).toEqual(["Boss (Normal): morto! (2 pulls no total)"]);
  });
});

describe("updateRecentLogs", () => {
  it("adds a new report as a recentLogs entry using the season's currentRaid as title", () => {
    const s = season({ recentLogs: [] });
    const changed = updateRecentLogs(s, [{ report: report({ code: "NEW1", startTime: Date.parse("2026-09-09T00:00:00.000Z")}) }]);

    expect(changed).toBe(true);
    expect(s.recentLogs).toEqual([
      { date: "2026-09-08", url: "https://www.warcraftlogs.com/reports/NEW1", title: "Abismo Venenoso" },
    ]);
  });

  it("does not duplicate a report whose URL is already in recentLogs", () => {
    const existing = { date: "2026-09-03", url: "https://www.warcraftlogs.com/reports/OLD1", title: "Abismo Venenoso" };
    const s = season({ recentLogs: [existing] });

    const changed = updateRecentLogs(s, [{ report: report({ code: "OLD1" }) }]);

    expect(changed).toBe(false);
    expect(s.recentLogs).toEqual([existing]);
  });

  it("sorts recentLogs by date descending after adding a new entry", () => {
    const s = season({
      recentLogs: [{ date: "2026-08-18", url: "https://www.warcraftlogs.com/reports/OLD1", title: "Abismo Venenoso" }],
    });

    updateRecentLogs(s, [{ report: report({ code: "NEW1", startTime: Date.parse("2026-09-09T00:00:00.000Z") }) }]);

    expect(s.recentLogs.map((entry) => entry.url)).toEqual([
      "https://www.warcraftlogs.com/reports/NEW1",
      "https://www.warcraftlogs.com/reports/OLD1",
    ]);
  });
});
