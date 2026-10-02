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

/**
 * Classes cuja arma se prepara com encantamento PERMANENTE, não temporário.
 *
 * O runeforge do death knight ocupa a arma — ele não aplica óleo nem pode.
 * Com a regra do temporário sozinha, o Blackwatch levava dez medalhas de
 * "arma seca" com a Rune of Sanguination na mão: o mesmo erro da poção numa
 * roupa nova, cobrar de alguém o uso de uma coisa que não serve pra ele.
 */
export const PREPARA_NO_PERMANENTE = new Set(["death-knight"]);

/** O item da mão principal, como a WCL entrega. */
export interface ArmaDoLog {
  temporaryEnchant?: number;
  temporaryEnchantName?: string;
  permanentEnchant?: number;
  permanentEnchantName?: string;
}

/**
 * A arma está preparada, e com o quê.
 *
 * Óleo, imbue de xamã e runeforge de DK contam igual: a régua é "a arma está
 * preparada?", não "usou o item que o guia manda" — a mesma régua que vale
 * pra poção de qualquer qualidade.
 */
export function armaPreparada(
  arma: ArmaDoLog | undefined,
  classe: string | undefined
): { preparada: boolean; nome?: string } | undefined {
  if (!arma) return undefined;

  if (classe !== undefined && PREPARA_NO_PERMANENTE.has(classe)) {
    return { preparada: Boolean(arma.permanentEnchant), nome: arma.permanentEnchantName };
  }

  return { preparada: Boolean(arma.temporaryEnchant), nome: arma.temporaryEnchantName };
}

/**
 * A pedra de vida medida contra a MORTE, não contra o número de pulls.
 *
 * Cobrar pedra em 60% das trys reprovava 151 noites-jogador, e a cobrança
 * não fazia sentido: pedra é botão de emergência. Ninguém aperta numa try
 * que correu bem, e apertar pouco não é desleixo — é não ter precisado.
 *
 * A pergunta que vale é a que quem coordena faz: **morreu com a pedra na
 * mão?** Então o denominador é a try em que a pessoa MORREU, e o numerador é
 * a try em que ela morreu tendo apertado.
 *
 * Quem não morreu na noite sai com `null`: não é 100 nem 0, é "não se
 * aplica" — e não se acusa quem não teve a situação.
 */
export interface UsoDaPedra {
  /** Trys em que a pessoa morreu. Zero = nada a julgar. */
  trysComMorte: number;
  /** Dessas, em quantas ela chegou a usar a pedra. */
  trysComUso: number;
  /** 0-100, ou `null` quando não morreu nenhuma vez. */
  uso: number | null;
}

export function usoDaPedraPorAtor(
  casts: Iterable<CastDoLog>,
  mortes: Iterable<{ targetID: number; fight: number }>,
  fightsDeRaide: Set<number>,
  ehPedra: (abilityGameID: number) => boolean
): Map<number, UsoDaPedra> {
  const morreuEm = new Map<number, Set<number>>();
  for (const morte of mortes) {
    if (!fightsDeRaide.has(morte.fight)) continue;
    const trys = morreuEm.get(morte.targetID) ?? new Set<number>();
    trys.add(morte.fight);
    morreuEm.set(morte.targetID, trys);
  }

  const usouEm = new Map<number, Set<number>>();
  for (const cast of casts) {
    if (!fightsDeRaide.has(cast.fight) || !ehPedra(cast.abilityGameID)) continue;
    const trys = usouEm.get(cast.sourceID) ?? new Set<number>();
    trys.add(cast.fight);
    usouEm.set(cast.sourceID, trys);
  }

  const resultado = new Map<number, UsoDaPedra>();
  for (const [ator, trysDeMorte] of morreuEm) {
    const comUso = [...trysDeMorte].filter((fight) => usouEm.get(ator)?.has(fight)).length;
    resultado.set(ator, {
      trysComMorte: trysDeMorte.size,
      trysComUso: comUso,
      uso: Math.round((comUso / trysDeMorte.size) * 100),
    });
  }

  return resultado;
}
