import { describe, expect, it } from "vitest";
import { WCL_DIFFICULTY, applyReportToBosses, mergeRecentLogs, weekNumberFromDate, type ProgressionFight } from "./index";
import type { Boss } from "../../types/index";

function boss(overrides: Partial<Boss>): Boss {
  return {
    id: "boss",
    name: "Boss",
    encounterId: 100,
    status: "not_started",
    pulls: 0,
    bestPullPercent: null,
    killDate: null,
    links: { warcraftLogs: null, wipefest: null, video: null },
    ...overrides,
  };
}

function fight(overrides: Partial<ProgressionFight>): ProgressionFight {
  return { id: 1, encounterID: 100, kill: false, difficulty: WCL_DIFFICULTY.normal, startTime: 0, endTime: 1000, ...overrides };
}

const T0 = Date.UTC(2026, 8, 8, 0, 30); // 2026-09-08 00:30Z

describe("applyReportToBosses", () => {
  it("soma wipes e a kill até a primeira kill, e tomba o boss", () => {
    const report = {
      code: "ABC",
      date: "2026-09-08",
      fights: [
        fight({ id: 1, startTime: T0, endTime: T0 + 1 }),
        fight({ id: 2, startTime: T0 + 10, endTime: T0 + 11 }),
        fight({ id: 3, kill: true, startTime: T0 + 20, endTime: T0 + 21 }),
        // uma "re-kill" no mesmo report não conta (tombou na primeira)
        fight({ id: 4, kill: true, startTime: T0 + 30, endTime: T0 + 31 }),
      ],
    };

    const { bosses, changedBossIds } = applyReportToBosses([boss({ id: "ulatek" })], report, WCL_DIFFICULTY.normal);

    expect(changedBossIds).toEqual(["ulatek"]);
    expect(bosses[0]).toMatchObject({
      status: "killed",
      pulls: 3,
      killDate: new Date(T0 + 21).toISOString(),
      links: { warcraftLogs: "https://www.warcraftlogs.com/reports/ABC?fight=3" },
    });
    expect(bosses[0].pullLog).toEqual([{ reportCode: "ABC", date: "2026-09-08", pulls: 3, kill: true }]);
  });

  it("acumula pulls entre reports enquanto o boss não morre", () => {
    const first = applyReportToBosses(
      [boss({ id: "ulatek", pulls: 6 })],
      { code: "R1", date: "2026-09-08", fights: [fight({ id: 1 }), fight({ id: 2 })] },
      WCL_DIFFICULTY.normal
    );
    const second = applyReportToBosses(
      first.bosses,
      { code: "R2", date: "2026-09-10", fights: [fight({ id: 1 }), fight({ id: 2, kill: true })] },
      WCL_DIFFICULTY.normal
    );

    expect(first.bosses[0]).toMatchObject({ status: "progress", pulls: 8 });
    expect(second.bosses[0]).toMatchObject({ status: "killed", pulls: 10 });
    expect(second.bosses[0].pullLog?.map((e) => e.reportCode)).toEqual(["R1", "R2"]);
  });

  it("é idempotente: o mesmo report visto de novo não conta duas vezes", () => {
    const report = { code: "R1", date: "2026-09-08", fights: [fight({ id: 1 }), fight({ id: 2 })] };
    const once = applyReportToBosses([boss({ id: "ulatek" })], report, WCL_DIFFICULTY.normal);
    const twice = applyReportToBosses(once.bosses, report, WCL_DIFFICULTY.normal);

    expect(twice.changedBossIds).toEqual([]);
    expect(twice.bosses[0].pulls).toBe(2);
  });

  it("não mexe em boss já morto (histórico tombado)", () => {
    const killed = boss({ id: "nekzali", status: "killed", pulls: 3, killDate: "2026-08-18T21:30:00.000Z" });
    const { bosses, changedBossIds } = applyReportToBosses(
      [killed],
      { code: "R9", date: "2026-09-08", fights: [fight({ id: 1, kill: true })] },
      WCL_DIFFICULTY.normal
    );

    expect(changedBossIds).toEqual([]);
    expect(bosses[0]).toBe(killed);
  });

  it("só olha fights da dificuldade pedida", () => {
    const { bosses } = applyReportToBosses(
      [boss({ id: "ulatek" })],
      { code: "R1", date: "2026-09-08", fights: [fight({ id: 1, difficulty: WCL_DIFFICULTY.heroic })] },
      WCL_DIFFICULTY.normal
    );

    expect(bosses[0].pulls).toBe(0);
    expect(bosses[0].status).toBe("not_started");
  });

  it("reporta encounterIDs sem boss mapeado e ignora bosses sem encounterId", () => {
    const { bosses, unmappedEncounterIds } = applyReportToBosses(
      [boss({ id: "sem-mapa", encounterId: null })],
      { code: "R1", date: "2026-09-08", fights: [fight({ id: 1, encounterID: 999 }), fight({ id: 2, encounterID: 999 })] },
      WCL_DIFFICULTY.normal
    );

    expect(unmappedEncounterIds).toEqual([999]);
    expect(bosses[0].pulls).toBe(0);
  });
});

describe("mergeRecentLogs", () => {
  it("prepend novos, dedupe por URL, ordena por data desc e limita", () => {
    const existing = [
      { date: "2026-09-03", url: "https://www.warcraftlogs.com/reports/OLD1", title: "Abismo Venenoso" },
      { date: "2026-09-01", url: "https://www.warcraftlogs.com/reports/OLD2", title: "Abismo Venenoso" },
    ];
    const merged = mergeRecentLogs(
      existing,
      [
        { code: "NEW1", date: "2026-09-08" },
        { code: "OLD1", date: "2026-09-03" },
      ],
      "Abismo Venenoso",
      2
    );

    expect(merged.map((l) => l.url)).toEqual([
      "https://www.warcraftlogs.com/reports/NEW1",
      "https://www.warcraftlogs.com/reports/OLD1",
    ]);
  });
});

describe("weekNumberFromDate", () => {
  it("segue a numeração já usada em data/weekly/performance", () => {
    expect(weekNumberFromDate("2026-08-18", "2026-08-18")).toBe(1);
    expect(weekNumberFromDate("2026-08-25", "2026-08-18")).toBe(2);
    expect(weekNumberFromDate("2026-08-27", "2026-08-18")).toBe(2);
    expect(weekNumberFromDate("2026-09-01", "2026-08-18")).toBe(3);
    expect(weekNumberFromDate("2026-09-03", "2026-08-18")).toBe(3);
    expect(weekNumberFromDate("2026-09-08", "2026-08-18")).toBe(4);
  });

  it("nunca devolve semana 0 pra datas antes do início", () => {
    expect(weekNumberFromDate("2026-08-10", "2026-08-18")).toBe(1);
  });

  it("falha alto em data inválida", () => {
    expect(() => weekNumberFromDate("hoje", "2026-08-18")).toThrow();
  });
});
