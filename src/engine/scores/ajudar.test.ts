import { describe, expect, it } from "vitest";

import {
  notaDeInterromper,
  notaDeAjudar,
  TETO_DE_APROVEITAMENTO,
  TETO_PADRAO,
} from "./ajudar";

const magia = (spellId: number, efficiency: number) => ({
  spellId,
  name: `magia ${spellId}`,
  casts: 1,
  efficiency,
  categoria: "controlar" as const,
});

/** Kick (Pummel, teto 1,2) e Power Infusion (teto 95,3). */
const PUMMEL = 6552;
const POWER_INFUSION = 10060;

describe("notaDeAjudar", () => {
  it("é null sem utilidade medida — ausente, não zero", () => {
    expect(notaDeAjudar(undefined)).toBeNull();
    expect(notaDeAjudar(undefined, undefined, undefined)).toBeNull();
    expect(notaDeAjudar([])).toBeNull();
  });

  /**
   * O ponto inteiro da dimensão. Na régua crua, 1,2% e 95,3% seriam notas
   * abissalmente diferentes; normalizados pelo teto de cada magia, os dois
   * tiraram 100 — porque os dois tiraram da ferramenta tudo que ela dá.
   */
  it("não pune quem tem cooldown curto", () => {
    const kick = notaDeAjudar([magia(PUMMEL, TETO_DE_APROVEITAMENTO.get(PUMMEL)!)]);
    const lust = notaDeAjudar([magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)!)]);

    expect(kick).toBe(100);
    expect(lust).toBe(100);
  });

  it("dá metade da nota a metade do teto", () => {
    expect(notaDeAjudar([magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)! / 2)])).toBe(50);
  });

  it("nunca passa de 100, mesmo batendo o teto", () => {
    expect(notaDeAjudar([magia(PUMMEL, 999)])).toBe(100);
  });

  it("faz média das magias que a pessoa tem", () => {
    const nota = notaDeAjudar([
      magia(POWER_INFUSION, TETO_DE_APROVEITAMENTO.get(POWER_INFUSION)!),
      magia(PUMMEL, 0),
    ]);

    expect(nota).toBe(50);
  });

  /** Magia nova entra numa régua plausível em vez de 100 de graça ou zero. */
  it("usa o teto padrão pra magia sem histórico", () => {
    expect(notaDeAjudar([magia(999_999, TETO_PADRAO)])).toBe(100);
    expect(notaDeAjudar([magia(999_999, TETO_PADRAO / 2)])).toBe(50);
  });

  /**
   * Os tetos saem do melhor já visto na temporada — se um deles fosse zero,
   * a divisão viraria Infinity na nota de alguém.
   */
  it("tem teto positivo em todas as magias da tabela", () => {
    for (const [spellId, teto] of TETO_DE_APROVEITAMENTO) {
      expect(teto, `magia ${spellId}`).toBeGreaterThan(0);
    }
  });
});

/**
 * Interromper é dever de TIME, não de pessoa.
 *
 * O raide cobre 87% das oportunidades em luta de boss, mas onze pessoas
 * dividem isso de forma muito desigual e o log não diz quem era o designado.
 * Punir o indivíduo por uma falha que pode não ser dele seria acusar sem
 * laudo, então interromper só soma.
 *
 * A régua velha dividia por TRYS — cada try valia uma oportunidade,
 * existisse alvo ou não. Sete dos dez encontros da temporada não têm uma
 * única magia interrompível.
 */
