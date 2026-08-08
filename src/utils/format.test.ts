/**
 * Testes de propriedade para src/utils/format.ts
 *
 * **Validates: Requirements 2.9, 4.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatValue, formatDate, formatPercent } from './format';

describe('formatValue', () => {
  // Feature: core-hub, Property 1: para qualquer entrada, formatValue nunca retorna "null", "undefined" ou "NaN"
  it('Property 1: never returns "null", "undefined" or "NaN" for any input', () => {
    // fc.option(fc.anything()) gera valores incluindo null (via option) e qualquer outro valor
    const arb = fc.option(fc.anything());

    fc.assert(
      fc.property(arb, (v) => {
        const result = formatValue(v);

        // Deve ser sempre uma string
        expect(typeof result).toBe('string');

        // Nunca deve ser vazia
        expect(result.length).toBeGreaterThan(0);

        // Nunca deve ser o literal "null", "undefined" ou "NaN"
        expect(result).not.toBe('null');
        expect(result).not.toBe('undefined');
        expect(result).not.toBe('NaN');
      }),
      { numRuns: 100 },
    );
  });

  // Feature: core-hub, Property 1 (complemento): null, undefined e "" retornam exatamente "—"
  it('Property 1: null, undefined and "" return exactly "—"', () => {
    const edgeCaseArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
    );

    fc.assert(
      fc.property(edgeCaseArb, (v) => {
        expect(formatValue(v)).toBe('—');
      }),
      { numRuns: 10 },
    );

    // verificações explícitas
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('')).toBe('—');
  });

  // Feature: core-hub, Property 1 (complemento): NaN retorna exatamente "—"
  it('Property 1: NaN returns exactly "—"', () => {
    expect(formatValue(NaN)).toBe('—');
  });

  // Feature: core-hub, Property 1 (complemento): valores non-nullish primitivos são convertidos via String()
  it('Property 1: non-nullish primitive values are converted via String()', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.boolean(),
          fc.string().filter((s) => s !== ''),
        ),
        (v) => {
          const result = formatValue(v);
          expect(result).toBe(String(v));
          expect(result).not.toBe('null');
          expect(result).not.toBe('undefined');
          expect(result).not.toBe('NaN');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('returns "—" for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('formats a valid ISO date to DD/MM/YYYY', () => {
    expect(formatDate('2024-03-15')).toBe('15/03/2024');
  });

  it('formats a date with time component correctly', () => {
    expect(formatDate('2025-01-07T18:00:00Z')).toBe('07/01/2025');
  });

  it('pads day and month with leading zeros', () => {
    expect(formatDate('2024-01-05')).toBe('05/01/2024');
  });

  it('returns "—" for an invalid date string (no match)', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('returns "—" for an empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns "—" for invalid month 00', () => {
    expect(formatDate('2024-00-10')).toBe('—');
  });

  it('returns "—" for invalid month 13', () => {
    expect(formatDate('2024-13-10')).toBe('—');
  });

  it('returns "—" for invalid day 00', () => {
    expect(formatDate('2024-05-00')).toBe('—');
  });

  it('returns "—" for invalid day 32', () => {
    expect(formatDate('2024-05-32')).toBe('—');
  });

  it('property: valid YYYY-MM-DD always parses to DD/MM/YYYY', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }), // safe day range for all months
        (year, month, day) => {
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const result = formatDate(iso);
          const expected = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

describe('formatPercent', () => {
  it('returns "—" for null', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('formats 0 as "0%"', () => {
    expect(formatPercent(0)).toBe('0%');
  });

  it('formats 100 as "100%"', () => {
    expect(formatPercent(100)).toBe('100%');
  });

  it('formats 73 as "73%"', () => {
    expect(formatPercent(73)).toBe('73%');
  });

  it('property: for any non-null integer, returns "{n}%" string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (n) => {
        expect(formatPercent(n)).toBe(`${n}%`);
      }),
      { numRuns: 100 },
    );
  });
});
