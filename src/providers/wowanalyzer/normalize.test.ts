import { describe, expect, it } from "vitest";
import { averageUptime } from "./normalize";

describe("averageUptime", () => {
  it("averages uptime across every fight of the run", () => {
    expect(averageUptime([{ uptime: 60 }, { uptime: 80 }])).toBe(70);
  });

  it("ignores fights with no data instead of treating them as 0", () => {
    expect(averageUptime([{ uptime: 60 }, { uptime: null }])).toBe(60);
  });

  it("returns null when no fight has data", () => {
    expect(averageUptime([{ uptime: null }, { uptime: null }])).toBeNull();
  });

  it("rounds the average to the nearest integer", () => {
    expect(averageUptime([{ uptime: 70 }, { uptime: 71 }])).toBe(71);
  });
});
