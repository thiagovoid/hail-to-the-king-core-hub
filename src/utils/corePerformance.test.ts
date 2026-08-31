import { describe, expect, it } from "vitest";
import {
  getCorePerformanceSeries,
} from "./corePerformance";

describe("getCorePerformanceSeries", () => {
  const weeks = [
    {
      week: 2,
      date: "2026-08-28",
      players: [
        {
          playerId: "nerlock",
          dps: 100000,
          parse: 72,
          deaths: 1,
          mechanics: {
            errors: 2,
          },
        },
      ],
    },
    {
      week: 1,
      date: "2026-08-21",
      players: [
        {
          playerId: "nerlock",
          dps: 90000,
          parse: 65,
          deaths: 2,
          mechanics: {
            errors: 3,
          },
        },
      ],
    },
  ];

  it("orders weeks chronologically", () => {
    const result = getCorePerformanceSeries(
      weeks,
      "dps"
    );

    expect(result[0].data).toEqual([
      {
        week: 1,
        value: 90000,
      },
      {
        week: 2,
        value: 100000,
      },
    ]);
  });

  it("ignores players without the selected metric", () => {
    const result = getCorePerformanceSeries(
      weeks,
      "dps"
    );

    expect(result).toHaveLength(1);
    expect(result[0].playerId).toBe("nerlock");
  });

  it("supports parse", () => {
    const result = getCorePerformanceSeries(
      weeks,
      "parse"
    );

    expect(result[0].data).toEqual([
      {
        week: 1,
        value: 65,
      },
      {
        week: 2,
        value: 72,
      },
    ]);
  });
});