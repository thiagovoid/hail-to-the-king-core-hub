/**
 * A meta de mecânicas, tirada do próprio grupo.
 *
 * A meta era fixa: 1,4 mecânicas distintas erradas por try, toda noite, pra
 * todo mundo. O problema é que o Wipefest não mede "você errou" — mede
 * "você tomou dano disso". Dos 1032 registros da temporada, 1029 são
 * literalmente "Damage from X". E tem mecânica em que tomar dano é o jogo:
 * a Peçonha Sanguínea é soak, o debuff expira e larga a poça no seu pé; as
 * Gotículas Tóxicas você PRECISA pisar pra limpar a sala.
 *
 * Numa noite do jrxamã, 0,92 dos 1,42 erros dele — 65% — vinham dessas
 * duas. Ele estava encostado no limite por cumprir a mecânica direito.
 *
 * A régua fixa também não sabia a diferença entre uma noite e outra. A
 * mediana real do grupo variou de 0,44 (18/08, noite limpa) a 1,90 (25/08,
 * progressão): 4,3 vezes. O 1,4 punia quem estava aprendendo e dava 115 de
 * graça na noite em que todo mundo já sabia.
 *
 * Aqui a meta passa a ser o que o GRUPO fez no MESMO boss na MESMA noite.
 * Imposto que atinge todo mundo some sozinho, sem precisar de curadoria de
 * mecânica por mecânica — e não some quem come a mesma mecânica muito mais
 * que os colegas, que é o erro que interessa.
 */
import type { PlayerPerformance, WeeklyPerformance } from "../types/performance";

/**
 * Quanto melhor que o cara do meio é preciso ser.
 *
 * Sem margem, a mediana bate a meta por construção e metade do raide sai com
 * 100. Com 0,95 a distribuição fica onde estava antes desta mudança (45% das
 * noites com 100+, contra 46%) — a FORMA da régua muda, o nível não. Apertar
 * é uma decisão separada, e esse é o número que se mexe pra isso.
 */
export const MARGEM_SOBRE_A_MEDIANA = 0.95;

/**
 * A meta nunca fica mais apertada que isto.
 *
 * Sem piso, a noite muito limpa vira navalha: em 18/08 a mediana do grupo foi
 * 0,44, e quem fez 0,75 erro por try — menos de um erro por try — cairia de
 * 115 pra 53. Isso é castigar quem foi bem num grupo que foi ótimo. Abaixo de
 * 0,6 por try a noite está boa, e não interessa o que os outros fizeram.
 */
export const PISO_DA_META = 0.6;

/** Do `insightId` da URL do Wipefest sai o encounterID: "3445-V" -> 3445. */
function encounterDaUrl(tipEmbedUrl: string | undefined): number | null {
  const achado = /insightId=(\d+)-/.exec(tipEmbedUrl ?? "");
  return achado ? Number(achado[1]) : null;
}

/**
 * Nome do boss -> encounterID, aprendido dos registros que trazem o id.
 *
 * Nem todo `tipEmbedUrl` tem `insightId`: em 10/09 as 19 mecânicas do Ula'tek
 * vieram sem, e ficavam de fora da referência enquanto continuavam contando
 * no `errors` de cada um. Denominador menor que o numerador derruba a nota
 * por defeito de parsing, não por jogo — foi o que fez a implementação
 * divergir da simulação que aprovou esta mudança.
 *
 * O mesmo boss aparece COM id em outra noite, então o nome resolve.
 */
export function mapaDeBosses(semanas: WeeklyPerformance[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const semana of semanas) {
    for (const noite of semana.runs) {
      for (const jogador of noite.players ?? []) {
        for (const detalhe of jogador.mechanicsDetail ?? []) {
          const encounter = encounterDaUrl(detalhe.tipEmbedUrl);
          if (encounter !== null && detalhe.boss) mapa.set(detalhe.boss, encounter);
        }
      }
    }
  }
  return mapa;
}

