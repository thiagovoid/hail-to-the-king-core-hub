/**
 * Consolida os erros mecânicos de uma noite inteira, try a try.
 *
 * A nota da noite é a **média por try**, não o total: uma noite de 12 wipes
 * num boss novo não pode parecer pior que uma de 3 pulls só porque houve mais
 * oportunidade de errar. É o mesmo tratamento que o parse recebe.
 *
 * A média considera só as trys em que o jogador esteve — quem chegou atrasado
 * não é medido pelas trys que perdeu.
 *
 * O detalhe, ao contrário, é **somado**: pra dizer "Peçonha Sanguínea ×15 nos
 * Sentinelas" interessa o total da noite, não a média.
 *
 * Puro: recebe o que os providers leram, devolve estrutura. Sem rede.
 */

import type { PlayerFightMechanics } from "./insights";

export interface FightMechanics {
  /** Nome do boss, pra atribuir o erro a um encontro. */
  boss: string;
  kill: boolean;
  players: PlayerFightMechanics[];
}

export interface MechanicOccurrence {
  boss: string;
  mechanic: string;
  /** Total de ocorrências na noite. */
  hits: number;
}

export interface NightMechanics {
  /** Média de mecânicas distintas erradas por try, com uma casa decimal. */
  errors: number;
  /** Em quantas trys o jogador apareceu — deixa a média rastreável. */
  tries: number;
  /** Onde os erros aconteceram, do mais frequente pro menos. */
  byMechanic: MechanicOccurrence[];
}

/**
 * Quantas mecânicas distintas o jogador errou numa try.
 *
 * Conta a mecânica, não os hits: ficar 5 ticks numa poça é **um** erro de
 * execução, não 5. Antes isto somava os hits, e "Peçonha Sanguínea ×62"
 * virava 62 erros — o número media severidade, não decisões erradas.
 *
 * Os hits continuam no detalhe, onde severidade é justamente o que interessa.
 */
function errosNaTry(jogador: PlayerFightMechanics): number {
  return jogador.errors.length;
}

export function aggregateNightMechanics(fights: FightMechanics[]): Record<string, NightMechanics> {
  const porJogador = new Map<
    string,
    { totalErros: number; tries: number; detalhe: Map<string, MechanicOccurrence> }
  >();

  for (const fight of fights) {
    for (const jogador of fight.players) {
      const atual =
        porJogador.get(jogador.player) ?? { totalErros: 0, tries: 0, detalhe: new Map() };

      atual.tries += 1;
      atual.totalErros += errosNaTry(jogador);

      for (const erro of jogador.errors) {
        const chave = `${fight.boss}|${erro.mechanic}`;
        const existente = atual.detalhe.get(chave);
        const hits = erro.count ?? 1;
        if (existente) existente.hits += hits;
        else
          atual.detalhe.set(chave, {
            boss: fight.boss,
            mechanic: erro.mechanic,
            ...(erro.label ? { label: erro.label } : {}),
            hits,
          });
      }

      porJogador.set(jogador.player, atual);
    }
  }

  const resultado: Record<string, NightMechanics> = {};

  for (const [nome, dados] of porJogador) {
    if (dados.tries === 0) continue;
    resultado[nome] = {
      // Uma casa decimal: 1,8 e 2,3 são jogadores diferentes, e arredondar
      // pra inteiro juntaria os dois em 2 — some justamente a distinção.
      errors: Math.round((dados.totalErros / dados.tries) * 10) / 10,
      tries: dados.tries,
      byMechanic: [...dados.detalhe.values()].sort((a, b) => b.hits - a.hits),
    };
  }

  return resultado;
}
