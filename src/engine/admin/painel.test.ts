import { describe, expect, it } from "vitest";

import { montarPainel } from "./painel";
import type { LinhaDoMacro } from "./visaoMacro";

const linha: LinhaDoMacro = {
  id: "nerlock",
  nome: "Nerlock",
  funcao: "dps",
  alts: [],
  noites: 7,
  presenca: 88,
  ultimaNoite: "2026-09-16",
  score: 57,
  scoreMedio: 55,
  dimensoes: [
    { chave: "mechanics", rotulo: "Mecânicas", nota: 78, cumpriu: false },
    { chave: "deliver", rotulo: "Entregar", nota: 58, cumpriu: false },
  ],
  faltando: ["Mecânicas", "Entregar"],
};

const metas = {
  mechanics: { target: 1.4 },
  deliver: { target: 75, porFuncao: { dps: 75, healer: 75, tank: 57 } },
  defense: { target: 28, porFuncao: { dps: 28, healer: 40, tank: 70 } },
  healing: { target: 82 },
  attack: { target: 90 },
};

const painel = () =>
  montarPainel({ linhas: [linha], roster: [{ id: "nerlock", name: "Nerlock" }], metas });

describe("montarPainel", () => {
  /**
   * O defeito que gerou este teste: o `<th>` é `whitespace-nowrap` pro rótulo
   * da coluna não quebrar, e isso DESCE pro tooltip. Sem desfazer ali dentro,
   * a frase do Score virava uma linha só de 670px numa caixa de 286 e vazava
   * pela direita da caixa.
   */
  it("desfaz o nowrap do cabeçalho dentro de cada tooltip", () => {
    const tooltips = painel().match(/<span role="tooltip"[^>]*>/g) ?? [];

    expect(tooltips.length).toBeGreaterThan(0);
    for (const tooltip of tooltips) {
      expect(tooltip, tooltip).toContain("whitespace-normal");
    }
  });

  /**
   * Abrir pra cima sairia do container, que é `overflow-x-auto` pras 12
   * colunas rolarem — e basta um eixo deixar de ser `visible` pro outro
   * virar `auto` e cortar.
   */
  it("abre os tooltips pra baixo, não pra cima", () => {
    const tooltips = painel().match(/<span role="tooltip"[^>]*>/g) ?? [];

    for (const tooltip of tooltips) {
      expect(tooltip, tooltip).toContain("top-full");
      expect(tooltip, tooltip).not.toContain("bottom-full");
    }
  });

  it("tira a meta do arquivo da temporada, não de número escrito à mão", () => {
    // É pra calibrar que o tooltip existe: meta fixa no texto mentiria no dia
    // seguinte ao primeiro ajuste da régua.
    const html = painel();

    expect(html).toContain("1,4");
    expect(html).toContain("dps 75% · healer 75% · tank 57%");

    const comOutraMeta = montarPainel({
      linhas: [linha],
      roster: [{ id: "nerlock", name: "Nerlock" }],
      metas: { ...metas, mechanics: { target: 1.1 } },
    });

    expect(comOutraMeta).toContain("1,1");
    expect(comOutraMeta).not.toContain("1,4");
  });
});