const encounterDoDetalhe = (
  detalhe: { boss?: string; tipEmbedUrl?: string },
  porNome: Map<string, number>
): number | null =>
  encounterDaUrl(detalhe.tipEmbedUrl) ??
  (detalhe.boss ? (porNome.get(detalhe.boss) ?? null) : null);

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length / 2;
  return ordenados.length % 2
    ? ordenados[Math.floor(meio)]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Taxa de cada jogador em cada boss: mecânicas tomadas ÷ trys naquele boss.
 *
 * Quem esteve no boss e não tomou nada entra com ZERO. Sem isso a referência
 * sairia só de quem errou e viria alta demais — o grupo inteiro pareceria
 * pior do que foi, e a meta afrouxaria junto.
 */
function taxasPorBoss(
  jogador: PlayerPerformance,
  porNome: Map<string, number>
): Map<number, number> {
  const trysDoBoss = new Map((jogador.bossTries ?? []).map((b) => [b.encounterID, b.tries]));

  const tomadas = new Map<number, number>();
  for (const detalhe of jogador.mechanicsDetail ?? []) {
    const encounter = encounterDoDetalhe(detalhe, porNome);
    if (encounter === null || !trysDoBoss.has(encounter)) continue;
    tomadas.set(encounter, (tomadas.get(encounter) ?? 0) + detalhe.tries);
  }

  const taxas = new Map<number, number>();
  for (const [encounter, trys] of trysDoBoss) {
    taxas.set(encounter, trys > 0 ? (tomadas.get(encounter) ?? 0) / trys : 0);
  }
  return taxas;
}

/**
 * A meta de cada jogador daquela noite.
 *
 * Ponderada pelos trys DELE em cada boss: quem fez onze trys do boss difícil
 * e um do fácil não pode ser medido pela mistura de quem fez o contrário.
 *
 * Volta vazio quando a noite não tem `mechanicsDetail` nem `bossTries` — aí
 * não há como montar referência, e quem chama fica com a meta fixa do
 * arquivo da temporada.
 */
export function metasDeMecanicas(
  jogadores: PlayerPerformance[],
  porNome: Map<string, number> = new Map()
): Map<string, number> {
  const elegiveis = jogadores.filter((j) => j.mechanics && (j.bossTries?.length ?? 0) > 0);
  if (elegiveis.length === 0) return new Map();

  const porJogador = new Map(elegiveis.map((j) => [j.playerId, taxasPorBoss(j, porNome)]));

  const referencia = new Map<number, number>();
  const bosses = new Set([...porJogador.values()].flatMap((t) => [...t.keys()]));
  for (const encounter of bosses) {
    const taxas = [...porJogador.values()]
      .filter((t) => t.has(encounter))
      .map((t) => t.get(encounter)!);
    referencia.set(encounter, mediana(taxas));
  }

  const metas = new Map<string, number>();
  for (const jogador of elegiveis) {
    let somaDaReferencia = 0;
    let trysTotais = 0;
    for (const boss of jogador.bossTries ?? []) {
      somaDaReferencia += (referencia.get(boss.encounterID) ?? 0) * boss.tries;
      trysTotais += boss.tries;
    }
    if (trysTotais === 0) continue;

    const doGrupo = (somaDaReferencia / trysTotais) * MARGEM_SOBRE_A_MEDIANA;
    metas.set(jogador.playerId, Math.round(Math.max(doGrupo, PISO_DA_META) * 100) / 100);
  }

  return metas;
}

/**
 * A semana com a meta de mecânicas preenchida em cada jogador.
 *
 * A referência é por NOITE, não por semana: a mediana de uma terça de
 * progressão não tem nada a ver com a de uma quinta de farm, e foi
 * justamente essa diferença (0,44 contra 1,90) que motivou a mudança.
 *
 * Deriva, não coleta: sai do que já está arquivado, então vale pras noites
 * antigas sem precisar recoletar nada. Por isso roda no carregador das
 * semanas, e não num script de coleta.
 */
export function comMetaDeMecanicas(
  semana: WeeklyPerformance,
  porNome: Map<string, number> = new Map()
): WeeklyPerformance {
  return {
    ...semana,
    runs: semana.runs.map((noite) => {
      const metas = metasDeMecanicas(noite.players ?? [], porNome);
      if (metas.size === 0) return noite;

      return {
        ...noite,
        players: (noite.players ?? []).map((jogador) => {
          const meta = metas.get(jogador.playerId);
          if (meta === undefined || !jogador.mechanics) return jogador;
          return { ...jogador, mechanics: { ...jogador.mechanics, meta } };
        }),
      };
    }),
  };
}
