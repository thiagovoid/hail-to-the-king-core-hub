/**
 * A prontidão de TODO o roster, de uma vez.
 *
 * Existe porque três telas precisam da mesma conta e nenhuma delas pode
 * inventar a sua: a ficha do jogador mostra o cartão, a estante de medalhas
 * dá as de "Pronto pro ...", e o painel do core soma pra responder se temos
 * COMP pro conteúdo. Se cada uma calculasse do seu jeito, o site diria três
 * coisas diferentes sobre a mesma pessoa.
 */

import type { WeeklyPerformance } from "../../types/performance";
import { getPlayerHistory } from "../metrics";
import type { PessoaNaComp } from "./comp";
import {
  avaliarProntidao,
  mediasDaTemporada,
  type FuncaoDaProntidao,
  type ProntidaoDoJogador,
  NIVEIS,
  type NivelDeConteudo,
} from "../scores/prontidao";

/** O mínimo que a prontidão precisa saber do cadastro. */
export interface JogadorDoRoster {
  id: string;
  role?: string;
  raiderIo?: { io?: number | null } | null;
  performanceGoals?: { dps?: { target?: number | null } | null } | null;
}

export interface ProntidaoApurada {
  prontidao: ProntidaoDoJogador;
  funcao: FuncaoDaProntidao;
  /** Quantas noites entraram na média — sem isso o número não é auditável. */
  noites: number;
}

/**
 * A função que a prontidão usa pra medir a pessoa.
 *
 * O LOG manda quando discorda do cadastro: quem curou a temporada inteira é
 * medido por Curar, mesmo que o roster ainda diga "dps". O cadastro envelhece,
 * o log não.
 */
export function funcaoDaProntidao(
  role: string | undefined,
  noites: Array<{ healing?: unknown }>
): FuncaoDaProntidao {
  if (noites.some((noite) => noite.healing)) return "healer";
  return role === "tank" ? "tank" : "dps";
}

export function prontidaoDoRoster(
  roster: JogadorDoRoster[],
  weeks: WeeklyPerformance[]
): Map<string, ProntidaoApurada> {
  const apurada = new Map<string, ProntidaoApurada>();

  for (const jogador of roster) {
    const historico = getPlayerHistory(weeks, jogador.id);

    // Sem noite não há média, e uma prontidão calculada sobre nada colocaria
    // quem nunca jogou no mesmo degrau de quem jogou a temporada toda.
    if (historico.length === 0) continue;

    const funcao = funcaoDaProntidao(jogador.role, historico);

    apurada.set(jogador.id, {
      funcao,
      noites: historico.length,
      prontidao: avaliarProntidao(
        mediasDaTemporada(historico, funcao, {
          io: jogador.raiderIo?.io ?? null,
          simDeDps: jogador.performanceGoals?.dps?.target ?? null,
        }),
        funcao
      ),
    });
  }

  return apurada;
}

/**
 * O core reduzido a PESSOAS, pro painel de COMP.
 *
 * Alt não ocupa duas cadeiras: o Xúlio e o Xúliodk são um jogador só, e
 * contá-los duas vezes faria o core parecer maior do que senta na raide.
 *
 * Mas cada pessoa entra com TODAS as cadeiras que ela ocupou na temporada,
 * cada uma com o seu próprio nível. "Na ausência de alguém podemos trocar de
 * cadeira pra compor" é como o core joga: o Voidwar tankando e o Voidsurge
 * curando são a mesma pessoa oferecendo duas cadeiras ao grupo, e reduzir
 * isso a uma função só apagaria justamente quem trocou pra ajudar.
 *
 * O nível é do PAPEL, não da pessoa: estar pronto tankando não torna
 * ninguém pronto curando.
 */
export function pessoasNaComp(
  apurada: Map<string, ProntidaoApurada>,
  pessoaDe: (playerId: string) => string
): PessoaNaComp[] {
  const papeisDaPessoa = new Map<string, Map<FuncaoDaProntidao, NivelDeConteudo | null>>();

  for (const [personagem, entrada] of apurada) {
    const dono = pessoaDe(personagem);
    const papeis = papeisDaPessoa.get(dono) ?? new Map<FuncaoDaProntidao, NivelDeConteudo | null>();
    const atual = papeis.get(entrada.funcao);
    const novo = entrada.prontidao.nivel;

    // Dois personagens na mesma cadeira: vale o melhor deles. Quem subiu o
    // alt de tank até o heroico não volta pro normal por ter um tank antigo.
    if (atual === undefined || posicaoDoNivel(novo) > posicaoDoNivel(atual)) {
      papeis.set(entrada.funcao, novo);
    }

    papeisDaPessoa.set(dono, papeis);
  }

  return [...papeisDaPessoa].map(([id, papeis]) => ({
    id,
    papeis: [...papeis].map(([funcao, nivel]) => ({ funcao, nivel })),
  }));
}

function posicaoDoNivel(nivel: NivelDeConteudo | null): number {
  return nivel === null ? -1 : NIVEIS.indexOf(nivel);
}
