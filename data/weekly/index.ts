/**
 * Shared loader for the two weekly-snapshot series (performance/, highlights/):
 * both glob their own `week-*.json` files and just need the results sorted
 * by week — the glob call itself has to stay in each folder's own index.ts
 * (Vite requires `import.meta.glob`'s path to be a static literal at the
 * call site, so it can't be factored into a shared function).
 */
export function sortByWeek<T extends { week: number }>(modules: Record<string, { default: T }>): T[] {
  return Object.values(modules)
    .map((mod) => mod.default)
    .sort((a, b) => a.week - b.week);
}
