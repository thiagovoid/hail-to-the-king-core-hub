/**
 * Conquistas do jogador ao longo da temporada.
 *
 * Cada conquista é apurada POR NOITE e acumulada: quem foi MVP quatro vezes
 * carrega a medalha com um 4. Conquista que ninguém tem ainda não é erro —
 * aparece travada, com o texto de como se consegue, e é assim que ela vira
 * objetivo em vez de enfeite.
 *
 * O que é "ganhar" depende do tipo: algumas são disputadas (o maior dano da
 * noite é de uma pessoa só) e outras são cumpridas (não morrer não tira de
 * ninguém). As duas coisas convivem aqui, e a diferença está escrita no
 * texto de cada uma.
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
  | "estrela";

export interface DefinicaoDeConquista {
  id: string;
  nome: string;
  /** O que a pessoa precisa fazer. Aparece na medalha travada. */
  como: string;
  simbolo: SimboloDeConquista;
  /** Disputada = só um ganha por noite. Cumprida = todo mundo que atingir. */
  disputada: boolean;
}

export const CONQUISTAS: DefinicaoDeConquista[] = [
  {
    id: "mvp",
    nome: "MVP da noite",
    como: "Ter o maior Score Geral entre quem jogou a noite.",
    simbolo: "coroa",
    disputada: true,
  },
  {
    id: "maior-dano",
    nome: "Maior dano",
    como: "Ser o maior dano por segundo da noite.",
    simbolo: "espada",
    disputada: true,
  },
  {
    id: "maior-cura",
    nome: "Maior cura",
    como: "Ser o healer que cobriu mais do dano que o raide tomou na noite.",
    simbolo: "calice",
    disputada: true,
  },
  {
    id: "maior-defesa",
    nome: "Maior defesa",
    como: "Ter a melhor nota de Defender da noite.",
    simbolo: "escudo",
    disputada: true,
  },
  {
    id: "nota-maxima",
    // Não se chama "Hail Score" porque esse nome é do número do CORE; o do
    // jogador é o Score Geral, e misturar os dois confundiria as duas telas.
    nome: "Nota máxima",
    como: "Fechar uma noite com Score Geral 100.",
    simbolo: "estrela",
    disputada: false,
  },
  {
    id: "noite-limpa",
    nome: "Noite limpa",
    como: "Atravessar uma noite inteira sem morrer nenhuma vez.",
    simbolo: "pluma",
    disputada: false,
  },
  {
    id: "mecanicas-impecaveis",
    nome: "Mecânicas impecáveis",
    como: "Fechar a noite sem errar nenhuma mecânica.",
    simbolo: "engrenagem",
    disputada: false,
  },
];

/** Quem ganhou cada conquista numa noite. Vazio quando ninguém ganhou. */
function vencedoresDaRun(
  run: PerformanceRun,
  targets: CorePerformanceTargets,
  funcaoDe?: (playerId: string) => FuncaoDoJogador | undefined
): Map<string, string[]> {
  const porConquista = new Map<string, string[]>();

  /**
   * Empate entrega a todos os empatados. Desempatar por ordem de array
   * daria a medalha a quem por acaso aparece primeiro no arquivo — o que
   * muda sozinho quando a coleta roda de novo.
   */
  const melhores = (valorDe: (p: PlayerPerformance) => number | null | undefined): string[] => {
    const comValor = run.players
      .map((player) => ({ id: player.playerId, valor: valorDe(player) }))
      .filter((item): item is { id: string; valor: number } => typeof item.valor === "number");

    if (comValor.length === 0) return [];

    const teto = Math.max(...comValor.map((item) => item.valor));
    return comValor.filter((item) => item.valor === teto).map((item) => item.id);
  };

  porConquista.set(
    "mvp",
    melhores((player) => calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall)
  );
  porConquista.set("maior-dano", melhores((player) => player.dps));
  porConquista.set("maior-cura", melhores((player) => player.healing?.coverage));
  porConquista.set("maior-defesa", melhores((player) => player.defense?.score));

  porConquista.set(
    "nota-maxima",
    run.players
      .filter(
        (player) =>
          calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall === 100
      )
      .map((player) => player.playerId)
  );

  porConquista.set(
    "noite-limpa",
    run.players.filter((player) => player.deaths === 0).map((player) => player.playerId)
  );

  porConquista.set(
    "mecanicas-impecaveis",
    run.players
      .filter((player) => player.mechanics !== undefined && player.mechanics.errors === 0)
      .map((player) => player.playerId)
  );

  return porConquista;
}

export type ConquistasPorJogador = Map<string, Map<string, number>>;

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
      for (const [conquistaId, vencedores] of vencedoresDaRun(run, targets, funcaoDe)) {
        for (const playerId of vencedores) {
          const doJogador = total.get(playerId) ?? new Map<string, number>();
          doJogador.set(conquistaId, (doJogador.get(conquistaId) ?? 0) + 1);
          total.set(playerId, doJogador);
        }
      }
    }
  }

  return total;
}
