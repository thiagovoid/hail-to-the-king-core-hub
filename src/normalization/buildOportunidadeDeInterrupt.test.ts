import { describe, expect, it } from 'vitest';

import {
  buildOportunidadeDeInterrupt,
  magiasInterrompiveis,
} from './buildOportunidadeDeInterrupt';

describe('magiasInterrompiveis', () => {
  it('aprende do log, não de lista curada', () => {
    const conjunto = magiasInterrompiveis([
      { sourceID: 1, fight: 1, extraAbilityGameID: 999 },
      { sourceID: 2, fight: 1, extraAbilityGameID: 888 },
      { sourceID: 1, fight: 2, extraAbilityGameID: 999 },
    ]);

    expect([...conjunto].sort()).toEqual([888, 999]);
  });

  it('ignora interrupção sem a magia alvo registrada', () => {
    expect(magiasInterrompiveis([{ sourceID: 1, fight: 1 }]).size).toBe(0);
  });
});

describe('buildOportunidadeDeInterrupt', () => {
  const interrompiveis = new Set([999]);

  it('não cobra oportunidade de try que a pessoa não jogou', () => {
    const porPessoa = buildOportunidadeDeInterrupt(
      [{ fight: 1, abilityGameID: 999, casts: 5 }],
      [],
      new Map([[1, new Set([10])]]),
      interrompiveis
    );

    // O ator 20 não estava na try 1 e por isso nem aparece.
    expect(porPessoa.get(10)?.oportunidades).toBe(5);
    expect(porPessoa.has(20)).toBe(false);
  });

  it('ignora cast de magia que ninguém nunca interrompeu', () => {
    // 7 dos 10 encontros da temporada são assim: enxurrada de cast inimigo,
    // zero deles interrompível. Contar tudo acusaria o raide de deixar
    // passar 83 interrupts numa luta onde existiam zero.
    const porPessoa = buildOportunidadeDeInterrupt(
      [{ fight: 1, abilityGameID: 111, casts: 80 }],
      [],
      new Map([[1, new Set([10])]]),
      interrompiveis
    );

    expect(porPessoa.has(10)).toBe(false);
  });

  it('separa o que foi seu do que o raide cobriu', () => {
    const porPessoa = buildOportunidadeDeInterrupt(
      [{ fight: 1, abilityGameID: 999, casts: 4 }],
      [
        { sourceID: 10, fight: 1, extraAbilityGameID: 999 },
        { sourceID: 20, fight: 1, extraAbilityGameID: 999 },
        { sourceID: 20, fight: 1, extraAbilityGameID: 999 },
      ],
      new Map([[1, new Set([10, 20, 30])]]),
      interrompiveis
    );

    expect(porPessoa.get(10)).toMatchObject({ oportunidades: 4, cobertosPeloRaide: 3, seus: 1 });
    expect(porPessoa.get(20)).toMatchObject({ seus: 2 });
    // Quem não interrompeu nada continua tendo a oportunidade contada: é o
    // que permite dizer que o raide cobriu sem acusar a pessoa.
    expect(porPessoa.get(30)).toMatchObject({ oportunidades: 4, seus: 0 });
  });

  it('nunca reporta cobertura acima do que existia', () => {
    // Numa try com 1 alvo e 5 kicks, quatro pegaram algo que o denominador
    // não conhece. Cobertura de 500% seria um número que ninguém acredita.
    const porPessoa = buildOportunidadeDeInterrupt(
      [{ fight: 1, abilityGameID: 999, casts: 1 }],
      Array.from({ length: 5 }, () => ({ sourceID: 10, fight: 1, extraAbilityGameID: 999 })),
      new Map([[1, new Set([10])]]),
      interrompiveis
    );

    expect(porPessoa.get(10)?.cobertosPeloRaide).toBe(1);
  });

  it('conta quantas pessoas dividem o trabalho', () => {
    const porPessoa = buildOportunidadeDeInterrupt(
      [{ fight: 1, abilityGameID: 999, casts: 9 }],
      [
        { sourceID: 10, fight: 1, extraAbilityGameID: 999 },
        { sourceID: 20, fight: 1, extraAbilityGameID: 999 },
      ],
      new Map([[1, new Set([10, 20, 30])]]),
      interrompiveis
    );

    expect(porPessoa.get(30)?.pessoasQueInterromperam).toBe(2);
  });

  it('soma através das trys da noite', () => {
    const porPessoa = buildOportunidadeDeInterrupt(
      [
        { fight: 1, abilityGameID: 999, casts: 3 },
        { fight: 2, abilityGameID: 999, casts: 2 },
      ],
      [],
      new Map([
        [1, new Set([10])],
        [2, new Set([10])],
      ]),
      interrompiveis
    );

    expect(porPessoa.get(10)?.oportunidades).toBe(5);
  });
});
