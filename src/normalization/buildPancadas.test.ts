import { describe, expect, it } from 'vitest';

import { buildPancadas, FATIA_DA_VIDA } from './buildPancadas';
import type { PancadaLevada } from '../providers/warcraftlogs/biggestHits';

const golpe = (p: Partial<PancadaLevada> & Pick<PancadaLevada, 'amount'>): PancadaLevada => ({
  fight: 1,
  timestamp: 10_000,
  targetID: 10,
  abilityGameID: 999,
  maxHitPoints: 100_000,
  ...p,
});

const inicio = new Map([[1, 0]]);
const nomes = (id: number) => (id === 999 ? 'Gravebound' : undefined);
const nadaPronto = () => [];

describe('buildPancadas', () => {
  it('só mostra golpe que levou um naco da vida', () => {
    // Golpe de rotina todo mundo leva toda luta: apontar cada um seria o
    // mesmo ruído dos sites que só despejam número.
    const pequeno = golpe({ amount: 10_000 });
    const grande = golpe({ amount: 70_000 });

    const saida = buildPancadas([pequeno, grande], 10, inicio, nomes, nadaPronto);

    expect(saida).toHaveLength(1);
    expect(saida[0].amount).toBe(70_000);
    expect(saida[0].fatiaDaVida).toBe(70);
  });

  it('respeita o limiar exato sem deixar passar o de baixo', () => {
    const naLinha = golpe({ amount: Math.ceil(100_000 * FATIA_DA_VIDA) });
    const abaixo = golpe({ amount: Math.floor(100_000 * FATIA_DA_VIDA) - 1 });

    expect(buildPancadas([naLinha], 10, inicio, nomes, nadaPronto)).toHaveLength(1);
    expect(buildPancadas([abaixo], 10, inicio, nomes, nadaPronto)).toHaveLength(0);
  });

  it('não cobra de quem não levou o golpe', () => {
    const doOutro = golpe({ amount: 90_000, targetID: 99 });

    expect(buildPancadas([doOutro], 10, inicio, nomes, nadaPronto)).toHaveLength(0);
  });

  it('diz qual defensivo estava na mão', () => {
    const saida = buildPancadas([golpe({ amount: 80_000 })], 10, inicio, nomes, () => [
      'Anti-Magic Zone',
    ]);

    expect(saida[0]).toMatchObject({
      ability: 'Gravebound',
      fatiaDaVida: 80,
      defensivosProntos: ['Anti-Magic Zone'],
    });
  });

  it('sem defensivo pronto o golpe não acusa ninguém', () => {
    // Continua aparecendo — é informação sobre a luta — mas sem nada na mão
    // não havia o que fazer, e a lista vazia é o que diz isso.
    const saida = buildPancadas([golpe({ amount: 80_000 })], 10, inicio, nomes, nadaPronto);

    expect(saida[0].defensivosProntos).toEqual([]);
  });

  it('entra sem a fatia quando a vida máxima não veio, em vez de sumir', () => {
    // "Levou 812k de Gravebound" é um laudo mais pobre, não um laudo falso.
    // Inventar um denominador seria pior do que não ter um.
    const semVida = golpe({ amount: 812_000, maxHitPoints: undefined });

    const saida = buildPancadas([semVida], 10, inicio, nomes, nadaPronto);

    expect(saida).toHaveLength(1);
    expect(saida[0].fatiaDaVida).toBeUndefined();
  });

  it('conta o segundo a partir do começo da try', () => {
    const saida = buildPancadas(
      [golpe({ amount: 80_000, timestamp: 95_000, fight: 7 })],
      10,
      new Map([[7, 20_000]]),
      nomes,
      nadaPronto
    );

    expect(saida[0].atSecond).toBe(75);
  });

  it('devolve as maiores primeiro, no limite pedido', () => {
    const saida = buildPancadas(
      [40_000, 90_000, 60_000, 80_000].map((amount, i) =>
        golpe({ amount, timestamp: 1_000 * i })
      ),
      10,
      inicio,
      nomes,
      nadaPronto,
      2
    );

    expect(saida.map((p) => p.amount)).toEqual([90_000, 80_000]);
  });

  it('ignora try cujo começo não é conhecido, em vez de inventar o segundo', () => {
    const saida = buildPancadas([golpe({ amount: 80_000, fight: 42 })], 10, inicio, nomes, nadaPronto);

    expect(saida).toHaveLength(0);
  });
});
