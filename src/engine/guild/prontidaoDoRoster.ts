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
import {
  avaliarProntidao,
  mediasDaTemporada,
  type FuncaoDaProntidao,
  type ProntidaoDoJogador,
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
