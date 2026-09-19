/**
 * As três conquistas mais perto de cair.
 *
 * A parede de medalhas mostra TUDO, inclusive o que ninguém nunca vai pegar
 * — e é assim que tem que ser: esconder o que a pessoa não tem seria fingir
 * que não existe um degrau ali. Só que uma parede de 53 medalhas, com 45
 * trancadas, não diz por onde começar.
 *
 * Então nada sai da tela: entram três, em cima, com a distância medida. É a
 * diferença entre "você não tem essas 45" e "essas três estão ao seu
 * alcance" — o mesmo dado, lido pra frente.
 *
 * Só entram conquistas de MÉRITO cujo critério é um número da própria noite.
 * As disputadas (MVP, maior dano) ficam de fora: elas dependem de quem mais
 * apareceu na terça, e transformar isso em barra de progresso seria pôr o
 * core pra competir entre si numa tela que é da pessoa.
 */

import { CONQUISTAS, CORTE, type DefinicaoDeConquista } from "./conquistas";
import type { PlayerPerformance } from "../../types/performance";

export interface ConquistaAoAlcance {
  conquista: DefinicaoDeConquista;
  /** O melhor que a pessoa já fez na temporada. */
  atual: number;
  /** O número que destrava. */
  alvo: number;
  /** 0-100, pra barra. */
  progresso: number;
  /** "faltam 9 de parse" — a frase que vai embaixo da barra. */
  falta: string;
}

/**
 * Um critério mensurável, com a escala em que ele é lido.
 *
 * `zero` é o valor em que a barra fica vazia. Ele não é arbitrário: sai do
 * PIOR número das 113 noites-jogador da temporada, pra barra representar a
 * distância dentro do que o core de fato produz. Sem ele, "0 mortes" com a
 * pessoa em 2 daria uma barra impossível de desenhar.
 */
interface Criterio {
  id: string;
  /** O melhor valor da pessoa na temporada, ou null se ela não tem o dado. */
  melhorDe: (noites: PlayerPerformance[]) => number | null;
  alvo: number;
  /** Menor é melhor? (mortes, erros, desperdício de cura) */
  menorEMelhor: boolean;
  /** O valor em que a barra zera. Só usado quando menor é melhor. */
  zero?: number;
  /** Como a distância é dita: "9 de parse", "1,2 erro por try". */
  falta: (distancia: number) => string;
}

/** O maior valor definido da temporada. */
const maiorDe = (valores: Array<number | undefined | null>): number | null => {
  const definidos = valores.filter((v): v is number => typeof v === "number");
  return definidos.length === 0 ? null : Math.max(...definidos);
};

/** O menor valor definido da temporada. */
const menorDe = (valores: Array<number | undefined | null>): number | null => {
  const definidos = valores.filter((v): v is number => typeof v === "number");
  return definidos.length === 0 ? null : Math.min(...definidos);
};

/** "1,2" em vez de "1.2". */
const numero = (valor: number): string =>
  String(Math.round(valor * 10) / 10).replace(".", ",");

const CRITERIOS: Criterio[] = [
  {
    id: "lenda",
    melhorDe: (noites) => maiorDe(noites.map((n) => n.parse)),
    alvo: CORTE.lenda,
    menorEMelhor: false,
    falta: (d) => `faltam ${numero(d)} de parse`,
  },
  {
    id: "escoteiro",
    melhorDe: (noites) => maiorDe(noites.map((n) => n.preparation)),
    alvo: 100,
    menorEMelhor: false,
    falta: (d) => `faltam ${numero(d)} pontos de preparação`,
  },
  {
    id: "relojoeiro",
    melhorDe: (noites) =>
      maiorDe(noites.flatMap((n) => (n.attackDetail ?? []).map((c) => c.efficiency))),
    alvo: CORTE.relojoeiro,
    menorEMelhor: false,
    falta: (d) => `faltam ${numero(d)} pontos no seu melhor cooldown`,
  },
  {
    id: "muralha",
    melhorDe: (noites) => maiorDe(noites.map((n) => n.defense?.score)),
    alvo: CORTE.muralha,
    menorEMelhor: false,
    falta: (d) => `faltam ${numero(d)} de Defender`,
  },
  {
    id: "mecanicas-impecaveis",
    melhorDe: (noites) => menorDe(noites.map((n) => n.mechanics?.errors)),
    alvo: 0,
    menorEMelhor: true,
    // O pior da temporada foi 3,1 erros por try.
    zero: 3.1,
    falta: (d) => `${numero(d)} erro${d === 1 ? "" : "s"} por try a menos`,
  },
  {
    id: "noite-limpa",
    melhorDe: (noites) => menorDe(noites.map((n) => n.deaths)),
    alvo: 0,
    menorEMelhor: true,
    // O pior da temporada foram 18 mortes numa noite.
    zero: 18,
    falta: (d) => `${numero(d)} morte${d === 1 ? "" : "s"} a menos na sua melhor noite`,
  },
  {
    id: "sem-sobra",
    melhorDe: (noites) => menorDe(noites.map((n) => n.healing?.overheal)),
    alvo: CORTE.semSobra,
    menorEMelhor: true,
    // O pior da temporada foram 42% de cura desperdiçada.
    zero: 42,
    falta: (d) => `${numero(d)} pontos de desperdício a menos`,
  },
];

function progressoDe(criterio: Criterio, atual: number): number {
  const bruto = criterio.menorEMelhor
    ? ((criterio.zero ?? atual) - atual) / ((criterio.zero ?? atual) - criterio.alvo)
    : atual / criterio.alvo;

  return Math.max(0, Math.min(100, Math.round(bruto * 100)));
}

/**
 * As três mais perto, da mais perto pra menos.
 *
 * Conquista já ganha não entra: ela já está na estante, com o número de
 * vezes. Critério sem dado também não — prometer "faltam X" quando o X é
 * desconhecido é pior que não dizer nada.
 */
export function aoSeuAlcance(
  noites: PlayerPerformance[],
  ganhas: Set<string>,
  quantas = 3
): ConquistaAoAlcance[] {
  const candidatas: ConquistaAoAlcance[] = [];

  for (const criterio of CRITERIOS) {
    if (ganhas.has(criterio.id)) continue;

    const conquista = CONQUISTAS.find((c) => c.id === criterio.id);
    if (conquista === undefined) continue;

    const atual = criterio.melhorDe(noites);
    if (atual === null) continue;

    const distancia = criterio.menorEMelhor ? atual - criterio.alvo : criterio.alvo - atual;
    // Distância zero ou negativa com a medalha não ganha significa que a
    // conquista tem outra condição junto (função, por exemplo). Fora.
    if (distancia <= 0) continue;

    candidatas.push({
      conquista,
      atual,
      alvo: criterio.alvo,
      progresso: progressoDe(criterio, atual),
      falta: criterio.falta(Math.round(distancia * 10) / 10),
    });
  }

  return candidatas.sort((a, b) => b.progresso - a.progresso).slice(0, quantas);
}
