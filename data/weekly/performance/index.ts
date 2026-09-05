import type { WeeklyPerformance } from "../../../src/types/performance";
import { sortByWeek } from "../index";

const modules = import.meta.glob<{ default: WeeklyPerformance }>("./week-*.json", {
  eager: true,
});

export const performanceWeeks: WeeklyPerformance[] = sortByWeek(modules);
