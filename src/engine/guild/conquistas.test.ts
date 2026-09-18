import { describe, expect, it } from "vitest";

import { CONQUISTAS, contarConquistas } from "./conquistas";
import type { CorePerformanceTargets } from "../../types/index";
import type { WeeklyPerformance } from "../../types/performance";

const TARGETS: CorePerformanceTargets = {
  parse: { target: 60, direction: "higher" },
  mechanics: { target: 2, direction: "lower" },
  attack: { target: 70, direction: "higher" },
  defense: { target: 30, direction: "higher" },
  healing: { target: 80, direction: "higher" },
  preparation: { target: 60, direction: "higher" },
};

const semana = (date: string, players: WeeklyPerformance["runs"][number]["players"]): WeeklyPerformance => ({
  week: 1,
  runs: [{ date, players }],
});

const quantas = (weeks: WeeklyPerformance[], playerId: string, conquista: string) =>
  contarConquistas(weeks, TARGETS).get(playerId)?.get(conquista)?.vezes ?? 0;

const detalheDe = (weeks: WeeklyPerformance[], playerId: string, conquista: string) =>
  contarConquistas(weeks, TARGETS).get(playerId)?.get(conquista)?.detalhe;

describe("contarConquistas", () => {
  it("acumula a mesma conquista ao longo das noites", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, dps: 100 },
        { playerId: "b", deaths: 1, dps: 50 },
      ]),
      semana("2026-09-03", [
        { playerId: "a", deaths: 1, dps: 90 },
        { playerId: "b", deaths: 1, dps: 40 },
      ]),
    ];

    expect(quantas(weeks, "a", "maior-dano")).toBe(2);
    expect(quantas(weeks, "b", "maior-dano")).toBe(0);
  });

  // Desempatar por ordem de array daria a medalha a quem por acaso aparece
  // primeiro no arquivo — e essa ordem muda sozinha quando a coleta roda.
  it("entrega a conquista disputada a todos os empatados", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, dps: 100 },
        { playerId: "b", deaths: 1, dps: 100 },
      ]),
    ];

    expect(quantas(weeks, "a", "maior-dano")).toBe(1);
    expect(quantas(weeks, "b", "maior-dano")).toBe(1);
  });

  // Não morrer não tira de ninguém: é cumprida, não disputada.
  it("dá a conquista cumprida a todo mundo que atingiu", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 0 },
        { playerId: "b", deaths: 0 },
        { playerId: "c", deaths: 3 },
      ]),
    ];

    expect(quantas(weeks, "a", "noite-limpa")).toBe(1);
    expect(quantas(weeks, "b", "noite-limpa")).toBe(1);
    expect(quantas(weeks, "c", "noite-limpa")).toBe(0);
  });

  it("não inventa vencedor quando ninguém tem o dado", () => {
    const weeks = [semana("2026-09-01", [{ playerId: "a", deaths: 1 }])];

    expect(quantas(weeks, "a", "maior-dano")).toBe(0);
    expect(quantas(weeks, "a", "maior-cura")).toBe(0);
  });

  it("dá a maior cura ao healer que cobriu mais dano do raide", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, healing: { score: 80, coverage: 25, share: 100, overheal: 20 } },
        { playerId: "b", deaths: 1, healing: { score: 90, coverage: 18, share: 80, overheal: 10 } },
      ]),
    ];

    // Cobertura, não nota: a conquista é de volume coberto.
    expect(quantas(weeks, "a", "maior-cura")).toBe(1);
    expect(quantas(weeks, "b", "maior-cura")).toBe(0);
  });

  it("dá MVP a quem teve o maior Score Geral", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, parse: 60 },
        { playerId: "b", deaths: 1, parse: 30 },
      ]),
    ];

    expect(quantas(weeks, "a", "mvp")).toBe(1);
    expect(quantas(weeks, "b", "mvp")).toBe(0);
  });

  it("não devolve nada pra jogador que não aparece em run nenhuma", () => {
    const weeks = [semana("2026-09-01", [{ playerId: "a", deaths: 0 }])];
    expect(contarConquistas(weeks, TARGETS).get("ninguem")).toBeUndefined();
  });

  it("toda conquista definida tem nome e texto de como obter", () => {
    for (const conquista of CONQUISTAS) {
      expect(conquista.nome.length).toBeGreaterThan(0);
      expect(conquista.como.length).toBeGreaterThan(0);
    }
  });

  // "Colecionador — Peçonha Sanguínea, em 11 de 12 trys" conta uma história
  // que "12 erros mecânicos" não conta.
  it("batiza a zoeira com a mecânica que mais pegou", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "a",
          deaths: 1,
          mechanics: { errors: 2, tries: 12 },
          mechanicsDetail: [
            { boss: "Sentinelas", mechanic: "Damage from Blood Venom", label: "Peçonha Sanguínea", tries: 11 },
            { boss: "Sentinelas", mechanic: "Damage from Toxic", label: "Gotículas", tries: 2 },
          ],
        },
      ]),
    ];

    expect(quantas(weeks, "a", "colecionador")).toBe(1);
    expect(detalheDe(weeks, "a", "colecionador")).toBe("Peçonha Sanguínea, em 11 de 12 trys");
  });

  // Abaixo de 70% das trys não é coleção, é azar.
  it("não dá Colecionador quando a mecânica pegou pouco", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "a",
          deaths: 1,
          mechanics: { errors: 1, tries: 12 },
          mechanicsDetail: [
            { boss: "Sentinelas", mechanic: "Damage from Blood Venom", label: "Peçonha", tries: 4 },
          ],
        },
      ]),
    ];

    expect(quantas(weeks, "a", "colecionador")).toBe(0);
  });

  it("separa mérito de zoeira", () => {
    const boas = CONQUISTAS.filter((c) => c.tipo === "boa");
    const zoeira = CONQUISTAS.filter((c) => c.tipo === "zoeira");

    expect(boas.length).toBeGreaterThan(0);
    expect(zoeira.length).toBeGreaterThan(0);
    expect(boas.length + zoeira.length).toBe(CONQUISTAS.length);
  });

  it("toda conquista tem id e símbolo únicos", () => {
    const ids = CONQUISTAS.map((c) => c.id);
    const simbolos = CONQUISTAS.map((c) => c.simbolo);

    expect(new Set(ids).size).toBe(ids.length);
    // Símbolo repetido faria duas medalhas diferentes lerem como a mesma na
    // estante — a arte é o que identifica, não o texto do tooltip.
    expect(new Set(simbolos).size).toBe(simbolos.length);
  });
});

