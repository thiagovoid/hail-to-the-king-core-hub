/**
 * Testes de propriedade para src/utils/progression.ts
 *
 * **Validates: Requirements 3.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeProgression, safeUrl } from './progression';
import type { Boss } from '@/types/index';

// ---------------------------------------------------------------------------
// Arbitrários
// ---------------------------------------------------------------------------

const bossStatusArb = fc.oneof(
  fc.constant('killed' as const),
  fc.constant('progress' as const),
  fc.constant('not_started' as const),
);

/** Gera um Boss mínimo com campos requeridos por computeProgression */
const bossArb: fc.Arbitrary<Boss> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  status: bossStatusArb,
  pulls: fc.nat(),
  bestPullPercent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  killDate: fc.option(fc.string(), { nil: null }),
  links: fc.record({
    warcraftLogs: fc.option(fc.string(), { nil: null }),
    wipefest: fc.option(fc.string(), { nil: null }),
    video: fc.option(fc.string(), { nil: null }),
  }),
});

const bossArrayArb = fc.array(bossArb, { minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('computeProgression', () => {
  /**
   * Property 2: para qualquer lista de bosses, killed/total/percent são consistentes.
   */
  it('Property 2: killed, total and percent are always consistent', () => {
    fc.assert(
      fc.property(bossArrayArb, (bosses) => {
        const { killed, total, percent } = computeProgression(bosses);

        // total === bosses.length
        expect(total).toBe(bosses.length);

        // killed === contagem real de bosses com status "killed"
        const expectedKilled = bosses.filter((b) => b.status === 'killed').length;
        expect(killed).toBe(expectedKilled);

        // percent está entre 0 e 100
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);

        // percent === Math.round((killed / total) * 100) quando total > 0
        if (total > 0) {
          expect(percent).toBe(Math.round((killed / total) * 100));
        } else {
          // array vazio => todos zero
          expect(percent).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 2: empty array returns all zeros', () => {
    expect(computeProgression([])).toEqual({ killed: 0, total: 0, percent: 0 });
  });
});

// ---------------------------------------------------------------------------
// safeUrl
// ---------------------------------------------------------------------------

describe('safeUrl', () => {
  it('returns null for null', () => {
    expect(safeUrl(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(safeUrl(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeUrl('')).toBeNull();
  });

  it('returns the URL unchanged for a valid URL string', () => {
    const url = 'https://example.com/logs/1234';
    expect(safeUrl(url)).toBe(url);
  });

  it('returns the URL unchanged for any non-empty string', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        expect(safeUrl(s)).toBe(s);
      }),
      { numRuns: 100 },
    );
  });
});
