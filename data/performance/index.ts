const modules = import.meta.glob<{ default: { week: number } }>('./week-*.json', {
  eager: true,
});

export const performanceWeeks = Object.values(modules)
  .map((mod) => mod.default)
  .sort((a, b) => a.week - b.week);
