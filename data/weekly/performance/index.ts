import type { WeeklyPerformance } from "../../../src/types/performance";
import { comMetaDeMecanicas, mapaDeBosses } from "../../../src/normalization/metaDeMecanicas";
import { sortByWeek } from "../index";

const modules = import.meta.glob<{ default: WeeklyPerformance }>("./week-*.json", {
  eager: true,
});

/**
 * As semanas com a meta de mecânicas já derivada.
 *
 * A meta sai da mediana do grupo no mesmo boss na mesma noite, e por isso só
 * dá pra calcular com a noite INTEIRA na mão — o arquivo de cada jogador não
 * sabe o que os outros fizeram. Aqui é o único ponto por onde todo mundo lê
 * as semanas, então derivar aqui vale pro site, pro admin e pros testes de
 * uma vez, e vale pras noites antigas sem recoletar nada.
 */
const semanas = sortByWeek(modules);

/**
 * O mapa nome-do-boss -> encounterID sai da TEMPORADA inteira, não da noite.
 *
 * Parte dos registros do Wipefest vem sem `insightId` na URL; o mesmo boss
 * aparece com id em outra noite, e aí o nome resolve. Montar por noite
 * deixaria de fora justamente a noite em que o id faltou pra todo mundo —
 * que foi o caso do Ula'tek em 03/09 e 10/09.
 */
const bosses = mapaDeBosses(semanas);

export const performanceWeeks: WeeklyPerformance[] = semanas.map((semana) =>
  comMetaDeMecanicas(semana, bosses)
);
