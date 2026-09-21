import { describe, expect, it } from "vitest";

import {
  NAO_AMORTECE,
  PROTEGE_OUTRA_PESSOA,
  comDefensivosCompletos,
  kitDaTemporada,
} from "./defensivosDaPancada";
import type { WeeklyPerformance } from "../types/performance";

const noite = (
  date: string,
  usados: string[],
  prontosNaPancada: string[] = []
): WeeklyPerformance["runs"][number] =>
  ({
    date,
    players: [
      {
        playerId: "jrxamã",
        defenseDetail: usados.map((name, i) => ({ spellId: i, name, casts: 1, efficiency: 30 })),
        pancadas: [
          { fight: 1, atSecond: 10, ability: "Melee", amount: 954_000, fatiaDaVida: 100, defensivosProntos: prontosNaPancada },
        ],
      },
    ],
  }) as unknown as WeeklyPerformance["runs"][number];

const semana = (runs: WeeklyPerformance["runs"]): WeeklyPerformance =>
  ({ week: 1, runs }) as WeeklyPerformance;

const prontosDe = (s: WeeklyPerformance) => s.runs[0].players![0].pancadas![0].defensivosProntos;

describe("defensivos da pancada", () => {
  /**
   * O defeito: a lista saía dos casts DAQUELA noite. Quem não apertou o
   * Astral Shift a noite toda aparecia como "nada na mão", que se lê como
   * inocência — quem usa os defensivos era mais acusado que quem não usa.
   */
  it("conta o que a pessoa tem no kit e não apertou na noite", () => {
    const temporada = [
      semana([noite("2026-08-18", ["Astral Shift"])]),
      semana([noite("2026-08-25", [])]),
    ];
    const kit = kitDaTemporada(temporada);

    // Na noite em que não apertou nada, o Astral Shift esteve pronto o tempo
    // inteiro — não há cast nenhum que o tenha posto em recarga.
    expect(prontosDe(comDefensivosCompletos(temporada[1], kit))).toEqual(["Astral Shift"]);
  });

  it("não inventa magia que a pessoa nunca teve", () => {
    const kit = kitDaTemporada([semana([noite("2026-08-18", ["Astral Shift"])])]);
    const outra = semana([
      {
        date: "2026-08-25",
        players: [{ playerId: "outro", pancadas: [{ fight: 1, atSecond: 1, amount: 1, defensivosProntos: [] }] }],
      } as never,
    ]);

    expect(prontosDe(comDefensivosCompletos(outra, kit))).toEqual([]);
  });

  /**
   * O Healing Stream Totem é um totem de cura com 30s de recarga: não teria
   * amortecido um golpe do tamanho da vida inteira, e com 30s está pronto
   * quase sempre. Aparecia em 13 das 21 pancadas do jrxamã.
   */
  it("tira da linha o que não amortece o golpe", () => {
    const temporada = [semana([noite("2026-08-18", ["Healing Stream Totem", "Astral Shift"], ["Healing Stream Totem", "Astral Shift"])])];
    const kit = kitDaTemporada(temporada);

    expect(prontosDe(comDefensivosCompletos(temporada[0], kit))).toEqual(["Astral Shift"]);
    expect(NAO_AMORTECE.has("Healing Stream Totem")).toBe(true);
    expect(NAO_AMORTECE.has("Lay on Hands")).toBe(true);
  });

  /**
   * A Blessing of Sacrifice transfere o dano PARA o paladino. Tê-la pronta
   * não salvaria ele — salvaria outro. Acusar alguém de não usar em si mesmo
   * um botão que não funciona em si mesmo é pior que não acusar.
   */
  it("tira da linha o que protege outra pessoa", () => {
    const temporada = [semana([noite("2026-08-18", ["Blessing of Sacrifice", "Divine Shield"], ["Blessing of Sacrifice", "Divine Shield"])])];
    const kit = kitDaTemporada(temporada);

    expect(prontosDe(comDefensivosCompletos(temporada[0], kit))).toEqual(["Divine Shield"]);
    expect(PROTEGE_OUTRA_PESSOA.has("Blessing of Sacrifice")).toBe(true);
  });

  it("não duplica o que já estava na lista", () => {
    const temporada = [semana([noite("2026-08-18", ["Astral Shift"], ["Astral Shift"])])];
    const kit = kitDaTemporada(temporada);

    expect(prontosDe(comDefensivosCompletos(temporada[0], kit))).toEqual(["Astral Shift"]);
  });
});
