/**
 * A visão de quem coordena: o core inteiro numa tela.
 *
 * A ficha do jogador responde "como EU estou". Isto responde outra pergunta,
 * que é de quem monta o raide: quem está onde, quem caiu, quem subiu, e onde
 * o grupo está deixando ponto na mesa.
 *
 * Mora na área de administração porque comparar gente lado a lado é
 * exatamente o que as regras do core proíbem na página pública — "as
 * métricas existem pra você competir com você mesmo". A mesma tabela que
 * ajuda a coordenar viraria ranking de vergonha se ficasse aberta.
 */
import type { PlayerPerformance, WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import { calculateOverallScore, funcaoEfetiva, type FuncaoDoJogador } from "../scores";
import { calculateAttendance, getPlayerHistory } from "../metrics";

export interface LinhaDoMacro {
  id: string;
  nome: string;
  funcao: FuncaoDoJogador;
  /** Personagens da mesma pessoa, pra tabela não contar ninguém duas vezes. */
  alts: string[];
  noites: number;
  presenca: number;
  /** A última noite medida, que é o que o Score reflete. */
  ultimaNoite: string | null;
  score: number | null;
  /** Média das noites da temporada — diz se a última foi típica ou ponto fora. */
  scoreMedio: number | null;
  dimensoes: Array<{ chave: string; rotulo: string; nota: number | null; cumpriu: boolean | null }>;
  /** Metas da função que a última noite NÃO cumpriu. É o que orienta a conversa. */
  faltando: string[];
}

export function buildVisaoMacro(
  weeks: WeeklyPerformance[],
  roster: Array<{ id: string; name: string; role: string; pertenceA?: string | null }>,
  targets: CorePerformanceTargets
): LinhaDoMacro[] {
  const porId = new Map(roster.map((jogador) => [jogador.id, jogador]));

  /** Sobe a corrente de `pertenceA` até o main. O teto evita ciclo. */
  const donoDe = (id: string): string => {
    let atual = porId.get(id);
    let passos = 0;
    while (atual?.pertenceA && passos < roster.length) {
      const acima = porId.get(atual.pertenceA);
      if (!acima || acima.id === atual.id) break;
      atual = acima;
      passos += 1;
    }
    return atual?.id ?? id;
  };

  const personagensDa = new Map<string, string[]>();
  for (const jogador of roster) {
    const dono = donoDe(jogador.id);
    personagensDa.set(dono, [...(personagensDa.get(dono) ?? []), jogador.id]);
  }

  const linhas: LinhaDoMacro[] = [];

  for (const jogador of roster) {
    // Uma linha por PESSOA: o alt entraria com a mesma presença e dividiria
    // a temporada dela em duas metades.
    if (donoDe(jogador.id) !== jogador.id) continue;

    const personagens = personagensDa.get(jogador.id) ?? [jogador.id];
    const historico = personagens
      .flatMap((id) => getPlayerHistory(weeks, id))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (historico.length === 0) continue;

    const ultima = historico.at(-1)!;
    const papel = jogador.role as FuncaoDoJogador;
    const nota = (noite: PlayerPerformance) => calculateOverallScore(noite, targets, papel);

    const score = nota(ultima);
    const medias = historico.map((noite) => nota(noite).overall).filter((v): v is number => v !== null);

    linhas.push({
      id: jogador.id,
      nome: jogador.name,
      funcao: funcaoEfetiva(ultima, papel),
      alts: personagens.filter((id) => id !== jogador.id),
      noites: historico.length,
      presenca: calculateAttendance(weeks, personagens),
      ultimaNoite: ultima.date,
      score: score.overall,
      scoreMedio:
        medias.length === 0 ? null : Math.round(medias.reduce((s, v) => s + v, 0) / medias.length),
      dimensoes: score.dimensions
        .filter((d) => d.weight > 0)
        .map((d) => ({
          chave: d.key,
          rotulo: d.label,
          nota: d.score,
          cumpriu:
            d.value === null
              ? null
              : d.target.direction === "lower"
                ? d.value <= d.target.target
                : d.value >= d.target.target,
        })),
      faltando: score.dimensions
        .filter(
          (d) =>
            d.weight > 0 &&
            d.value !== null &&
            (d.target.direction === "lower" ? d.value > d.target.target : d.value < d.target.target)
        )
        .map((d) => d.label),
    });
  }

  // Pior primeiro: quem coordena abre esta tela pra achar quem precisa de
  // conversa, não pra admirar o topo.
  return linhas.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
}
