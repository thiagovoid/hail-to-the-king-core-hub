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
 * O detalhe conta em quantas trys cada mecânica foi errada — "Peçonha
 * Sanguínea em 11 trys". Mostrar hits não ajudava: 62 ticks não dizem em
 * quantas vezes a pessoa errou a decisão, e o número não conversava com a
 * nota.
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
  /**
   * Em quantas trys da noite essa mecânica foi errada.
   *
   * Não é contagem de hits: 62 ticks de uma poça em 11 trys viram 11, não
   * 62. Assim o detalhe fecha com a nota — a soma das trys de todas as
   * mecânicas, dividida pelo total de trys, é exatamente `errors`.
   */
  tries: number;
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
        // Uma try, um ponto: o erro aconteceu naquela try, quantas vezes
        // doeu é outra grandeza.
        if (existente) existente.tries += 1;
        else
          atual.detalhe.set(chave, {
            boss: fight.boss,
            mechanic: erro.mechanic,
            ...(erro.label ? { label: erro.label } : {}),
            tries: 1,
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
      byMechanic: [...dados.detalhe.values()].sort((a, b) => b.tries - a.tries),
    };
  }

  return resultado;
}

import type { PlayerFightPreparation } from "./insights";

/** Nome do Wipefest → rótulo curto em português, pro que falta na tela. */
const ROTULOS_DE_CONSUMIVEL: Record<string, string> = {
  "Ready Check (Flask, Gear, etc.)": "Flask/comida",
  Potions: "Poção",
  "Healthstone / Healing Potion": "Pedra de vida",
};

export interface NightPreparation {
  /** 0-100: média dos itens de consumível entre as trys da noite. */
  score: number;
  /** Itens que ficaram abaixo do ideal, pra tela dizer o que arrumar. */
  missing: string[];
  /** Quantos itens entraram na média — é o peso desta fonte na combinação. */
  itens: number;
}

/**
 * Consolida os consumíveis da noite, try a try.
 *
 * Média entre as trys de propósito: poção é por pull e flask cai, então o
 * estado varia dentro da mesma noite — diferente de encanto e gema, que são
 * foto do começo.
 *
 * Um item entra em `missing` quando fica abaixo da meta do core — a mesma
 * régua que a nota usa.
 *
 * O corte era 100 e acusava todo mundo: no log de 15/09 ninguém atinge 100
 * em nenhum consumível (poção tem mediana 32, pedra de vida 34), então a
 * lista saía idêntica pros 17 e não orientava ninguém.
 */
export function aggregateNightPreparation(
  fights: Array<{ players: PlayerFightPreparation[] }>,
  /** Meta do core pra preparação — abaixo disto o item aparece como pendência. */
  meta = 60
): Record<string, NightPreparation> {
  const porJogador = new Map<string, Map<string, { soma: number; trys: number }>>();

  for (const fight of fights) {
    for (const jogador of fight.players) {
      const itens = porJogador.get(jogador.player) ?? new Map();

      for (const item of jogador.itens) {
        const atual = itens.get(item.nome) ?? { soma: 0, trys: 0 };
        atual.soma += item.value;
        atual.trys += 1;
        itens.set(item.nome, atual);
      }

      porJogador.set(jogador.player, itens);
    }
  }

  const resultado: Record<string, NightPreparation> = {};

  for (const [nome, itens] of porJogador) {
    if (itens.size === 0) continue;

    const medias = [...itens].map(([item, { soma, trys }]) => ({
      item,
      media: soma / trys,
    }));

    const score = Math.round(medias.reduce((total, m) => total + m.media, 0) / medias.length);
    const missing = medias
      .filter((m) => Math.round(m.media) < meta)
      .sort((a, b) => a.media - b.media)
      .map((m) => ROTULOS_DE_CONSUMIVEL[m.item] ?? m.item);

    resultado[nome] = { score, missing, itens: medias.length };
  }

  return resultado;
}

/**
 * Junta a preparação das duas fontes numa nota só.
 *
 * Encantos e gemas vêm do gear na WarcraftLogs; consumíveis vêm da curadoria
 * do Wipefest. São coletas diferentes, em momentos diferentes, e por isso a
 * combinação precisa saber o peso de cada lado: sem `checksExistentes`,
 * somar as duas notas daria peso igual a "2 checagens de gear" e "3 de
 * consumível".
 *
 * Qualquer lado pode faltar — spec sem gema no guia, log sem dado do
 * Wipefest — e aí vale o que existe, nunca zero.
 */
export function combinePreparation(
  existente: { score?: number; checks?: number } | undefined,
  consumiveis: { score: number; itens: number } | undefined
): number | undefined {
  const temGear = existente?.score !== undefined && (existente.checks ?? 0) > 0;
  if (!temGear && !consumiveis) return undefined;
  if (!temGear) return consumiveis!.score;
  if (!consumiveis) return existente!.score;

  const pesoGear = existente!.checks!;
  const pesoConsumivel = consumiveis.itens;
  const total =
    existente!.score! * pesoGear + consumiveis.score * pesoConsumivel;

  return Math.round(total / (pesoGear + pesoConsumivel));
}
