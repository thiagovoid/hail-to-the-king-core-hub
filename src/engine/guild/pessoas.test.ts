import { describe, expect, it } from "vitest";

import { alterEgosDe, mapearPessoas, personagensPorPessoa, type PersonagemDoRoster } from "./pessoas";

const ROSTER: PersonagemDoRoster[] = [
  { id: "gunst", type: "main" },
  { id: "metallica", type: "alt", pertenceA: "gunst" },
  { id: "kroline", type: "main" },
  { id: "banco", type: "replace" },
];

describe("mapearPessoas", () => {
  it("leva o alt pro main e deixa o resto em paz", () => {
    const pessoas = mapearPessoas(ROSTER);

    expect(pessoas.get("metallica")).toBe("gunst");
    expect(pessoas.get("gunst")).toBe("gunst");
    expect(pessoas.get("kroline")).toBe("kroline");
    expect(pessoas.get("banco")).toBe("banco");
  });

  it("sobe a corrente até o main quando o alt aponta pra outro alt", () => {
    const pessoas = mapearPessoas([
      { id: "raiz", type: "main" },
      { id: "meio", type: "alt", pertenceA: "raiz" },
      { id: "ponta", type: "alt", pertenceA: "meio" },
    ]);

    expect(pessoas.get("ponta")).toBe("raiz");
  });

  // Juntar duas pessoas numa medalha só é bem pior que separar duas contas
  // da mesma pessoa — na dúvida, cada um por si.
  it("trata alt sem vínculo como pessoa própria", () => {
    const pessoas = mapearPessoas([
      { id: "gunst", type: "main" },
      { id: "solto", type: "alt" },
    ]);

    expect(pessoas.get("solto")).toBe("solto");
  });

  it("não trava com vínculo apontando pra quem não existe", () => {
    const pessoas = mapearPessoas([{ id: "orfao", type: "alt", pertenceA: "fantasma" }]);
    expect(pessoas.get("orfao")).toBe("orfao");
  });

  // Um ciclo no roster derrubaria o build inteiro se o laço não tivesse teto.
  it("não trava com dois personagens apontando um pro outro", () => {
    const pessoas = mapearPessoas([
      { id: "a", type: "alt", pertenceA: "b" },
      { id: "b", type: "alt", pertenceA: "a" },
    ]);

    expect(pessoas.size).toBe(2);
    expect(pessoas.get("a")).toBeDefined();
    expect(pessoas.get("b")).toBeDefined();
  });
});

describe("personagensPorPessoa", () => {
  it("agrupa os personagens com o main na frente", () => {
    const porPessoa = personagensPorPessoa(ROSTER);

    expect(porPessoa.get("gunst")).toEqual(["gunst", "metallica"]);
    expect(porPessoa.get("kroline")).toEqual(["kroline"]);
  });
});

describe("alterEgosDe", () => {
  it("lista os outros personagens da mesma pessoa, nos dois sentidos", () => {
    expect(alterEgosDe(ROSTER, "gunst")).toEqual(["metallica"]);
    expect(alterEgosDe(ROSTER, "metallica")).toEqual(["gunst"]);
    expect(alterEgosDe(ROSTER, "kroline")).toEqual([]);
  });

  it("devolve vazio pra personagem que não está no roster", () => {
    expect(alterEgosDe(ROSTER, "ninguem")).toEqual([]);
  });
});
