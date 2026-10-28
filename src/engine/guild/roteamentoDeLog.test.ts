import { describe, expect, it } from "vitest";

import { decidirCore, explicarDecisao, sobreposicao } from "./roteamentoDeLog";

const nemesis = {
  slug: "nemesis",
  formato: "core" as const,
  roster: new Set(["blackwatch", "gunst", "nerlock", "kams", "voidsurge"]),
};

const omega = {
  slug: "omega",
  formato: "core" as const,
  roster: new Set(["fulano", "beltrano", "sicrano"]),
};

const guildRun = { slug: "guild-run", formato: "evento" as const, roster: new Set<string>() };

const CORES = [nemesis, omega, guildRun];
const CORTE = 0.5;
const SEM_DECLARACAO = new Map<string, { core: string | null; motivo: string }>();

describe("sobreposicao", () => {
  it("é a fração do log que o roster conhece", () => {
    expect(sobreposicao(new Set(["gunst", "nerlock"]), nemesis.roster)).toBe(1);
    expect(sobreposicao(new Set(["gunst", "estranho"]), nemesis.roster)).toBe(0.5);
    expect(sobreposicao(new Set(["estranho"]), nemesis.roster)).toBe(0);
  });

  it("log vazio não vira divisão por zero", () => {
    expect(sobreposicao(new Set(), nemesis.roster)).toBe(0);
  });
});

describe("decidirCore", () => {
  it("noite do core vai pro core", () => {
    const d = decidirCore(
      "ABC",
      new Set(["blackwatch", "gunst", "nerlock", "kams"]),
      CORES,
      SEM_DECLARACAO,
      CORTE
    );

    expect(d).toEqual({ tipo: "sobreposicao", core: "nemesis", fracao: 1 });
  });

  it("escolhe o core de maior sobreposição quando os dois têm gente", () => {
    // Três do Ômega e um do Nemesis: é noite do Ômega.
    const d = decidirCore(
      "ABC",
      new Set(["fulano", "beltrano", "sicrano", "gunst"]),
      CORES,
      SEM_DECLARACAO,
      CORTE
    );

    expect(d).toMatchObject({ tipo: "sobreposicao", core: "omega" });
  });

  it("guild run não entra em core nenhum, e diz por quê", () => {
    // O caso real de 23/10: dezoito personagens, nenhum conhecido.
    const d = decidirCore(
      "QzdpHPYRja8GnANk",
      new Set(["strohmonk", "kairá", "blackbarrel", "beowolff"]),
      CORES,
      SEM_DECLARACAO,
      CORTE
    );

    expect(d).toEqual({ tipo: "sem-core", melhor: null });
    expect(explicarDecisao("QzdpHPYRja8GnANk", d)).toContain("NÃO entrou");
  });

  it("pug com dois do core fica abaixo do corte e é relatado", () => {
    const pug = new Set(["gunst", "nerlock", "p1", "p2", "p3", "p4", "p5", "p6"]);
    const d = decidirCore("PUG", pug, CORES, SEM_DECLARACAO, CORTE);

    expect(d.tipo).toBe("sem-core");
    expect(explicarDecisao("PUG", d)).toContain("25%");
  });

  it("noite legítima com novatos passa — o corte tem folga", () => {
    // 10 de 13 conhecidos, que foi a pior noite real da temporada.
    const noite = new Set([
      ...nemesis.roster,
      "novato1",
      "novato2",
      "novato3",
    ]);

    const d = decidirCore("NOITE", noite, CORES, SEM_DECLARACAO, CORTE);

    expect(d).toMatchObject({ tipo: "sobreposicao", core: "nemesis" });
  });

  it("declaração vence a sobreposição, nos dois sentidos", () => {
    const declaracoes = new Map([
      ["FORA", { core: null, motivo: "guild run" }],
      ["NOVO", { core: "omega", motivo: "primeira noite do Ômega" }],
    ]);

    // Teria entrado no Nemesis pela sobreposição, mas foi declarado fora.
    expect(decidirCore("FORA", nemesis.roster, CORES, declaracoes, CORTE)).toEqual({
      tipo: "declarado",
      core: null,
      motivo: "guild run",
    });

    // Não tem roster nenhum ainda, e entra porque foi declarado: é o
    // arranque de um core novo.
    expect(decidirCore("NOVO", new Set(["zeca", "tonho"]), CORES, declaracoes, CORTE)).toEqual({
      tipo: "declarado",
      core: "omega",
      motivo: "primeira noite do Ômega",
    });
  });

  it("evento nunca ganha por sobreposição — só por declaração", () => {
    const d = decidirCore("X", new Set(["ninguem"]), [guildRun], SEM_DECLARACAO, CORTE);
    expect(d).toEqual({ tipo: "sem-core", melhor: null });
  });
});
