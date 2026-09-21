/**
 * A retrospectiva da temporada, no formato de stories.
 *
 * É celebração e zoeira, não avaliação: a ficha do jogador já cobra. Aqui o
 * que vale é o número que rende história — "você levou uma pancada de 107%
 * da sua vida" conta algo sozinho, "seu uptime médio foi 91,8%" não.
 *
 * Duas regras que moldaram a seleção, as duas vindas do dado:
 *
 * 1. **Nada que só acuse.** "Sua pior noite" e "sua evolução" quando ela é
 *    negativa marcam a pessoa sem ensinar nada. Evolução só entra quando
 *    sobe; o resto do que desce fica na ficha, onde tem contexto.
 *
 * 2. **Nada que não separe ninguém.** "Noites fora de função" dá 7 de 7 pra
 *    todo mundo — é verdade e não é prêmio. Ficou de fora.
 *
 * Comparação com o resto do core entra aqui de propósito, ao contrário da
 * página pública: numa retrospectiva o "você foi o 2º que mais interrompeu"
 * é o coração do formato. Decisão do core de 21/09/2026.
 */
import type { PlayerPerformance, WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import { calculateOverallScore, type FuncaoDoJogador } from "../scores";
import { getPlayerHistory } from "../metrics";

export interface Slide {
  /** Identifica o desenho. Cada um tem layout próprio no renderizador. */
  tipo:
    | "abertura"
    | "numero"
    | "nemesis"
    | "pancada"
    | "ranking"
    | "evolucao"
    | "fechamento";
  /** A linha pequena de cima, que prepara o número. */
  chapeu: string;
  /** O número ou nome que é o assunto do slide. */
  destaque: string;
  /** A unidade ou o complemento, quando o destaque sozinho não fecha. */
  unidade?: string;
  /** A linha de baixo, onde mora a graça ou o contexto. */
  rodape?: string;
}

export interface Retrospectiva {
  id: string;
  nome: string;
  temporada: string;
  slides: Slide[];
}

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

const minutos = (segundos: number): string => {
  const m = Math.round(segundos / 60);
  return m < 1 ? `${Math.round(segundos)} segundos` : `${m} ${plural(m, "minuto", "minutos")}`;
};

/** O maior de uma lista, por um critério. Undefined quando a lista é vazia. */
function maiorPor<T>(lista: T[], valor: (item: T) => number): T | undefined {
  if (lista.length === 0) return undefined;
  return lista.reduce((melhor, item) => (valor(item) > valor(melhor) ? item : melhor));
}

/** Conta ocorrências e devolve do mais frequente pro menos. */
function ranking(itens: string[]): Array<[string, number]> {
  const contagem = new Map<string, number>();
  for (const item of itens) contagem.set(item, (contagem.get(item) ?? 0) + 1);
  return [...contagem].sort((a, b) => b[1] - a[1]);
}

const ORDINAL = ["1º", "2º", "3º", "4º", "5º"];

export function buildRetrospectiva(
  playerId: string,
  personagens: string[],
  nome: string,
  funcao: FuncaoDoJogador,
  weeks: WeeklyPerformance[],
  targets: CorePerformanceTargets,
  nomeDoBoss: Map<number, string>,
  temporada: string,
  /** O core inteiro, pro ranking. `id` aqui é a PESSOA, não o personagem. */
  coreInteiro: Map<string, { dispels: number; interrupts: number; bossKills: number }>
): Retrospectiva | null {
  const historico = personagens
    .flatMap((id) => getPlayerHistory(weeks, id))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (historico.length === 0) return null;

  const soma = (campo: (noite: PlayerPerformance) => number | undefined) =>
    historico.reduce((total, noite) => total + (campo(noite) ?? 0), 0);

  const slides: Slide[] = [];

  slides.push({
    tipo: "abertura",
    chapeu: temporada,
    destaque: nome,
    rodape: `${historico.length} ${plural(historico.length, "noite de raide", "noites de raide")}`,
  });

  // ---- Volume: o esforço bruto, que é o que ninguém lembra de somar ----
  const trys = soma((n) => n.tries?.present);
  const kills = soma((n) => n.bossKills?.length);
  if (trys > 0) {
    slides.push({
      tipo: "numero",
      chapeu: "Você encarou",
      destaque: String(trys),
      unidade: plural(trys, "try", "trys"),
      rodape: `e derrubou ${kills} ${plural(kills, "boss", "bosses")}`,
    });
  }

  // ---- O botão favorito ----
  const usosPorMagia = new Map<string, number>();
  for (const noite of historico) {
    for (const magia of [
      ...(noite.attackDetail ?? []),
      ...(noite.defenseDetail ?? []),
      ...(noite.helpDetail ?? []),
    ]) {
      usosPorMagia.set(magia.name, (usosPorMagia.get(magia.name) ?? 0) + (magia.casts ?? 0));
    }
  }
  const favorita = [...usosPorMagia].sort((a, b) => b[1] - a[1])[0];
  if (favorita && favorita[1] > 0) {
    slides.push({
      tipo: "numero",
      chapeu: "Seu botão favorito",
      destaque: favorita[0],
      rodape: `${favorita[1]} vezes. Seu dedo merece férias.`,
    });
  }

  // ---- A nêmesis: o que mais te matou ----
  const mortes = historico.flatMap((noite) => noite.deathDetail ?? []);
  const causas = ranking(
    mortes.map((morte) => morte.ability).filter((a): a is string => Boolean(a) && a !== "Melee")
  );
  if (causas.length > 0 && causas[0][1] > 1) {
    slides.push({
      tipo: "nemesis",
      chapeu: "Sua nêmesis",
      destaque: causas[0][0],
      rodape: `te matou ${causas[0][1]} vezes. Vocês têm história.`,
    });
  }

  // ---- A maior pancada ----
  const pancadas = historico.flatMap((noite) => noite.pancadas ?? []);
  const pior = maiorPor(
    pancadas.filter((p) => p.fatiaDaVida !== undefined),
    (p) => p.fatiaDaVida ?? 0
  );
  if (pior?.fatiaDaVida !== undefined) {
    slides.push({
      tipo: "pancada",
      chapeu: "A maior porrada que você levou",
      destaque: `${pior.fatiaDaVida}%`,
      unidade: "da sua vida",
      rodape:
        pior.fatiaDaVida >= 100
          ? `${pior.ability ?? "Um golpe"}, de uma vez só. Nem deu tempo de pensar.`
          : `${pior.ability ?? "Um golpe"}, num único golpe.`,
    });
  }

  // ---- O boss mais teimoso ----
  const trysPorBoss = new Map<string, number>();
  for (const noite of historico) {
    for (const boss of noite.bossTries ?? []) {
      const chave = nomeDoBoss.get(boss.encounterID) ?? `Encontro ${boss.encounterID}`;
      trysPorBoss.set(chave, (trysPorBoss.get(chave) ?? 0) + boss.tries);
    }
  }
  const teimoso = [...trysPorBoss].sort((a, b) => b[1] - a[1])[0];
  if (teimoso && teimoso[1] >= 5) {
    slides.push({
      tipo: "numero",
      chapeu: "O boss que não te deixava em paz",
      destaque: teimoso[0],
      rodape: `${teimoso[1]} trys. Sonhou com ele, admita.`,
    });
  }

  // ---- Tempo morto: o dado que a ficha tirou e mandou pra cá ----
  const tempoMorto = soma((n) => n.deathCost?.seconds);
  if (tempoMorto >= 60) {
    slides.push({
      tipo: "numero",
      chapeu: "O raide seguiu lutando sem você por",
      destaque: minutos(tempoMorto),
      rodape: "Deu tempo de tomar um café. Vários.",
    });
  }

  // ---- Kills sem morrer ----
  const tries = historico.flatMap((noite) => noite.bossTries ?? []);
  const limpos = tries.filter((t) => t.flawless).length;
  const comKill = tries.filter((t) => t.killed).length;
  if (comKill > 0) {
    slides.push({
      tipo: "numero",
      chapeu: "Kills em que você não caiu",
      destaque: `${limpos} de ${comKill}`,
      rodape:
        limpos === comKill
          ? "Nenhuma morte. Nenhuma."
          : `${comKill - limpos} ${plural(comKill - limpos, "vez você viu o chão", "vezes você viu o chão")}.`,
    });
  }

  // ---- Utilidade, com o ranking do core ----
  const dispels = soma((n) => n.utility?.dispels);
  if (dispels > 0) {
    const posicao =
      [...coreInteiro.values()].filter((outro) => outro.dispels > dispels).length + 1;
    slides.push({
      tipo: "ranking",
      chapeu: "Debuffs que você tirou de alguém",
      destaque: String(dispels),
      rodape:
        posicao <= 3
          ? `${ORDINAL[posicao - 1]} do core. Obrigado por existir.`
          : `${posicao}º do core.`,
    });
  }

  const levantado = soma((n) => n.utility?.battleRezRecebidos);
  if (levantado > 0) {
    slides.push({
      tipo: "numero",
      chapeu: "Vezes que te levantaram do chão",
      destaque: String(levantado),
      rodape: "Alguém gastou uma carga em você. Retribua.",
    });
  }

  // ---- A melhor noite ----
  const notas = historico.map((noite) => ({
    date: noite.date,
    nota: calculateOverallScore(noite, targets, funcao).overall,
  }));
  const melhor = maiorPor(
    notas.filter((n): n is { date: string; nota: number } => n.nota !== null),
    (n) => n.nota
  );
  if (melhor) {
    const [ano, mes, dia] = melhor.date.split("-");
    slides.push({
      tipo: "numero",
      chapeu: "Sua melhor noite",
      destaque: String(melhor.nota),
      unidade: "de Score",
      rodape: `em ${dia}/${mes}/${ano}`,
    });
  }

  // ---- Evolução: SÓ quando sobe ----
  const primeira = notas[0]?.nota;
  const ultima = notas.at(-1)?.nota;
  if (primeira !== null && primeira !== undefined && ultima !== null && ultima !== undefined) {
    const delta = ultima - primeira;
    // Cinco pontos pra não celebrar ruído de boss e de composição.
    if (delta >= 5) {
      slides.push({
        tipo: "evolucao",
        chapeu: "Da primeira noite pra última",
        destaque: `+${delta}`,
        unidade: "pontos",
        rodape: `${primeira} → ${ultima}. Isso é melhorar.`,
      });
    }
  }

  // ---- Fechamento ----
  const inicial = historico.find((n) => n.itemLevel !== undefined)?.itemLevel;
  const atual = [...historico].reverse().find((n) => n.itemLevel !== undefined)?.itemLevel;
  slides.push({
    tipo: "fechamento",
    chapeu: "Até a próxima temporada",
    destaque: nome,
    rodape:
      inicial !== undefined && atual !== undefined && atual > inicial
        ? `Item level ${inicial} → ${atual}. Nos vemos terça.`
        : "Nos vemos terça.",
  });

  return { id: playerId, nome, temporada, slides };
}
