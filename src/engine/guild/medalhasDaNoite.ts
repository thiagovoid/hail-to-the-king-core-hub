/**
 * As medalhas de UMA noite.
 *
 * Existe separado de `conquistas.ts` porque a pergunta é outra. A parede de
 * conquistas é da temporada e da PESSOA: ela premia constância, e sabe que
 * o alt e o main são o mesmo alguém. Um guild run não tem nada disso — o
 * elenco muda toda edição, o personagem é de uma noite só, e metade da
 * graça é justamente o que deu errado.
 *
 * Então aqui é superlativo de noite: quem foi o maior de cada coisa naquelas
 * horas, incluindo as coisas que ninguém quer ser o maior.
 */

/** O que uma medalha precisa ler de um jogador. Só os campos usados. */
export interface JogadorDaNoite {
  playerId: string;
  dps?: number;
  parse?: number;
  deaths?: number;
  trashShare?: number;
  deathCost?: { seconds?: number };
  deathSignature?: { primeiroACair?: number; efeitoDomino?: number };
  utility?: {
    interrupts?: number;
    dispels?: number;
    battleRez?: number;
    battleRezRecebidos?: number;
  };
  bossKills?: unknown[];
}

/** Mérito é o que se quer mostrar; zoeira é o que se quer contar depois. */
export type TomDaMedalha = "merito" | "zoeira";

export interface MedalhaDaNoite {
  id: string;
  titulo: string;
  icone: string;
  tom: TomDaMedalha;
  /** Empate leva todo mundo: numa noite de dezoito, empate acontece. */
  ganhadores: string[];
  /** Já formatado — a tela não deve precisar saber a unidade de cada uma. */
  valor: string;
}

interface Criterio {
  id: string;
  titulo: string;
  icone: string;
  tom: TomDaMedalha;
  /** undefined quando o jogador não tem o dado — fica fora da disputa. */
  de: (jogador: JogadorDaNoite) => number | undefined;
  formato: (valor: number) => string;
}

const inteiro = (valor: number) => valor.toLocaleString("pt-BR");
const umaCasa = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** "4m 12s" — segundos crus não dizem nada sobre uma noite de raide. */
function duracao(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = Math.round(segundos % 60);
  return min > 0 ? `${min}m ${seg}s` : `${seg}s`;
}

const CRITERIOS: Criterio[] = [
  {
    id: "dano",
    titulo: "Maior dano",
    icone: "⚔",
    tom: "merito",
    de: (j) => j.dps,
    formato: (v) => `${inteiro(Math.round(v))} dps`,
  },
  {
    id: "parse",
    titulo: "Melhor parse",
    icone: "📊",
    tom: "merito",
    de: (j) => j.parse,
    formato: (v) => `${umaCasa(v)}`,
  },
  {
    id: "interrupcoes",
    titulo: "Mais interrupções",
    icone: "🤚",
    tom: "merito",
    de: (j) => j.utility?.interrupts,
    formato: inteiro,
  },
  {
    id: "dispels",
    titulo: "Mais dispels",
    icone: "✨",
    tom: "merito",
    de: (j) => j.utility?.dispels,
    formato: inteiro,
  },
  {
    id: "rez",
    titulo: "Mais battle rez dados",
    icone: "🙌",
    tom: "merito",
    de: (j) => j.utility?.battleRez,
    formato: inteiro,
  },
  {
    id: "trash",
    titulo: "Mais trash limpo",
    icone: "🧹",
    tom: "merito",
    de: (j) => j.trashShare,
    formato: (v) => `${umaCasa(v)}%`,
  },
  {
    id: "mortes",
    titulo: "Mais mortes",
    icone: "💀",
    tom: "zoeira",
    de: (j) => j.deaths,
    formato: inteiro,
  },
  {
    id: "primeiro-a-cair",
    titulo: "Primeiro a cair",
    icone: "🪦",
    tom: "zoeira",
    de: (j) => j.deathSignature?.primeiroACair,
    formato: (v) => `${inteiro(v)} vez(es)`,
  },
  {
    id: "domino",
    titulo: "Efeito dominó",
    icone: "🁣",
    tom: "zoeira",
    de: (j) => j.deathSignature?.efeitoDomino,
    formato: (v) => `${inteiro(v)} vez(es)`,
  },
  {
    id: "tempo-no-chao",
    titulo: "Mais tempo no chão",
    icone: "⏳",
    tom: "zoeira",
    de: (j) => j.deathCost?.seconds,
    formato: duracao,
  },
  {
    id: "rez-recebidos",
    titulo: "Mais battle rez recebidos",
    icone: "🫴",
    tom: "zoeira",
    de: (j) => j.utility?.battleRezRecebidos,
    formato: (v) => `${inteiro(v)} vez(es)`,
  },
];

/**
 * As medalhas da noite, na ordem dos critérios.
 *
 * Uma medalha só sai quando há disputa de verdade:
 *
 * - pelo menos dois jogadores com o dado. "Maior dano" num log em que só uma
 *   pessoa tem dps não premia ninguém, descreve uma lacuna da coleta;
 * - o vencedor com valor acima de zero. Ninguém ganha "mais interrupções"
 *   com zero interrupções — e numa noite tranquila o zero é o normal.
 *
 * Empate leva todos os empatados: cortar no primeiro da lista escolheria por
 * ordem de array, que não é critério nenhum.
 */
export function medalhasDaNoite(jogadores: JogadorDaNoite[]): MedalhaDaNoite[] {
  const medalhas: MedalhaDaNoite[] = [];

  for (const criterio of CRITERIOS) {
    const comValor = jogadores
      .map((jogador) => ({ id: jogador.playerId, valor: criterio.de(jogador) }))
      .filter((linha): linha is { id: string; valor: number } => typeof linha.valor === "number");

    if (comValor.length < 2) continue;

    const maior = Math.max(...comValor.map((linha) => linha.valor));
    if (maior <= 0) continue;

    medalhas.push({
      id: criterio.id,
      titulo: criterio.titulo,
      icone: criterio.icone,
      tom: criterio.tom,
      ganhadores: comValor.filter((linha) => linha.valor === maior).map((linha) => linha.id),
      valor: criterio.formato(maior),
    });
  }

  return medalhas;
}
