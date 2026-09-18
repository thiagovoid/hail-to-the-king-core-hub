/**
 * Conquistas do jogador ao longo da temporada.
 *
 * Cada conquista é apurada POR NOITE e acumulada: quem foi MVP quatro vezes
 * carrega a medalha com um 4. Conquista que ninguém tem ainda aparece
 * travada, com o texto de como se consegue — é o que a transforma em
 * objetivo em vez de placar.
 *
 * Metade delas é zoeira, e isso é de propósito: o ambiente leve é um valor
 * do core, e uma lista só de mérito viraria cobrança. As de zoeira riem de
 * um descuido que todo mundo comete — esquecer a poção, levar o mesmo tapa a
 * noite toda —, nunca de ter custado o wipe.
 */

import type { PerformanceRun, PlayerPerformance, WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import { calculateOverallScore, type FuncaoDoJogador } from "../scores";

export type SimboloDeConquista =
  | "coroa"
  | "espada"
  | "calice"
  | "escudo"
  | "pluma"
  | "engrenagem"
  | "estrela"
  | "frasco"
  | "bota"
  | "alvo"
  | "relogio"
  | "caveira"
  | "folha";

export interface DefinicaoDeConquista {
  id: string;
  nome: string;
  /** O que a pessoa precisa fazer. Aparece também na medalha travada. */
  como: string;
  simbolo: SimboloDeConquista;
  /** Zoeira muda a cor e vai pra outra prateleira na tela. */
  tipo: "boa" | "zoeira";
  /** Disputada = só quem lidera leva. Cumprida = todo mundo que atingir. */
  disputada: boolean;
}

export const CONQUISTAS: DefinicaoDeConquista[] = [
  // ----- mérito -----
  {
    id: "mvp",
    nome: "MVP da noite",
    como: "Ter o maior Score Geral entre quem jogou a noite.",
    simbolo: "coroa",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-dano",
    nome: "Maior dano",
    como: "Ser o maior dano por segundo da noite.",
    simbolo: "espada",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-cura",
    nome: "Maior cura",
    como: "Ser o healer que cobriu mais do dano que o raide tomou na noite.",
    simbolo: "calice",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-defesa",
    nome: "Maior defesa",
    como: "Ter a melhor nota de Defender da noite.",
    simbolo: "escudo",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "nota-maxima",
    nome: "Nota máxima",
    como: "Fechar uma noite com Score Geral 100.",
    simbolo: "estrela",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "relojoeiro",
    nome: "Relojoeiro",
    como: "Manter um cooldown acima de 95% do tempo em recarga numa noite.",
    simbolo: "relogio",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "escoteiro",
    nome: "Escoteiro",
    como: "Chegar numa noite com 100% de preparação. Sempre alerta.",
    simbolo: "pluma",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "mecanicas-impecaveis",
    nome: "Mecânicas impecáveis",
    como: "Fechar a noite sem errar nenhuma mecânica.",
    simbolo: "engrenagem",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "noite-limpa",
    nome: "Noite limpa",
    como: "Atravessar uma noite inteira sem morrer nenhuma vez.",
    simbolo: "folha",
    tipo: "boa",
    disputada: false,
  },

  // ----- zoeira -----
  {
    id: "pocao-que-pocao",
    nome: "Poção? Que poção?",
    como: "Passar a noite inteira sem tomar uma poção sequer.",
    simbolo: "frasco",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "descalco",
    nome: "Descalço",
    como: "Ir pro raide sem encanto na bota.",
    simbolo: "bota",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "colecionador",
    nome: "Colecionador",
    como: "Levar a MESMA mecânica na cara em pelo menos 70% das trys da noite.",
    simbolo: "alvo",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "chao-e-lava",
    nome: "Chão é lava",
    como: "Ser quem mais morreu na noite. Acontece com todo mundo.",
    simbolo: "caveira",
    tipo: "zoeira",
    disputada: true,
  },
];

/** Uma conquista levada, com o texto que explica aquela vez específica. */
export interface ConquistaGanha {
  vezes: number;
  /** Ex.: "Peçonha Sanguínea, em 11 de 12 trys". Só algumas preenchem. */
  detalhe?: string;
}

export type ConquistasPorJogador = Map<string, Map<string, ConquistaGanha>>;

interface Vitoria {
  playerId: string;
  detalhe?: string;
}

/**
 * A mecânica que mais bateu no jogador na noite, se pegou em 70% ou mais das
 * trys.
 *
 * É o que dá nome próprio à zoeira: "Colecionador — Peçonha Sanguínea, em 11
 * de 12 trys" conta uma história que "12 erros mecânicos" não conta.
 */
function mecanicaMaisRepetida(player: PlayerPerformance): { nome: string; tries: number } | null {
  const trysDaNoite = player.mechanics?.tries ?? 0;
  if (trysDaNoite === 0) return null;

  const pior = [...(player.mechanicsDetail ?? [])].sort((a, b) => b.tries - a.tries)[0];
  if (!pior || pior.tries / trysDaNoite < 0.7) return null;

  return { nome: pior.label ?? pior.mechanic.replace("Damage from ", ""), tries: pior.tries };
}

function vencedoresDaRun(
  run: PerformanceRun,
  targets: CorePerformanceTargets,
  funcaoDe?: (playerId: string) => FuncaoDoJogador | undefined
): Map<string, Vitoria[]> {
  const porConquista = new Map<string, Vitoria[]>();
  const simples = (ids: string[]): Vitoria[] => ids.map((playerId) => ({ playerId }));

  /**
   * Empate entrega a todos os empatados. Desempatar por ordem de array daria
   * a medalha a quem por acaso aparece primeiro no arquivo — e essa ordem
   * muda sozinha quando a coleta roda de novo.
   */
  const melhores = (valorDe: (p: PlayerPerformance) => number | null | undefined): string[] => {
    const comValor = run.players
      .map((player) => ({ id: player.playerId, valor: valorDe(player) }))
      .filter((item): item is { id: string; valor: number } => typeof item.valor === "number");

    if (comValor.length === 0) return [];

    const teto = Math.max(...comValor.map((item) => item.valor));
    return comValor.filter((item) => item.valor === teto).map((item) => item.id);
  };

  const cumpriram = (condicao: (p: PlayerPerformance) => boolean): string[] =>
    run.players.filter(condicao).map((player) => player.playerId);

  const score = (player: PlayerPerformance) =>
    calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall;

  porConquista.set("mvp", simples(melhores(score)));
  porConquista.set("maior-dano", simples(melhores((p) => p.dps)));
  porConquista.set("maior-cura", simples(melhores((p) => p.healing?.coverage)));
  porConquista.set("maior-defesa", simples(melhores((p) => p.defense?.score)));
  porConquista.set("chao-e-lava", simples(melhores((p) => p.deaths)));

  porConquista.set("nota-maxima", simples(cumpriram((p) => score(p) === 100)));
  porConquista.set("noite-limpa", simples(cumpriram((p) => p.deaths === 0)));
  porConquista.set("escoteiro", simples(cumpriram((p) => p.preparation === 100)));
  porConquista.set(
    "mecanicas-impecaveis",
    simples(cumpriram((p) => p.mechanics !== undefined && p.mechanics.errors === 0))
  );
  porConquista.set(
    "pocao-que-pocao",
    simples(cumpriram((p) => (p.preparationMissing ?? []).includes("Poção")))
  );
  porConquista.set(
    "descalco",
    simples(cumpriram((p) => (p.preparationMissing ?? []).includes("Botas")))
  );
  porConquista.set(
    "relojoeiro",
    simples(cumpriram((p) => (p.attackDetail ?? []).some((item) => item.efficiency >= 95)))
  );

  porConquista.set(
    "colecionador",
    run.players
      .map((player): Vitoria | null => {
        const pior = mecanicaMaisRepetida(player);
        return pior === null
          ? null
          : {
              playerId: player.playerId,
              detalhe: `${pior.nome}, em ${pior.tries} de ${player.mechanics!.tries} trys`,
            };
      })
      .filter((item): item is Vitoria => item !== null)
  );

  return porConquista;
}

/**
 * Quantas vezes cada jogador levou cada conquista na temporada.
 *
 * Recontado do histórico inteiro a cada build, e não incrementado: assim uma
 * recoleta que corrige uma noite antiga corrige o placar junto, em vez de
 * deixar um número que ninguém sabe de onde veio.
 */
export function contarConquistas(
  weeks: WeeklyPerformance[],
  targets: CorePerformanceTargets,
  funcaoDe?: (playerId: string) => FuncaoDoJogador | undefined
): ConquistasPorJogador {
  const total: ConquistasPorJogador = new Map();

  for (const week of weeks) {
    for (const run of week.runs) {
      for (const [conquistaId, vitorias] of vencedoresDaRun(run, targets, funcaoDe)) {
        for (const vitoria of vitorias) {
          const doJogador = total.get(vitoria.playerId) ?? new Map<string, ConquistaGanha>();
          const anterior = doJogador.get(conquistaId);

          doJogador.set(conquistaId, {
            vezes: (anterior?.vezes ?? 0) + 1,
            // A mais recente manda: numa retrospectiva o que importa é a
            // mecânica que ainda está pegando, não a do primeiro mês.
            detalhe: vitoria.detalhe ?? anterior?.detalhe,
          });

          total.set(vitoria.playerId, doJogador);
        }
      }
    }
  }

  return total;
}
