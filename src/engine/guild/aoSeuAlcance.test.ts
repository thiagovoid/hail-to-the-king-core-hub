import { describe, expect, it } from "vitest";

import { aoSeuAlcance } from "./aoSeuAlcance";
import { CORTE } from "./conquistas";
import type { PlayerPerformance } from "../../types/performance";

const noite = (p: Partial<PlayerPerformance>): PlayerPerformance => ({
  playerId: "a",
  deaths: 7,
  ...p,
});

const TEMPORADA = [
  noite({ parse: 61, preparation: 57, deaths: 4, mechanics: { errors: 2.1, tries: 12 } }),
  noite({ parse: 84, preparation: 71, deaths: 9, mechanics: { errors: 1.3, tries: 14 } }),
];

const semNada = new Set<string>();

describe("aoSeuAlcance", () => {
  it("devolve no máximo três", () => {
    expect(aoSeuAlcance(TEMPORADA, semNada).length).toBeLessThanOrEqual(3);
  });

  it("ordena da mais perto pra menos", () => {
    const perto = aoSeuAlcance(TEMPORADA, semNada);

    for (let i = 1; i < perto.length; i++) {
      expect(perto[i - 1].progresso).toBeGreaterThanOrEqual(perto[i].progresso);
    }
  });

  /** Ela já está na estante, com o número de vezes. Repetir seria ruído. */
  it("não repete conquista já ganha", () => {
    const comLenda = aoSeuAlcance(TEMPORADA, new Set(["lenda"]));

    expect(comLenda.map((c) => c.conquista.id)).not.toContain("lenda");
  });

  it("usa o MELHOR da temporada, não a última noite", () => {
    const lenda = aoSeuAlcance(TEMPORADA, semNada).find((c) => c.conquista.id === "lenda");

    // 84 é o melhor parse das duas noites; a última tem 84, a primeira 61.
    expect(lenda?.atual).toBe(84);
    expect(lenda?.alvo).toBe(CORTE.lenda);
    expect(lenda?.falta).toBe("faltam 6 de parse");
  });

  it("inverte a conta nas métricas em que menos é melhor", () => {
    const limpa = aoSeuAlcance(TEMPORADA, semNada).find((c) => c.conquista.id === "noite-limpa");

    // A melhor noite teve 4 mortes, e o alvo é zero.
    expect(limpa?.atual).toBe(4);
    expect(limpa?.falta).toContain("4 mortes a menos");
  });

  /** Prometer "faltam X" com X desconhecido é pior que não dizer nada. */
  it("deixa de fora o critério sem dado coletado", () => {
    const semCura = aoSeuAlcance(TEMPORADA, semNada);

    expect(semCura.map((c) => c.conquista.id)).not.toContain("sem-sobra");
  });

  it("deixa de fora quem já cumpriu o número mas não tem a medalha", () => {
    // Nota 66 de Defender passa do corte de Muralha (50), mas a medalha é só
    // de tank — quem não é tank não pode ver uma barra cheia que não cai.
    const comDefesa = [noite({ defense: { score: 66, mitigation: 40, dtps: 3_000 } })];

    expect(aoSeuAlcance(comDefesa, semNada).map((c) => c.conquista.id)).not.toContain("muralha");
  });

  it("devolve lista vazia quando não há noite nenhuma", () => {
    expect(aoSeuAlcance([], semNada)).toEqual([]);
  });

  /**
   * As disputadas dependem de quem mais apareceu na terça. Pôr isso numa
   * barra de progresso seria colocar o core pra competir entre si numa tela
   * que é da pessoa.
   */
  it("nunca sugere conquista disputada", () => {
    const sugeridas = aoSeuAlcance(TEMPORADA, semNada);

    expect(sugeridas.every((c) => !c.conquista.disputada)).toBe(true);
  });

  it("nunca sugere zoeira", () => {
    const sugeridas = aoSeuAlcance(TEMPORADA, semNada);

    expect(sugeridas.every((c) => c.conquista.tipo === "boa")).toBe(true);
  });

  it("mantém o progresso entre 0 e 100", () => {
    const extremos = [noite({ parse: 0, preparation: 0, deaths: 90 })];

    for (const c of aoSeuAlcance(extremos, semNada)) {
      expect(c.progresso).toBeGreaterThanOrEqual(0);
      expect(c.progresso).toBeLessThanOrEqual(100);
    }
  });
});