describe("conquistas de uma noite só", () => {
  // Cada uma das três tem dono quase toda noite; é a interseção que ninguém
  // alcançou nas oito noites de temporada.
  it("só dá Tríplice coroa quando as três coisas acontecem juntas", () => {
    const comTudo = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, parse: 60, dps: 100, mechanics: { errors: 0, tries: 5 } },
        { playerId: "b", deaths: 1, parse: 10, dps: 50, mechanics: { errors: 3, tries: 5 } },
      ]),
    ];
    expect(quantas(comTudo, "a", "triplice-coroa")).toBe(1);

    const comErro = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, parse: 60, dps: 100, mechanics: { errors: 1, tries: 5 } },
        { playerId: "b", deaths: 1, parse: 10, dps: 50, mechanics: { errors: 3, tries: 5 } },
      ]),
    ];
    expect(quantas(comErro, "a", "mvp")).toBe(1);
    expect(quantas(comErro, "a", "maior-dano")).toBe(1);
    expect(quantas(comErro, "a", "triplice-coroa")).toBe(0);
  });

  it("exige as duas metades do Zero a zero", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "limpo", deaths: 0, mechanics: { errors: 0, tries: 5 } },
        { playerId: "morreu", deaths: 2, mechanics: { errors: 0, tries: 5 } },
        { playerId: "errou", deaths: 0, mechanics: { errors: 1, tries: 5 } },
      ]),
    ];

    expect(quantas(weeks, "limpo", "zero-a-zero")).toBe(1);
    expect(quantas(weeks, "morreu", "zero-a-zero")).toBe(0);
    expect(quantas(weeks, "errou", "zero-a-zero")).toBe(0);
  });

  it("dá Lenda a partir de parse 95 e diz qual foi", () => {
    const weeks = [
      semana("2026-09-01", [
        { playerId: "a", deaths: 1, parse: 96 },
        { playerId: "b", deaths: 1, parse: 94 },
      ]),
    ];

    expect(quantas(weeks, "a", "lenda")).toBe(1);
    expect(detalheDe(weeks, "a", "lenda")).toBe("parse 96");
    expect(quantas(weeks, "b", "lenda")).toBe(0);
  });

  // Nenhum dps jamais tomou mais dano que o tank mais leve da noite: a régua
  // é entre dps, senão a conquista nunca dispara.
  it("dá Tanque não oficial ao dps que mais tomou dano, ignorando os tanks", () => {
    const funcaoDe = (id: string) => (id === "tank" ? ("tank" as const) : ("dps" as const));
    const weeks = [
      semana("2026-09-01", [
        { playerId: "tank", deaths: 1, defense: { score: 40, mitigation: 45, dtps: 100_000 } },
        { playerId: "melee", deaths: 1, defense: { score: 20, mitigation: 40, dtps: 50_000 } },
        { playerId: "ranged", deaths: 1, defense: { score: 20, mitigation: 40, dtps: 10_000 } },
      ]),
    ];

    const apurado = contarConquistas(weeks, TARGETS, { funcaoDe });
    expect(apurado.get("melee")?.get("tanque-nao-oficial")?.vezes).toBe(1);
    expect(apurado.get("tank")?.get("tanque-nao-oficial")).toBeUndefined();
    expect(apurado.get("ranged")?.get("tanque-nao-oficial")).toBeUndefined();
  });

  it("guarda Muralha pros tanks", () => {
    const funcaoDe = (id: string) => (id === "tank" ? ("tank" as const) : ("dps" as const));
    const weeks = [
      semana("2026-09-01", [
        { playerId: "tank", deaths: 1, defense: { score: 53.7, mitigation: 45, dtps: 100_000 } },
        { playerId: "dps", deaths: 1, defense: { score: 60, mitigation: 40, dtps: 30_000 } },
      ]),
    ];

    const apurado = contarConquistas(weeks, TARGETS, { funcaoDe });
    expect(apurado.get("tank")?.get("muralha")?.vezes).toBe(1);
    expect(apurado.get("dps")?.get("muralha")).toBeUndefined();
  });

  it("separa quem não apertou defensivo nenhum de quem esqueceu só um", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "esqueceu-tudo",
          deaths: 1,
          defense: { score: 3.8, mitigation: 40, dtps: 20_000 },
          defenseDetail: [{ spellId: 1, name: "Barreira", casts: 1, efficiency: 3.8 }],
        },
        {
          playerId: "esqueceu-um",
          deaths: 1,
          defense: { score: 40, mitigation: 40, dtps: 20_000 },
          defenseDetail: [
            { spellId: 1, name: "Barreira", casts: 20, efficiency: 80 },
            { spellId: 2, name: "Imposicao das Maos", casts: 1, efficiency: 0.6 },
          ],
        },
      ]),
    ];

    expect(quantas(weeks, "esqueceu-tudo", "guardando-pro-inverno")).toBe(1);
    expect(quantas(weeks, "esqueceu-tudo", "cooldown-de-estimacao")).toBe(0);

    expect(quantas(weeks, "esqueceu-um", "guardando-pro-inverno")).toBe(0);
    expect(quantas(weeks, "esqueceu-um", "cooldown-de-estimacao")).toBe(1);
    expect(detalheDe(weeks, "esqueceu-um", "cooldown-de-estimacao")).toBe(
      "Imposicao das Maos, 0.6% da noite"
    );
  });

  // Poção esquecida já tem medalha própria — o acervo aqui é de equipamento.
  it("não conta consumível como peça do Museu de encantos", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "acervo",
          deaths: 1,
          preparationMissing: ["Elmo", "Peito", "Pernas", "Botas", "Colar"],
        },
        {
          playerId: "so-consumivel",
          deaths: 1,
          preparationMissing: ["Elmo", "Peito", "Poção", "Flask/comida", "Pedra de vida"],
        },
      ]),
    ];

    expect(quantas(weeks, "acervo", "museu-de-encantos")).toBe(1);
    expect(quantas(weeks, "so-consumivel", "museu-de-encantos")).toBe(0);
  });

  it("exige os três consumíveis faltando pra Dieta", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "jejum",
          deaths: 1,
          preparationMissing: ["Poção", "Flask/comida", "Pedra de vida"],
        },
        { playerId: "quase", deaths: 1, preparationMissing: ["Poção", "Flask/comida"] },
      ]),
    ];

    expect(quantas(weeks, "jejum", "dieta")).toBe(1);
    expect(quantas(weeks, "quase", "dieta")).toBe(0);
    // A poção sozinha continua valendo a medalha dela.
    expect(quantas(weeks, "quase", "pocao-que-pocao")).toBe(1);
  });

  it("mede Polivalente contra metade da mediana dos dps", () => {
    const funcaoDe = (id: string) => (id === "tank" ? ("tank" as const) : ("dps" as const));

    const alcancou = [
      semana("2026-09-01", [
        { playerId: "dps1", deaths: 1, dps: 100_000 },
        { playerId: "dps2", deaths: 1, dps: 100_000 },
        { playerId: "tank", deaths: 1, offRole: { dps: 50_000 } },
      ]),
    ];
    expect(contarConquistas(alcancou, TARGETS, { funcaoDe }).get("tank")?.get("polivalente")?.vezes).toBe(
      1
    );

    const faltou = [
      semana("2026-09-01", [
        { playerId: "dps1", deaths: 1, dps: 100_000 },
        { playerId: "dps2", deaths: 1, dps: 100_000 },
        { playerId: "tank", deaths: 1, offRole: { dps: 40_000 } },
      ]),
    ];
    expect(
      contarConquistas(faltou, TARGETS, { funcaoDe }).get("tank")?.get("polivalente")
    ).toBeUndefined();
  });

  it("dá Sem sobra ao healer que desperdiçou pouco", () => {
    const weeks = [
      semana("2026-09-01", [
        {
          playerId: "economico",
          deaths: 1,
          healing: { score: 80, coverage: 15, share: 90, overheal: 19.8 },
        },
        {
          playerId: "esbanjador",
          deaths: 1,
          healing: { score: 80, coverage: 25, share: 110, overheal: 42 },
        },
      ]),
    ];

    expect(quantas(weeks, "economico", "sem-sobra")).toBe(1);
    expect(detalheDe(weeks, "economico", "sem-sobra")).toBe("19.8% de desperdício");
    expect(quantas(weeks, "esbanjador", "sem-sobra")).toBe(0);
  });
});

