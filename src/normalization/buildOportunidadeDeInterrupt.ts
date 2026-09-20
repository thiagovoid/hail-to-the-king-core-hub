/**
 * Quantas vezes houve o que interromper — o denominador que faltava.
 *
 * A nota de interromper dividia por TRYS: cada try valia uma oportunidade,
 * existisse alvo ou não. Isso punia desenho de boss, e criava um incentivo
 * perverso — numa luta sem nada interrompível, quem apertava o kick recebia
 * nota baixa e quem nunca apertava não era medido.
 *
 * Os números que mostram o tamanho do problema, medidos na temporada:
 *
 * - de 2.829 casts inimigos com tempo de conjuração, só 141 (5%) são de
 *   magia que o raide comprovadamente consegue interromper;
 * - 7 dos 10 encontros não têm NENHUMA oportunidade a temporada inteira;
 * - onde existe oportunidade, o raide cobre 123 de 141 — 87%.
 *
 * Ou seja: a dimensão vinha acusando o time de um problema que, onde é
 * mensurável, ele não tem.
 */

/** Uma magia inimiga começada numa try, e quantas vezes. */
export interface ContagemDeCastInimigo {
  fight: number;
  abilityGameID: number;
  casts: number;
}

/** Uma interrupção: quem fez, em que try, e o que foi interrompido. */
export interface InterrupcaoObservada {
  sourceID: number;
  fight: number;
  /** A magia interrompida. É o que prova que ela é interrompível. */
  extraAbilityGameID?: number;
}

/**
 * Quais magias o raide comprovadamente consegue interromper.
 *
 * Derivada dos PRÓPRIOS eventos da temporada, e não de lista curada, pela
 * mesma razão que fez a eficiência de recarga errar: lista curada mede o
 * kit, o log mede o que aconteceu. A regra também se conserta sozinha —
 * quando alguém interromper uma magia nova, ela entra no conjunto sem
 * ninguém editar nada.
 *
 * O custo é conhecido e aceito: uma magia interrompível que o raide NUNCA
 * interrompeu não vira oportunidade. Isso subestima a oportunidade, nunca a
 * superestima — erra pro lado de não acusar, que é o lado certo de errar.
 */
export function magiasInterrompiveis(
  interrupcoes: Iterable<InterrupcaoObservada>
): Set<number> {
  const conhecidas = new Set<number>();
  for (const interrupcao of interrupcoes) {
    if (interrupcao.extraAbilityGameID !== undefined) conhecidas.add(interrupcao.extraAbilityGameID);
  }
  return conhecidas;
}

export interface OportunidadeDeInterrupt {
  /** Casts interrompíveis nas trys em que esta pessoa estava. */
  oportunidades: number;
  /** Quantos o RAIDE interrompeu nessas mesmas trys. */
  cobertosPeloRaide: number;
  /** Quantos foram desta pessoa. */
  seus: number;
  /** Quantas pessoas interromperam alguma coisa nessas trys. */
  pessoasQueInterromperam: number;
}

/**
 * A oportunidade de interromper de cada pessoa, pelas trys em que ela esteve.
 *
 * `presencaPorTry` é o que impede de cobrar de quem chegou depois: uma
 * oportunidade que aconteceu numa try que a pessoa não jogou não é dela.
 */
export function buildOportunidadeDeInterrupt(
  contagens: Iterable<ContagemDeCastInimigo>,
  interrupcoes: Iterable<InterrupcaoObservada>,
  presencaPorTry: Map<number, Set<number>>,
  interrompiveis: Set<number>
): Map<number, OportunidadeDeInterrupt> {
  const oportunidadePorTry = new Map<number, number>();
  for (const contagem of contagens) {
    if (!interrompiveis.has(contagem.abilityGameID)) continue;
    oportunidadePorTry.set(
      contagem.fight,
      (oportunidadePorTry.get(contagem.fight) ?? 0) + contagem.casts
    );
  }

  const interrupcoesPorTry = new Map<number, InterrupcaoObservada[]>();
  for (const interrupcao of interrupcoes) {
    interrupcoesPorTry.set(interrupcao.fight, [
      ...(interrupcoesPorTry.get(interrupcao.fight) ?? []),
      interrupcao,
    ]);
  }

  const porPessoa = new Map<number, OportunidadeDeInterrupt>();
  const colegasPorPessoa = new Map<number, Set<number>>();

  for (const [fight, presentes] of presencaPorTry) {
    const oportunidades = oportunidadePorTry.get(fight) ?? 0;
    const daTry = interrupcoesPorTry.get(fight) ?? [];
    if (oportunidades === 0 && daTry.length === 0) continue;

    const autores = new Set(daTry.map((interrupcao) => interrupcao.sourceID));

    for (const actorId of presentes) {
      const atual = porPessoa.get(actorId) ?? {
        oportunidades: 0,
        cobertosPeloRaide: 0,
        seus: 0,
        pessoasQueInterromperam: 0,
      };

      atual.oportunidades += oportunidades;
      // O raide não pode ter coberto mais do que existia: numa try com 3
      // alvos e 5 kicks, dois kicks pegaram algo que o denominador não
      // conhece, e contá-los daria cobertura acima de 100%.
      atual.cobertosPeloRaide += Math.min(oportunidades, daTry.length);
      atual.seus += daTry.filter((interrupcao) => interrupcao.sourceID === actorId).length;

      porPessoa.set(actorId, atual);

      const colegas = colegasPorPessoa.get(actorId) ?? new Set<number>();
      for (const autor of autores) colegas.add(autor);
      colegasPorPessoa.set(actorId, colegas);
    }
  }

  for (const [actorId, resumo] of porPessoa) {
    resumo.pessoasQueInterromperam = colegasPorPessoa.get(actorId)?.size ?? 0;
  }

  return porPessoa;
}
