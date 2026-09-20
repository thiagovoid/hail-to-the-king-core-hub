import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { maioresPancadas, PANCADAS_POR_TRY, type PancadaLevada } from './biggestHits';

const pancada = (p: Partial<PancadaLevada> & Pick<PancadaLevada, 'amount'>): PancadaLevada => ({
  fight: 1,
  timestamp: 0,
  targetID: 10,
  abilityGameID: 999,
  ...p,
});

describe('maioresPancadas', () => {
  it('guarda as maiores de cada pessoa, não as maiores da try', () => {
    // O tank leva tudo o que é grande. Se o corte fosse global, o dps sairia
    // da temporada sem nenhuma pancada registrada — e é justamente dele que
    // a pergunta "faltou defensivo?" precisa de resposta.
    const eventos = [
      ...[900, 800, 700].map((amount, i) => pancada({ amount, targetID: 10, timestamp: i })),
      pancada({ amount: 50, targetID: 20, timestamp: 9 }),
    ];

    const escolhidas = maioresPancadas(eventos, 2);

    expect(escolhidas.filter((e) => e.targetID === 10).map((e) => e.amount)).toEqual([900, 800]);
    expect(escolhidas.filter((e) => e.targetID === 20).map((e) => e.amount)).toEqual([50]);
  });

  it('separa por try: a maior do try 1 não ocupa a vaga do try 2', () => {
    const eventos = [
      pancada({ amount: 900, fight: 1, timestamp: 1 }),
      pancada({ amount: 10, fight: 2, timestamp: 2 }),
    ];

    expect(maioresPancadas(eventos, 1)).toHaveLength(2);
  });

  it('descarta o golpe absorvido inteiro', () => {
    // Levar 0 não prova que faltou defensivo; prova o contrário.
    const eventos = [pancada({ amount: 0, absorbed: 400 }), pancada({ amount: 5, timestamp: 1 })];

    expect(maioresPancadas(eventos).map((e) => e.amount)).toEqual([5]);
  });

  it('devolve em ordem de tempo, não de tamanho', () => {
    const eventos = [
      pancada({ amount: 900, timestamp: 50 }),
      pancada({ amount: 100, timestamp: 10 }),
    ];

    expect(maioresPancadas(eventos).map((e) => e.timestamp)).toEqual([10, 50]);
  });

  it('nunca inventa nem altera um evento', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fight: fc.integer({ min: 1, max: 4 }),
            timestamp: fc.integer({ min: 0, max: 10_000 }),
            targetID: fc.integer({ min: 1, max: 5 }),
            abilityGameID: fc.integer({ min: 1, max: 50 }),
            amount: fc.integer({ min: 0, max: 1_000_000 }),
          }),
          { maxLength: 300 }
        ),
        (eventos) => {
          const escolhidas = maioresPancadas(eventos);

          for (const escolhida of escolhidas) expect(eventos).toContainEqual(escolhida);

          // Por pessoa e por try, nunca mais que o teto — e nunca menos do
          // que existia, quando existia menos que o teto.
          const porChave = new Map<string, number>();
          const disponiveis = new Map<string, number>();
          for (const e of escolhidas) {
            const c = `${e.fight}:${e.targetID}`;
            porChave.set(c, (porChave.get(c) ?? 0) + 1);
          }
          for (const e of eventos.filter((e) => e.amount > 0)) {
            const c = `${e.fight}:${e.targetID}`;
            disponiveis.set(c, (disponiveis.get(c) ?? 0) + 1);
          }

          for (const [chave, quantas] of disponiveis) {
            expect(porChave.get(chave) ?? 0).toBe(Math.min(quantas, PANCADAS_POR_TRY));
          }
        }
      )
    );
  });
});
