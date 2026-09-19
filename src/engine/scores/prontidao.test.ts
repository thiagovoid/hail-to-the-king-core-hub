import { describe, expect, it } from "vitest";

import {
  avaliarNivel,
  avaliarProntidao,
  EXIGENCIA,
  type MediasDoJogador,
  CRITERIO_DO_OFICIO,
  ROTULO_DO_OFICIO,
  degrausDaMetrica,
} from "./prontidao";

/** Alguém que fecha o heroico com folga, mas não o mítico. */
const HEROICO: MediasDoJogador = {
  parse: 60,
  mechanics: 1.5,
  deathShare: 8,
  preparation: 75,
  io: 3100,
  oficio: 88,
};

describe("avaliarProntidao", () => {
  it("coloca no maior nível em que tudo fecha", () => {
    expect(avaliarProntidao(HEROICO, "dps").nivel).toBe("heroico");
    expect(avaliarProntidao(HEROICO, "dps").proximo).toBe("mitico");
  });

  it("devolve null pra quem não fecha nem o normal", () => {
    const fraco: MediasDoJogador = {
      parse: 15,
      mechanics: 3,
      deathShare: 30,
      preparation: 40,
      io: 2000,
      oficio: 50,
    };

    const r = avaliarProntidao(fraco, "dps");
    expect(r.nivel).toBeNull();
    expect(r.proximo).toBe("normal");
  });

  it("não tem próximo quando já está no topo", () => {
    const mitico: MediasDoJogador = {
      parse: 80,
      mechanics: 1,
      deathShare: 3,
      preparation: 90,
      io: 3500,
      oficio: 95,
    };

    expect(avaliarProntidao(mitico, "dps").nivel).toBe("mitico");
    expect(avaliarProntidao(mitico, "dps").proximo).toBeNull();
    expect(avaliarProntidao(mitico, "dps").falta).toEqual([]);
  });

  // "O cara que está no limiar da normal não enxerga a mítica."
  it("só mostra o degrau seguinte, nunca dois à frente", () => {
    const r = avaliarProntidao({ ...HEROICO, parse: 40, oficio: 80 }, "dps");

    expect(r.nivel).toBe("normal");
    expect(r.proximo).toBe("heroico");
    // Os critérios listados são os do heroico, não os do mítico.
    expect(r.criterios.find((c) => c.chave === "parse")?.exigido).toBe(EXIGENCIA.heroico.parse);
  });

  it("aponta só o que falta, não a lista inteira", () => {
    const r = avaliarProntidao({ ...HEROICO, parse: 20 }, "dps");

    expect(r.falta.map((c) => c.chave)).toEqual(["parse"]);
    expect(r.criterios.length).toBeGreaterThan(r.falta.length);
  });

  /**
   * Mesma regra do Score: a lacuna é nossa, não do jogador. Quem ainda não
   * tem sim medido não pode ficar preso no normal por causa disso.
   */
  it("não bloqueia por critério sem dado", () => {
    const semDado: MediasDoJogador = {
      parse: 60,
      mechanics: 1.5,
      deathShare: 8,
      preparation: 75,
      io: null,
      oficio: null,
    };

    expect(avaliarProntidao(semDado, "dps").nivel).toBe("heroico");
  });

  it("cobra o percentual do sim de cada nível", () => {
    // Tudo em dia de raide, mas entregando 50% do próprio potencial.
    const r = avaliarProntidao({ ...HEROICO, oficio: 50 }, "dps");
    expect(r.nivel).toBeNull();

    const noCorte = avaliarProntidao({ ...HEROICO, oficio: CRITERIO_DO_OFICIO.dps.normal }, "dps");
    expect(noCorte.nivel).toBe("normal");
  });
});