describe("conquistas de temporada", () => {
  const noites = (
    datas: Array<[string, WeeklyPerformance["runs"][number]["players"]]>
  ): WeeklyPerformance[] =>
    datas.map(([date, players], indice) => ({ week: indice + 1, runs: [{ date, players }] }));

  it("conta Superação a cada vez que o jogador bate o próprio teto", () => {
    const weeks = noites([
      ["2026-09-01", [{ playerId: "a", deaths: 1, parse: 30 }]],
      ["2026-09-03", [{ playerId: "a", deaths: 1, parse: 40 }]],
      ["2026-09-05", [{ playerId: "a", deaths: 1, parse: 35 }]],
      ["2026-09-08", [{ playerId: "a", deaths: 1, parse: 50 }]],
    ]);

    // A primeira noite não supera nada: só vira recorde.
    expect(quantas(weeks, "a", "superacao")).toBe(2);
  });

  it("apura a temporada em ordem de data, não de arquivo", () => {
    const foraDeOrdem: WeeklyPerformance[] = [
      { week: 2, runs: [{ date: "2026-09-03", players: [{ playerId: "a", deaths: 1, parse: 20 }] }] },
      { week: 1, runs: [{ date: "2026-09-01", players: [{ playerId: "a", deaths: 1, parse: 50 }] }] },
    ];

    // Na ordem certa a nota caiu de 50 pra 20 — não houve superação nenhuma.
    expect(quantas(foraDeOrdem, "a", "superacao")).toBe(0);
  });

  it("fecha Constante a cada três noites seguidas acima de 90", () => {
    const weeks = noites([
      ["2026-09-01", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-03", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-05", [{ playerId: "a", deaths: 1, parse: 60 }]],
    ]);

    expect(quantas(weeks, "a", "constante")).toBe(1);
    expect(detalheDe(weeks, "a", "constante")).toBe("melhor sequência: 3 noites");
  });

  it("quebra a sequência da Constante com nota baixa", () => {
    const weeks = noites([
      ["2026-09-01", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-03", [{ playerId: "a", deaths: 1, parse: 10 }]],
      ["2026-09-05", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-08", [{ playerId: "a", deaths: 1, parse: 60 }]],
    ]);

    expect(quantas(weeks, "a", "constante")).toBe(0);
  });

  // Quem não jogou não errou nada — "Inabalável" já é a medalha de presença.
  it("não quebra a sequência da Constante por ausência", () => {
    const weeks = noites([
      ["2026-09-01", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-03", [{ playerId: "b", deaths: 1, parse: 60 }]],
      ["2026-09-05", [{ playerId: "a", deaths: 1, parse: 60 }]],
      ["2026-09-08", [{ playerId: "a", deaths: 1, parse: 60 }]],
    ]);

    expect(quantas(weeks, "a", "constante")).toBe(1);
  });

  it("dá Inabalável só a quem esteve em todas as noites", () => {
    const weeks = noites([
      ["2026-09-01", [{ playerId: "sempre", deaths: 1 }, { playerId: "as-vezes", deaths: 1 }]],
      ["2026-09-03", [{ playerId: "sempre", deaths: 1 }]],
    ]);

    expect(quantas(weeks, "sempre", "inabalavel")).toBe(1);
    expect(detalheDe(weeks, "sempre", "inabalavel")).toBe("2 de 2 noites");
    expect(quantas(weeks, "as-vezes", "inabalavel")).toBe(0);
  });

  it("dá Fundador só na PRIMEIRA vez que o boss cai", () => {
    const weeks = noites([
      [
        "2026-09-01",
        [{ playerId: "pioneiro", deaths: 1, bossKills: [{ encounterID: 3470, difficulty: 4 }] }],
      ],
      [
        "2026-09-03",
        [
          { playerId: "pioneiro", deaths: 1, bossKills: [{ encounterID: 3470, difficulty: 4 }] },
          { playerId: "atrasado", deaths: 1, bossKills: [{ encounterID: 3470, difficulty: 4 }] },
        ],
      ],
    ]);

    const apurado = contarConquistas(weeks, TARGETS, {
      nomeDoBoss: (id) => (id === 3470 ? "Nekzali" : undefined),
    });

    expect(apurado.get("pioneiro")?.get("fundador")?.vezes).toBe(1);
    expect(apurado.get("pioneiro")?.get("fundador")?.detalhe).toBe("Nekzali");
    expect(apurado.get("atrasado")?.get("fundador")).toBeUndefined();
  });

  it("conta um Fundador por boss, não por kill repetido na mesma noite", () => {
    const weeks = noites([
      [
        "2026-09-01",
        [
          {
            playerId: "a",
            deaths: 1,
            bossKills: [
              { encounterID: 3470, difficulty: 4 },
              { encounterID: 3470, difficulty: 3 },
              { encounterID: 3445, difficulty: 4 },
            ],
          },
        ],
      ],
    ]);

    expect(quantas(weeks, "a", "fundador")).toBe(2);
  });

  // O ponto inteiro da identidade de pessoa: quem foi de alt numa noite pra
  // compor o raide não abriu buraco na temporada.
  it("não abre buraco na presença de quem jogou de alt", () => {
    const pessoaDe = (id: string) => (id === "metallica" ? "gunst" : id);
    const weeks = noites([
      ["2026-09-01", [{ playerId: "gunst", deaths: 1 }]],
      ["2026-09-03", [{ playerId: "metallica", deaths: 1 }]],
    ]);

    const semIdentidade = contarConquistas(weeks, TARGETS);
    expect(semIdentidade.get("gunst")?.get("inabalavel")).toBeUndefined();

    const comIdentidade = contarConquistas(weeks, TARGETS, { pessoaDe });
    expect(comIdentidade.get("gunst")?.get("inabalavel")?.vezes).toBe(1);
    expect(comIdentidade.get("metallica")).toBeUndefined();
  });

  it("não quebra a sequência da Constante por troca de personagem", () => {
    const pessoaDe = (id: string) => (id === "metallica" ? "gunst" : id);
    const weeks = noites([
      ["2026-09-01", [{ playerId: "gunst", deaths: 1, parse: 60 }]],
      ["2026-09-03", [{ playerId: "metallica", deaths: 1, parse: 60 }]],
      ["2026-09-05", [{ playerId: "gunst", deaths: 1, parse: 60 }]],
    ]);

    expect(contarConquistas(weeks, TARGETS, { pessoaDe }).get("gunst")?.get("constante")?.vezes).toBe(
      1
    );
  });

  // Aconteceu em 15/09: a mesma pessoa aparece como Voidsurge e como Voidwar
  // porque trocou de cadeira no meio da noite.
  it("conta uma noite só quando a pessoa jogou com dois personagens", () => {
    const pessoaDe = (id: string) => (id === "voidwar" ? "voidsurge" : id);
    const weeks = noites([
      [
        "2026-09-15",
        [
          { playerId: "voidsurge", deaths: 0 },
          { playerId: "voidwar", deaths: 0 },
        ],
      ],
    ]);

    const apurado = contarConquistas(weeks, TARGETS, { pessoaDe });
    expect(apurado.get("voidsurge")?.get("noite-limpa")?.vezes).toBe(1);
    expect(apurado.get("voidsurge")?.get("inabalavel")?.detalhe).toBe("1 de 1 noites");
  });

  it("soma as kills dos dois personagens no mesmo Fundador", () => {
    const pessoaDe = (id: string) => (id === "voidwar" ? "voidsurge" : id);
    const weeks = noites([
      [
        "2026-09-15",
        [
          { playerId: "voidsurge", deaths: 1, bossKills: [{ encounterID: 3470, difficulty: 4 }] },
          { playerId: "voidwar", deaths: 1, bossKills: [{ encounterID: 3445, difficulty: 4 }] },
        ],
      ],
    ]);

    expect(contarConquistas(weeks, TARGETS, { pessoaDe }).get("voidsurge")?.get("fundador")?.vezes).toBe(
      2
    );
  });

  it("cobra cinco noites com a mesma mecânica pra Pagando promessa", () => {
    const erro = () => ({
      playerId: "a",
      deaths: 1,
      mechanics: { errors: 1, tries: 10 },
      mechanicsDetail: [
        {
          boss: "Ulatek",
          mechanic: "Damage from Toxic Droplets",
          label: "Gotículas Tóxicas",
          tries: 3,
        },
      ],
    });

    const datas = ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-08", "2026-09-10"];
    const comN = (quantidade: number) =>
      noites(datas.slice(0, quantidade).map((data) => [data, [erro()]]));

    expect(quantas(comN(4), "a", "pagando-promessa")).toBe(0);
    expect(quantas(comN(5), "a", "pagando-promessa")).toBe(1);
    expect(detalheDe(comN(5), "a", "pagando-promessa")).toBe('"Gotículas Tóxicas", em 5 noites');
  });
});
