import { describe, expect, it } from "vitest";

import { avaliarComp, avaliarComps, COMP_DO_NIVEL, type PessoaNaComp } from "./comp";
import type { FuncaoDaProntidao, NivelDeConteudo } from "../scores/prontidao";

/** N pessoas de uma função só, todas no mesmo nível. */
const gente = (
  quantidade: number,
  funcao: FuncaoDaProntidao,
  nivel: NivelDeConteudo | null
): PessoaNaComp[] =>
  Array.from({ length: quantidade }, (_, i) => ({
    id: `${funcao}-${i}-${nivel}`,
    papeis: [{ funcao, nivel }],
  }));

/** Um core de 20 com tudo fechado no nível pedido. */
const coreDe20 = (nivel: NivelDeConteudo | null): PessoaNaComp[] => [
  ...gente(2, "tank", nivel),
  ...gente(4, "healer", nivel),
  ...gente(14, "dps", nivel),
];

describe("avaliarComp", () => {
  it("fecha quando tamanho, formação e nível batem", () => {
    const comp = avaliarComp(coreDe20("mitico"), "mitico");

    expect(comp.fecha).toBe(true);
    expect(comp.falta).toEqual([]);
  });

  /**
   * O mítico trava em 20 exatas. Um raide de 19 impecáveis não entra — e o
   * painel tem que dizer isso, porque é a única falta que treino nenhum
   * resolve.
   */
  it("reprova 19 pessoas no mítico, por melhores que sejam", () => {
    const comp = avaliarComp(coreDe20("mitico").slice(0, 19), "mitico");

    expect(comp.fecha).toBe(false);
    expect(comp.formacaoFecha).toBe(false);
    expect(comp.falta[0]).toContain("não flexiona");
  });

  it("não cobra tamanho exato no normal e no heroico, que são flex", () => {
    const comp = avaliarComp(coreDe20("heroico").slice(0, 19), "heroico");

    expect(comp.formacaoFecha).toBe(true);
    expect(comp.fecha).toBe(true);
  });

  /**
   * Separar as duas faltas é o ponto do arquivo: faltar gente é
   * recrutamento, faltar nível é treino. Uma resposta só não diria qual.
   */
  it("distingue falta de gente de falta de nível", () => {
    const semNivel = avaliarComp(coreDe20("normal"), "mitico");

    expect(semNivel.formacaoFecha).toBe(true);
    expect(semNivel.fecha).toBe(false);
    expect(semNivel.falta.every((f) => f.includes("régua"))).toBe(true);
  });

  it("conta como pronto quem está ACIMA do nível pedido", () => {
    const comp = avaliarComp(coreDe20("mitico"), "normal");

    expect(comp.pessoasProntas).toBe(20);
    expect(comp.fecha).toBe(true);
  });

  it("não conta quem não fecha nível nenhum", () => {
    const comp = avaliarComp(coreDe20(null), "normal");

    expect(comp.pessoasProntas).toBe(0);
    expect(comp.pessoas).toBe(20);
  });

  it("aponta a função que falta, não só um total", () => {
    const semHealer = [...gente(2, "tank", "normal"), ...gente(16, "dps", "normal")];
    const comp = avaliarComp(semHealer, "normal");

    expect(comp.falta.some((f) => f.includes("healer"))).toBe(true);
    expect(comp.falta.some((f) => f.includes("tank"))).toBe(false);
  });
});

/**
 * "Na ausência de alguém podemos trocar de cadeira pra compor" — a Ligiaf
 * cobriu healer quando o tank saiu. Um modelo de função única apagaria
 * exatamente quem trocou pra ajudar.
 */
describe("quem troca de cadeira", () => {
  const flexivel = (id: string, papeis: Array<[FuncaoDaProntidao, NivelDeConteudo | null]>) => ({
    id,
    papeis: papeis.map(([funcao, nivel]) => ({ funcao, nivel })),
  });

  it("deixa o dps com alt de tank preencher a cadeira de tank", () => {
    const core = [
      flexivel("voidwar", [
        ["dps", "normal"],
        ["tank", "normal"],
      ]),
      ...gente(1, "tank", "normal"),
      ...gente(2, "healer", "normal"),
      ...gente(7, "dps", "normal"),
    ];

    expect(avaliarComp(core, "normal").fecha).toBe(true);
  });

  /**
   * Quem sabe tankar E curar não pode ocupar as duas cadeiras ao mesmo
   * tempo. Contando função por função, o raide apareceria completo com uma
   * pessoa a menos sentada.
   */
  it("não deixa a mesma pessoa ocupar duas cadeiras de uma vez", () => {
    const core = [
      flexivel("curinga", [
        ["tank", "normal"],
        ["healer", "normal"],
      ]),
      ...gente(1, "tank", "normal"),
      ...gente(1, "healer", "normal"),
      ...gente(7, "dps", "normal"),
    ];

    // Contando por função dá 2 tanks e 2 healers. Mas são 3 pessoas pra 4
    // cadeiras: falta uma.
    const comp = avaliarComp(core, "normal");
    expect(comp.disponivel.tank).toBe(2);
    expect(comp.disponivel.healer).toBe(2);
    expect(comp.fecha).toBe(false);
    expect(comp.falta.some((f) => f.includes("pessoa"))).toBe(true);
  });

  /** O nível é do PAPEL: um tank pronto não torna o healer dela pronto. */
  it("cobra o nível da cadeira que a pessoa vai ocupar", () => {
    const core = [
      flexivel("meio-pronto", [
        ["tank", "heroico"],
        ["healer", null],
      ]),
      ...gente(1, "tank", "heroico"),
      ...gente(3, "healer", "heroico"),
      ...gente(7, "dps", "heroico"),
    ];

    // Ela fecha a cadeira de tank, que já está cheia; de healer, não fecha.
    const comp = avaliarComp(core, "heroico");
    expect(comp.pronto.tank).toBe(2);
    expect(comp.pronto.healer).toBe(3);
    expect(comp.fecha).toBe(true);
  });
});

describe("avaliarComps", () => {
  it("devolve os três níveis na ordem da régua", () => {
    expect(avaliarComps(coreDe20("normal")).map((c) => c.nivel)).toEqual([
      "normal",
      "heroico",
      "mitico",
    ]);
  });

  it("exige mais a cada degrau", () => {
    expect(COMP_DO_NIVEL.normal.healers).toBeLessThanOrEqual(COMP_DO_NIVEL.heroico.healers);
    expect(COMP_DO_NIVEL.heroico.healers).toBeLessThanOrEqual(COMP_DO_NIVEL.mitico.healers);
    expect(COMP_DO_NIVEL.mitico.tamanhoFixo).toBe(true);
    expect(COMP_DO_NIVEL.heroico.tamanhoFixo).toBe(false);
  });
});