describe("os critérios", () => {
  it("inverte a comparação nas métricas em que menos é melhor", () => {
    const criterios = avaliarNivel(
      { parse: 60, mechanics: 5, deathShare: 2, preparation: 75, io: 3100, oficio: 90 },
      "heroico"
    );

    // 5 erros por try não cumpre um máximo de 1,8.
    expect(criterios.find((c) => c.chave === "mechanics")?.cumpre).toBe(false);
    // 2% de tempo morto cumpre um máximo de 10%.
    expect(criterios.find((c) => c.chave === "deathShare")?.cumpre).toBe(true);
  });

  /**
   * Raider.IO mede Mythic+, não raide. O dado do core mostra onde erra: a
   * Ligiaf tem IO 1939 e parse 47; o Dagom tem IO 2446 e parse 15.
   */
  it("não deixa o Raider.IO sozinho decidir o nível", () => {
    const ioAlto = avaliarProntidao({
      parse: 15,
      mechanics: 3,
      deathShare: 30,
      preparation: 40,
      io: 3500,
      oficio: 95,
    }, "dps");
    const ioBaixo = avaliarProntidao({
      parse: 60,
      mechanics: 1.5,
      deathShare: 8,
      preparation: 75,
      io: 1900,
      oficio: 88,
    }, "dps");

    // IO 3500 não compra prontidão de raide nenhuma.
    expect(ioAlto.nivel).toBeNull();
    expect(ioAlto.perfilDeChave).toBe("mitico");

    // E IO 1900 não impede quem joga bem a raide.
    expect(ioBaixo.nivel).toBe("heroico");
    expect(ioBaixo.perfilDeChave).toBeNull();
  });

  it("exige mais a cada degrau", () => {
    expect(EXIGENCIA.normal.parse).toBeLessThan(EXIGENCIA.heroico.parse);
    expect(EXIGENCIA.heroico.parse).toBeLessThan(EXIGENCIA.mitico.parse);
    // Nas de "menos é melhor" a exigência aperta ao contrário.
    expect(EXIGENCIA.normal.deathShare).toBeGreaterThan(EXIGENCIA.mitico.deathShare);
    expect(CRITERIO_DO_OFICIO.dps.normal).toBeLessThan(CRITERIO_DO_OFICIO.dps.mitico);
  });
});

describe("a régua é do ofício, não do dps", () => {
  const tankBom = {
    // Parse 60 fecha o heroico (55). Parse é percentil contra a MESMA spec,
    // então tank compara com tank — aqui não há viés de função.
    parse: 60,
    mechanics: 1.5,
    deathShare: 5,
    preparation: 75,
    io: 3100,
    // Nota de Defender 50: bom tank. Como % de sim seria reprovado em tudo.
    oficio: 50,
  };

  /**
   * Medido com os sims frescos: os tanks travam em 69%, 68% e 63% do sim,
   * porque um Paladino de Proteção não atinge o sim de boneco parado — ele
   * está tankando. Uma barra de 75% excluiria os três PARA SEMPRE.
   */
  it("não mede tank pela régua de dps", () => {
    expect(avaliarProntidao(tankBom, "tank").nivel).toBe("heroico");
    // O MESMO número lido como % de sim não passa nem do normal.
    expect(avaliarProntidao(tankBom, "dps").nivel).toBeNull();
  });

  it("mede healer por Curar", () => {
    const healer = { ...tankBom, oficio: 84 };

    expect(avaliarProntidao(healer, "healer").nivel).toBe("heroico");
    expect(ROTULO_DO_OFICIO.healer).toBe("Curar");
  });

  it("nomeia o critério do ofício na lista do próximo degrau", () => {
    const r = avaliarProntidao(tankBom, "tank");
    const oficio = r.criterios.find((c) => c.chave === "oficio");

    expect(oficio?.rotulo).toBe("Defender");
    expect(oficio?.exigido).toBe(CRITERIO_DO_OFICIO.tank.mitico);
  });
});

describe("as linhas do gráfico", () => {
  // "O cara que está no limiar da normal não enxerga a mítica."
  it("desenha o piso e o degrau seguinte, nunca dois à frente", () => {
    const degraus = degrausDaMetrica(
      { nivel: "normal", proximo: "heroico" },
      (nivel) => EXIGENCIA[nivel].parse
    );

    expect(degraus.map((d) => d.nivel)).toEqual(["normal", "heroico"]);
    expect(degraus.find((d) => d.atual)?.valor).toBe(EXIGENCIA.normal.parse);
  });

  it("não desenha piso pra quem ainda não fecha nenhum nível", () => {
    const degraus = degrausDaMetrica(
      { nivel: null, proximo: "normal" },
      (nivel) => EXIGENCIA[nivel].parse
    );

    expect(degraus).toHaveLength(1);
    expect(degraus[0]).toMatchObject({ nivel: "normal", atual: false });
  });

  it("não desenha degrau seguinte pra quem já está no topo", () => {
    const degraus = degrausDaMetrica(
      { nivel: "mitico", proximo: null },
      (nivel) => EXIGENCIA[nivel].parse
    );

    expect(degraus).toEqual([{ nivel: "mitico", valor: EXIGENCIA.mitico.parse, atual: true }]);
  });

  /** Cada métrica lê a sua régua: dps é uma fração do próprio sim. */
  it("aceita uma régua que não vem de EXIGENCIA", () => {
    const sim = 1_000_000;
    const degraus = degrausDaMetrica({ nivel: "normal", proximo: "heroico" }, (nivel) =>
      Math.round((CRITERIO_DO_OFICIO.dps[nivel] / 100) * sim)
    );

    expect(degraus[1].valor).toBe(750_000);
  });
});
