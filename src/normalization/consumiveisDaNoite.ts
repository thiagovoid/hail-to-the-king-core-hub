/**
 * Quem usou poção e pedra de vida, contado do nosso próprio log.
 *
 * Antes isso vinha de um insight do Wipefest, e ele não enxergava o que o
 * core usa: na noite de 01/10, **os 15 jogadores foram acusados de não usar
 * poção** e 14 tinham usado — doze deles em dois terços ou mais dos pulls.
 * A poção mais comum do raide é a `Light's Potential`, que não tem "poção"
 * no nome e escapava de qualquer casamento por texto.
 *
 * Aqui a fonte é o log da WarcraftLogs, que é onde o fato aconteceu: um cast
 * de qualquer magia cuja família no catálogo seja `pocao` conta como poção,
 * independente de ser de combate, cura, mana ou de que qualidade. Era a
 * regra pedida: poção é poção.
 *
 * Frasco e óleo NÃO saem daqui. Eles são estado de antes do pull, não ação
 * dentro dele, e não existem nos casts — ficam como "não medido" até a
 * coleta saber lê-los, em vez de reprovar o core inteiro por falta de dado.
 */
import type { FamiliaDeConsumivel } from "../providers/wowhead/familiaDoConsumivel";

/** O uso de uma família numa noite. `trys` é o denominador honesto. */
export interface UsoDeConsumivel {
  familia: FamiliaDeConsumivel;
  /** Em quantas trys a pessoa usou pelo menos uma vez. */
  trysComUso: number;
  /** Em quantas trys ela esteve lutando. */
  trys: number;
  /** 0-100. */
  uso: number;
  /** Os nomes usados — é o que desarma a discussão "mas eu usei". */
  quais: string[];
}

export interface CastDoLog {
  sourceID: number;
  abilityGameID: number;
  fight: number;
}

/**
 * O uso de cada família, por ator.
 *
 * `trys` é quantas lutas de raide a pessoa apareceu lançando alguma coisa.
 * Não é o número de pulls da noite: quem entrou na metade seria cobrado por
 * trys em que não estava.
 */
export function usoPorAtor(
  casts: Iterable<CastDoLog>,
  fightsDeRaide: Set<number>,
  familiaDaMagia: (abilityGameID: number) => FamiliaDeConsumivel | undefined,
  nomeDaMagia: (abilityGameID: number) => string | undefined,
  familias: FamiliaDeConsumivel[]
): Map<number, UsoDeConsumivel[]> {
  const trys = new Map<number, Set<number>>();
  const comUso = new Map<number, Map<FamiliaDeConsumivel, Set<number>>>();
  const quais = new Map<number, Map<FamiliaDeConsumivel, Set<string>>>();

  for (const cast of casts) {
    if (!fightsDeRaide.has(cast.fight)) continue;

    const minhas = trys.get(cast.sourceID) ?? new Set<number>();
    minhas.add(cast.fight);
    trys.set(cast.sourceID, minhas);

    const familia = familiaDaMagia(cast.abilityGameID);
    if (familia === undefined || !familias.includes(familia)) continue;

    const porFamilia = comUso.get(cast.sourceID) ?? new Map();
    const lutas = porFamilia.get(familia) ?? new Set<number>();
    lutas.add(cast.fight);
    porFamilia.set(familia, lutas);
    comUso.set(cast.sourceID, porFamilia);

    const nome = nomeDaMagia(cast.abilityGameID);
    if (nome) {
      const nomesPorFamilia = quais.get(cast.sourceID) ?? new Map();
      const nomes = nomesPorFamilia.get(familia) ?? new Set<string>();
      nomes.add(nome);
      nomesPorFamilia.set(familia, nomes);
      quais.set(cast.sourceID, nomesPorFamilia);
    }
  }

  const resultado = new Map<number, UsoDeConsumivel[]>();
  for (const [ator, lutas] of trys) {
    if (lutas.size === 0) continue;

    resultado.set(
      ator,
      familias.map((familia) => {
        const usados = comUso.get(ator)?.get(familia)?.size ?? 0;
        return {
          familia,
          trysComUso: usados,
          trys: lutas.size,
          uso: Math.round((usados / lutas.size) * 100),
          quais: [...(quais.get(ator)?.get(familia) ?? [])].sort(),
        };
      })
    );
  }

  return resultado;
}