describe("interromper credita, nunca pune", () => {
  const trys = { present: 10, total: 10, lateStart: false, earlyExit: false, idle: 0, topDamageDead: 0 };

  const util = (
    interrupts: number,
    interrupcoes?: {
      oportunidades: number;
      cobertosPeloRaide: number;
      seus: number;
      pessoasQueInterromperam: number;
    }
  ) => ({
    interrupts,
    dispels: 0,
    purges: 0,
    battleRez: 0,
    battleRezRecebidos: 0,
    ...(interrupcoes && { interrupcoes }),
  });

  const base = [
    { spellId: 10060, name: "Power Infusion", casts: 5, efficiency: 5, categoria: "acelerar" as const },
  ];

  it("não tira nota de quem não interrompeu", () => {
    expect(notaDeAjudar(base, util(0), trys)).toBe(notaDeAjudar(base, undefined, trys));
  });

  it("apertar o kick uma vez nunca piora a nota", () => {
    // A armadilha da régua velha por outro caminho: como parcela da média,
    // uma participação pequena PUXAVA a nota pra baixo, e quem nunca
    // apertava escapava de ser medido.
    const nenhum = notaDeAjudar(base, util(0), trys)!;
    const uma = notaDeAjudar(
      base,
      util(1, { oportunidades: 50, cobertosPeloRaide: 44, seus: 1, pessoasQueInterromperam: 11 }),
      trys
    )!;

    expect(uma).toBeGreaterThanOrEqual(nenhum);
  });

  it("cumprir a parte igual vale a nota cheia", () => {
    // Onze pessoas dividindo 55 oportunidades: a parte de cada uma é 5.
    const naParte = notaDeAjudar(
      base,
      util(5, { oportunidades: 55, cobertosPeloRaide: 50, seus: 5, pessoasQueInterromperam: 11 }),
      trys
    )!;

    expect(naParte).toBe(100);
  });

  it("fazer muito além da parte não rende mais que o teto", () => {
    // O trabalho já estava coberto; passar por cima dele não é mérito extra.
    const cheio = notaDeAjudar(
      base,
      util(5, { oportunidades: 55, cobertosPeloRaide: 50, seus: 5, pessoasQueInterromperam: 11 }),
      trys
    )!;
    const exagero = notaDeAjudar(
      base,
      util(40, { oportunidades: 55, cobertosPeloRaide: 50, seus: 40, pessoasQueInterromperam: 11 }),
      trys
    )!;

    expect(exagero).toBe(cheio);
  });

  it("noite sem nada interrompível não mexe na nota", () => {
    // Sete dos dez encontros da temporada. A régua velha cobrava aqui.
    const semOportunidade = notaDeAjudar(
      base,
      util(0, { oportunidades: 0, cobertosPeloRaide: 0, seus: 0, pessoasQueInterromperam: 0 }),
      trys
    );

    expect(semOportunidade).toBe(notaDeAjudar(base, util(0), trys));
  });

  it("quem só interrompe fica NULO, não fica com nota baixa", () => {
    /**
     * A armadilha que quase foi publicada: deixar o bônus virar a nota
     * quando não há base daria Ajudar 15 pra quem apertou o kick — punição
     * vestida de crédito. São 24 das 113 noites-jogador da temporada.
     *
     * Nulo faz a dimensão sair da média ponderada e o peso se redistribuir,
     * em vez de a pessoa carregar um número baixo por algo que não temos
     * como medir nela.
     */
    const soKick = [
      { spellId: 96231, name: "Rebuke", casts: 2, efficiency: 0.9, categoria: "interromper" as const },
    ];

    expect(
      notaDeAjudar(
        soKick,
        util(34, { oportunidades: 50, cobertosPeloRaide: 44, seus: 34, pessoasQueInterromperam: 11 }),
        trys
      )
    ).toBeNull();
  });

  /** A magia de interromper sai da conta de recarga pra não contar duas vezes. */
  it("não conta a mesma interrupção duas vezes", () => {
    const comKick = [
      ...base,
      { spellId: 96231, name: "Rebuke", casts: 2, efficiency: 0.9, categoria: "interromper" as const },
    ];

    // A eficiência 0,9 do Rebuke não entra puxando a média pra baixo.
    expect(notaDeAjudar(comKick, util(0), trys)).toBe(notaDeAjudar(base, util(0), trys));
  });
});
