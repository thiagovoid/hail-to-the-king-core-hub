import { describe, expect, it } from "vitest";

import { aplicarVinculos, mudancasDe, validarVinculos, type PersonagemParaVincular } from "./vinculos";

const roster: PersonagemParaVincular[] = [
  { id: "voidsurge", name: "Voidsurge", type: "main" },
  { id: "voidwar", name: "Voidwar", type: "alt", pertenceA: "voidsurge" },
  { id: "nerlock", name: "Nerlock", type: "main" },
  { id: "metallica", name: "Metallicä", type: "main" },
  { id: "banco", name: "Banco", type: "replace" },
];

describe("aplicarVinculos", () => {
  it("mexe só em type e pertenceA, e só de quem está na proposta", () => {
    // O roster carrega parse, io e metas do Raidbots que vêm das coletas.
    // Reescrever o personagem inteiro a partir da tela apagaria dado fresco.
    const comExtras = roster.map((p) => ({ ...p, warcraftLogs: { avgParse: 80 } }));
    const depois = aplicarVinculos(comExtras, { metallica: "nerlock" });

    expect(depois.find((p) => p.id === "metallica")).toEqual({
      id: "metallica",
      name: "Metallicä",
      type: "alt",
      pertenceA: "nerlock",
      warcraftLogs: { avgParse: 80 },
    });
    // Quem não estava na proposta sai idêntico, o mesmo objeto inclusive.
    expect(depois.find((p) => p.id === "nerlock")).toBe(comExtras.find((p) => p.id === "nerlock"));
  });

  it("desvincular devolve pra main", () => {
    const depois = aplicarVinculos(roster, { voidwar: null });
    const voidwar = depois.find((p) => p.id === "voidwar")!;

    expect(voidwar.type).toBe("main");
    expect(voidwar.pertenceA).toBeNull();
  });

  it("quem é reserva continua reserva ao desvincular", () => {
    // `replace` é quem fica no banco. Deixar de ser alt de alguém não
    // promove ninguém a main.
    const comBancoAlt = aplicarVinculos(roster, { banco: "nerlock" });
    const depois = aplicarVinculos(comBancoAlt, { banco: null });

    expect(depois.find((p) => p.id === "banco")!.type).toBe("replace");
  });
});

describe("validarVinculos", () => {
  it("aprova uma proposta boa, e a vazia", () => {
    expect(validarVinculos(roster, {})).toEqual([]);
    expect(validarVinculos(roster, { metallica: "nerlock" })).toEqual([]);
  });

  it("recusa id que não existe, dos dois lados", () => {
    expect(validarVinculos(roster, { fantasma: "nerlock" })).toHaveLength(1);
    expect(validarVinculos(roster, { metallica: "fantasma" })).toHaveLength(1);
  });

  it("recusa alt de si mesmo", () => {
    expect(validarVinculos(roster, { nerlock: "nerlock" })).toHaveLength(1);
  });

  it("recusa corrente de alt", () => {
    // `mapearPessoas` resolveria subindo até o topo, e a medalha de
    // Metallicä iria calada pro Voidsurge em vez do Voidwar que foi
    // escolhido na tela. Melhor recusar.
    const problemas = validarVinculos(roster, { metallica: "voidwar" });

    expect(problemas).toHaveLength(1);
    expect(problemas[0].motivo).toContain("precisa ser um main");
  });

  it("recusa ciclo", () => {
    const problemas = validarVinculos(roster, { nerlock: "metallica", metallica: "nerlock" });

    expect(problemas.length).toBeGreaterThan(0);
  });

  it("aceita trocar quem é o main do par", () => {
    // Voidwar vira main e Voidsurge vira alt dele: os dois mudam na mesma
    // proposta, e nenhum momento intermediário pode reprovar isso.
    expect(validarVinculos(roster, { voidwar: null, voidsurge: "voidwar" })).toEqual([]);
  });
});

describe("mudancasDe", () => {
  it("descreve o antes e o depois pelo nome", () => {
    expect(mudancasDe(roster, { metallica: "nerlock" })).toEqual([
      { id: "metallica", name: "Metallicä", de: null, para: "Nerlock" },
    ]);
  });

  it("não lista quem não mudou de pessoa", () => {
    // Reafirmar o vínculo que já existe não é mudança nenhuma, e a tela não
    // pode pedir commit de um arquivo idêntico.
    expect(mudancasDe(roster, { voidwar: "voidsurge" })).toEqual([]);
  });

  it("lista o desvínculo", () => {
    expect(mudancasDe(roster, { voidwar: null })).toEqual([
      { id: "voidwar", name: "Voidwar", de: "Voidsurge", para: null },
    ]);
  });
});
