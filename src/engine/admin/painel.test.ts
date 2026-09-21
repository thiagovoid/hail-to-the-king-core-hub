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
  personagemDaUltimaNoite: "nerlock",
  simCalculadoEm: "2026-09-16T08:00:00.000Z",
  coberturaDeCura: null,
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

/** Fixo pra idade do sim não mudar de valor conforme o dia em que o teste roda. */
const AGORA = new Date("2026-09-21T12:00:00.000Z");

const painel = (l: LinhaDoMacro = linha) =>
  montarPainel({ linhas: [l], roster: [{ id: "nerlock", name: "Nerlock" }], metas, agora: AGORA });

describe("montarPainel", () => {
  describe("coluna do sim", () => {
    it("conta os dias desde o cálculo do sim", () => {
      expect(painel()).toContain(">5d<");
    });

    it("marca quem passou do prazo do cron semanal", () => {
      // O cron roda 1x por semana: 19 dias quer dizer duas execuções puladas,
      // e a régua do Entregar (peso 50 no dps) já não vale nada.
      const html = painel({ ...linha, simCalculadoEm: "2026-09-02T08:00:00.000Z" });

      expect(html).toContain(">19d<");
      expect(html).toMatch(/text-red-400[^>]*>19d</);
    });

    it("diz 'nunca' em vez de fingir uma data", () => {
      const html = painel({ ...linha, simCalculadoEm: null });

      expect(html).toContain(">nunca<");
      expect(html).toContain("nunca foi simulado");
    });

    /**
     * O Quick Sim da Armory mede a spec de DANO do personagem, que não é o
     * jogo que um healer jogou na noite. Mostrar a idade ali convidaria a
     * re-simular pra consertar um número que ninguém usa — Entregar tem peso
     * zero pra healer.
     */
    it("não mostra idade de sim pra healer", () => {
      const html = painel({
        ...linha,
        funcao: "healer",
        simCalculadoEm: "2026-09-02T08:00:00.000Z",
      });

      expect(html).not.toContain(">19d<");
      expect(html).toContain("Healer não usa sim");
    });
  });

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

  /**
   * A nota de Curar é o QUINHÃO, que é a cobertura dividida pela média dos
   * healers da noite. Duas noites da Cowsadeer provam por que os dois números
   * precisam andar juntos: cobertura 25,7% e 25,9%, notas 98,5 e 86,8 — ela
   * cobriu o mesmo e caiu 12 pontos porque os colegas subiram.
   */
  it("mostra a cobertura embaixo da nota de Curar", () => {
    const html = painel({
      ...linha,
      funcao: "healer",
      dimensoes: [{ chave: "healing", rotulo: "Curar", nota: 87, cumpriu: true }],
      coberturaDeCura: 25.9,
    });

    expect(html).toContain("25,9% do dano");
  });

  it("não inventa cobertura pra quem não é healer", () => {
    expect(painel()).not.toContain("% do dano");
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
