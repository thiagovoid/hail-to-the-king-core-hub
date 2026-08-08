/**
 * Testes de propriedade para src/utils/loot.ts
 *
 * **Validates: Requirements 3.9**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterLoots, computeLootStats } from './loot';
import type { Loot, LootFilters } from '@/types/index';

// ---------------------------------------------------------------------------
// Arbitrários
// ---------------------------------------------------------------------------

const lootArb: fc.Arbitrary<Loot> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  date: fc.string({ minLength: 1, maxLength: 20 }),
  player: fc.string({ minLength: 1, maxLength: 20 }),
  itemName: fc.string({ minLength: 1, maxLength: 40 }),
  itemLevel: fc.integer({ min: 1, max: 700 }),
  boss: fc.string({ minLength: 1, maxLength: 20 }),
  week: fc.integer({ min: 1, max: 52 }),
});

const lootArrayArb = fc.array(lootArb, { minLength: 0, maxLength: 30 });

/** Gera LootFilters com campos opcionais possivelmente ativos */
const lootFiltersArb: fc.Arbitrary<LootFilters> = fc.record(
  {
    week: fc.option(fc.integer({ min: 1, max: 52 }), { nil: null }),
    player: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    boss: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  },
  { requiredKeys: [] },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function satisfiesFilters(loot: Loot, filters: LootFilters): boolean {
  if (filters.week !== null && filters.week !== undefined) {
    if (loot.week !== filters.week) return false;
  }
  if (filters.player !== null && filters.player !== undefined && filters.player !== '') {
    if (loot.player !== filters.player) return false;
  }
  if (filters.boss !== null && filters.boss !== undefined && filters.boss !== '') {
    if (loot.boss !== filters.boss) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Property 4: filterLoots
// ---------------------------------------------------------------------------

describe('filterLoots', () => {
  /**
   * Property 4: soundness — todo item no resultado satisfaz todos os filtros ativos.
   */
  it('Property 4 (soundness): every result item satisfies all active filters', () => {
    fc.assert(
      fc.property(lootArrayArb, lootFiltersArb, (loots, filters) => {
        const result = filterLoots(loots, filters);

        for (const loot of result) {
          expect(satisfiesFilters(loot, filters)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: completeness — nenhum item original que satisfaça os filtros
   * está ausente do resultado.
   */
  it('Property 4 (completeness): no matching item from original is absent from result', () => {
    fc.assert(
      fc.property(lootArrayArb, lootFiltersArb, (loots, filters) => {
        const result = filterLoots(loots, filters);
        const resultIds = new Set(result.map((l) => l.id));

        const expectedMatching = loots.filter((l) => satisfiesFilters(l, filters));

        for (const loot of expectedMatching) {
          expect(resultIds.has(loot.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4 (round-trip): filterLoots(loots, {}) retorna os mesmos itens
   * sem filtros ativos.
   */
  it('Property 4 (round-trip): filterLoots(loots, {}) returns all items', () => {
    fc.assert(
      fc.property(lootArrayArb, (loots) => {
        const result = filterLoots(loots, {});
        expect(result.length).toBe(loots.length);

        const resultIds = new Set(result.map((l) => l.id));
        for (const loot of loots) {
          expect(resultIds.has(loot.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// computeLootStats
// ---------------------------------------------------------------------------

describe('computeLootStats', () => {
  it('returns empty array for empty input', () => {
    expect(computeLootStats([])).toEqual([]);
  });

  it('returns one entry per unique player', () => {
    const loots: Loot[] = [
      { id: '1', date: '2024-01-10', player: 'Alice', itemName: 'Sword', itemLevel: 450, boss: 'BossA', week: 1 },
      { id: '2', date: '2024-01-17', player: 'Bob',   itemName: 'Staff', itemLevel: 440, boss: 'BossB', week: 2 },
      { id: '3', date: '2024-01-24', player: 'Alice', itemName: 'Ring',  itemLevel: 448, boss: 'BossC', week: 3 },
    ];

    const stats = computeLootStats(loots);
    expect(stats).toHaveLength(2);

    const aliceStats = stats.find((s) => s.playerId === 'Alice');
    expect(aliceStats).toBeDefined();
    expect(aliceStats!.totalLoots).toBe(2);
    expect(aliceStats!.lastLootDate).toBe('2024-01-24');

    const bobStats = stats.find((s) => s.playerId === 'Bob');
    expect(bobStats).toBeDefined();
    expect(bobStats!.totalLoots).toBe(1);
  });

  it('calculates totalLoots correctly', () => {
    const loots: Loot[] = [
      { id: '1', date: '2024-02-01', player: 'Alice', itemName: 'Helm', itemLevel: 460, boss: 'BossA', week: 1 },
      { id: '2', date: '2024-02-08', player: 'Alice', itemName: 'Belt', itemLevel: 455, boss: 'BossB', week: 2 },
      { id: '3', date: '2024-02-15', player: 'Alice', itemName: 'Boots', itemLevel: 458, boss: 'BossC', week: 3 },
    ];

    const stats = computeLootStats(loots);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalLoots).toBe(3);
    expect(stats[0].lastLootDate).toBe('2024-02-15');
  });

  it('assigns the latest date as lastLootDate', () => {
    const loots: Loot[] = [
      { id: '1', date: '2024-03-01', player: 'Xena', itemName: 'Axe',   itemLevel: 450, boss: 'BossA', week: 1 },
      { id: '2', date: '2024-05-01', player: 'Xena', itemName: 'Cloak', itemLevel: 452, boss: 'BossB', week: 5 },
      { id: '3', date: '2024-04-01', player: 'Xena', itemName: 'Ring',  itemLevel: 451, boss: 'BossC', week: 3 },
    ];

    const stats = computeLootStats(loots);
    expect(stats[0].lastLootDate).toBe('2024-05-01');
  });

  it('property: totalLoots sums correctly for each player', () => {
    fc.assert(
      fc.property(lootArrayArb, (loots) => {
        const stats = computeLootStats(loots);

        for (const stat of stats) {
          const expected = loots.filter((l) => l.player === stat.playerId).length;
          expect(stat.totalLoots).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('property: every player in input appears in output', () => {
    fc.assert(
      fc.property(lootArrayArb, (loots) => {
        const stats = computeLootStats(loots);
        const statPlayerIds = new Set(stats.map((s) => s.playerId));
        const inputPlayers = new Set(loots.map((l) => l.player));

        for (const player of inputPlayers) {
          expect(statPlayerIds.has(player)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
