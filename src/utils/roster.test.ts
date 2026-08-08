/**
 * Testes de propriedade para src/utils/roster.ts
 *
 * **Validates: Requirements 3.6, 3.7**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortPlayersByIo, getClassColor, computeMythicStats } from './roster';
import type { Player, WowClass } from '@/types/index';

// ---------------------------------------------------------------------------
// Constantes / tipos
// ---------------------------------------------------------------------------

const WOW_CLASSES: WowClass[] = [
  'death-knight',
  'demon-hunter',
  'druid',
  'evoker',
  'hunter',
  'mage',
  'monk',
  'paladin',
  'priest',
  'rogue',
  'shaman',
  'warlock',
  'warrior',
];

// ---------------------------------------------------------------------------
// Arbitrários
// ---------------------------------------------------------------------------

/** Gera um Player mínimo: apenas raiderIo.io precisa ser válido para sortPlayersByIo */
const playerArb: fc.Arbitrary<Player> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  class: fc.constantFrom(...WOW_CLASSES),
  race: fc.constant('human' as const),
  spec: fc.string({ minLength: 1, maxLength: 20 }),
  heroSpec: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  role: fc.oneof(
    fc.constant('tank' as const),
    fc.constant('healer' as const),
    fc.constant('dps' as const),
  ),
  type: fc.oneof(fc.constant('main' as const), fc.constant('alt' as const)),
  discord: fc.option(fc.string(), { nil: null }),
  avatar: fc.option(fc.string(), { nil: null }),
  raiderIo: fc.record({
    io: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: null }),
    bestDungeon: fc.option(fc.string(), { nil: null }),
    highestKey: fc.option(fc.nat(), { nil: null }),
    realmRank: fc.option(fc.nat(), { nil: null }),
    profileUrl: fc.option(fc.string(), { nil: null }),
  }),
  warcraftLogs: fc.record({
    avgParse: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    bestParse: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    attendance: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    profileUrl: fc.option(fc.string(), { nil: null }),
  }),
  externalLinks: fc.record({
    raiderIo: fc.option(fc.string(), { nil: null }),
    raidbots: fc.option(fc.string(), { nil: null }),
    archon: fc.option(fc.string(), { nil: null }),
    warcraftLogs: fc.option(fc.string(), { nil: null }),
    wipefest: fc.option(fc.string(), { nil: null }),
  }),
});

const playerArrayArb = fc.array(playerArb, { minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property 3: sortPlayersByIo
// ---------------------------------------------------------------------------

describe('sortPlayersByIo', () => {
  /**
   * Property 3: para qualquer lista de players, sortPlayersByIo retorna
   * ordenação decrescente por IO sem perder elementos.
   */
  it('Property 3: result is sorted descending by IO, no elements lost', () => {
    fc.assert(
      fc.property(playerArrayArb, (players) => {
        const sorted = sortPlayersByIo(players);

        // Tamanho preservado
        expect(sorted.length).toBe(players.length);

        // Cada player original aparece exatamente uma vez no resultado
        // (verificado por referência de objeto, não por id — ids podem não ser únicos)
        for (const player of players) {
          const occurrences = sorted.filter((p) => p === player).length;
          expect(occurrences).toBe(1);
        }

        // Pares consecutivos respeitam ordem decrescente (null vai para o final)
        for (let i = 0; i < sorted.length - 1; i++) {
          const ioA = sorted[i].raiderIo.io ?? -1;
          const ioB = sorted[i + 1].raiderIo.io ?? -1;
          expect(ioA).toBeGreaterThanOrEqual(ioB);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 3: empty array returns empty array', () => {
    expect(sortPlayersByIo([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Property 6: getClassColor
// ---------------------------------------------------------------------------

describe('getClassColor', () => {
  /**
   * Property 6: para qualquer WowClass válida, getClassColor retorna
   * uma string CSS não-vazia.
   */
  it('Property 6: returns non-empty CSS string for every valid WowClass', () => {
    for (const cls of WOW_CLASSES) {
      const result = getClassColor(cls);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 6 (property-based): classe aleatória → string não-vazia
   */
  it('Property 6: random WowClass always returns a non-empty string', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WOW_CLASSES), (cls) => {
        const result = getClassColor(cls);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: null returns "text-gray-300"', () => {
    expect(getClassColor(null)).toBe('text-gray-300');
  });

  it('Property 6: undefined returns "text-gray-300"', () => {
    expect(getClassColor(undefined)).toBe('text-gray-300');
  });
});

// ---------------------------------------------------------------------------
// computeMythicStats
// ---------------------------------------------------------------------------

/** Build a minimal Player fixture with a given IO value */
function makePlayer(io: number | null): Player {
  return {
    id: 'p',
    name: 'Test',
    class: 'warrior',
    race: 'human',
    spec: 'Arms',
    heroSpec: null,
    role: 'dps',
    type: 'main',
    discord: null,
    avatar: null,
    raiderIo: { io, bestDungeon: null, highestKey: null, realmRank: null, profileUrl: null },
    warcraftLogs: { avgParse: null, bestParse: null, attendance: null, profileUrl: null },
    externalLinks: { raiderIo: null, raidbots: null, archon: null, warcraftLogs: null, wipefest: null },
  };
}

describe('computeMythicStats', () => {
  it('returns all zeros for empty array', () => {
    const stats = computeMythicStats([]);
    expect(stats.avgIo).toBe(0);
    expect(stats.maxIo).toBe(0);
    expect(stats.distribution).toEqual({ tier2500: 0, tier3000: 0, tier3500: 0, tier4000: 0 });
  });

  it('returns all zeros for players with only null IOs', () => {
    const stats = computeMythicStats([makePlayer(null), makePlayer(null)]);
    expect(stats.avgIo).toBe(0);
    expect(stats.maxIo).toBe(0);
  });

  it('calculates avgIo correctly', () => {
    const stats = computeMythicStats([makePlayer(3000), makePlayer(3500)]);
    expect(stats.avgIo).toBe(3250);
  });

  it('calculates maxIo correctly', () => {
    const stats = computeMythicStats([makePlayer(2800), makePlayer(4100), makePlayer(3200)]);
    expect(stats.maxIo).toBe(4100);
  });

  it('calculates distribution tiers correctly', () => {
    const players = [
      makePlayer(2400), // below all tiers
      makePlayer(2500), // >= 2500
      makePlayer(3100), // >= 2500, 3000
      makePlayer(3600), // >= 2500, 3000, 3500
      makePlayer(4000), // >= all tiers
    ];
    const stats = computeMythicStats(players);
    expect(stats.distribution.tier2500).toBe(4);
    expect(stats.distribution.tier3000).toBe(3);
    expect(stats.distribution.tier3500).toBe(2);
    expect(stats.distribution.tier4000).toBe(1);
  });

  it('ignores null IOs in distribution', () => {
    const stats = computeMythicStats([makePlayer(null), makePlayer(3000)]);
    expect(stats.distribution.tier3000).toBe(1);
    expect(stats.distribution.tier2500).toBe(1);
  });

  it('property: avgIo is between 0 and maxIo', () => {
    fc.assert(
      fc.property(playerArrayArb, (players) => {
        const stats = computeMythicStats(players);
        expect(stats.avgIo).toBeGreaterThanOrEqual(0);
        expect(stats.avgIo).toBeLessThanOrEqual(stats.maxIo === 0 ? 0 : stats.maxIo);
        expect(stats.maxIo).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});
