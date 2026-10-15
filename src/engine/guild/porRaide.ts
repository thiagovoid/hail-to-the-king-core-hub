/**
 * A noite de um jogador, fatiada por raide.
 *
 * A temporada passou a ter duas raides abertas ao mesmo tempo, e uma noite
 * pode encostar nas duas. Os números da noite, porém, são agregados: "3,5
 * erros por try" é sobre a noite inteira, não sobre uma raide.
 *
 * Nem tudo dá pra fatiar, e essa fronteira é o ponto deste arquivo.
 *
 * **Fatiável, e exato.** Morte e mecânica são contagens por boss, guardadas
 * com o `encounterID` (ou com o nome do boss) ao lado. Somar as fatias de
 * todas as raides devolve o número da noite — conferido nos 208 registros
 * da temporada, sem uma divergência.
 *
 * **Não fatiável.** DPS e parse vêm da tabela agregada da WarcraftLogs
 * sobre os fights da noite, e não da soma dos bosses. Refazer a conta a
 * partir do que está guardado — média do dps por boss, ponderada pelas
 * trys — erra: em 35 dos 165 registros ela diverge do valor da noite, uma
 * delas em 218%. Fatiar isso de verdade exige pedir a tabela à WCL uma vez
 * por raide, na coleta. Enquanto não existir, é melhor não oferecer o
 * número do que oferecer um que não fecha.
 */

export interface PersonagemDaNoite {
  bossTries?: Array<{ encounterID: number; tries: number; deaths?: number }>;
  mechanicsDetail?: Array<{ boss: string; tries: number }>;
  /** Só a presença importa aqui: é o que diz se a noite teve coleta. */
  mechanics?: { errors: number; tries?: number };
  deaths?: number;
}

/** Por onde se sabe a que raide um boss pertence. */
export interface MapaDeRaides {
  /** `encounterID` -> slug da raide. */
  porEncontro: Map<number, string>;
  /** Nome do boss -> slug da raide. É o que `mechanicsDetail` traz. */
  porNome: Map<string, string>;
}

export interface FatiaDeRaide {
  /** Trys do jogador nessa raide, naquela noite. */
  tries: number;
  /** Mortes nessa raide. */
  deaths: number;
  /**
   * Erros de mecânica por try, só dessa raide. Null quando a noite não tem
   * mecânica coletada — sem isso, "0 erros" mentiria sobre uma coleta que
   * não aconteceu.
   */
  mechanics: number | null;
}

/** Monta os dois mapas a partir das listas de boss da temporada. */
export function mapaDeRaides(
  bosses: Array<{ encounterID: number; name: string; raid: string }>
): MapaDeRaides {
  const porEncontro = new Map<number, string>();
  const porNome = new Map<string, string>();

  for (const boss of bosses) {
    porEncontro.set(boss.encounterID, boss.raid);
    porNome.set(boss.name, boss.raid);
  }

  return { porEncontro, porNome };
}

/** Uma casa decimal, a mesma régua com que a noite foi gravada. */
const umaCasa = (valor: number) => Math.round(valor * 10) / 10;

/**
 * As fatias da noite, uma por raide que o jogador encostou.
 *
 * Raide em que ele não pisou não vira fatia vazia: ela simplesmente não
 * aparece, e o gráfico fica sem ponto naquela noite — que é a verdade.
 */
export function fatiarNoite(
  personagem: PersonagemDaNoite,
  mapa: MapaDeRaides
): Map<string, FatiaDeRaide> {
  const fatias = new Map<string, { tries: number; deaths: number; errosBrutos: number }>();

  for (const boss of personagem.bossTries ?? []) {
    const raide = mapa.porEncontro.get(boss.encounterID);
    if (raide === undefined) continue;

    const atual = fatias.get(raide) ?? { tries: 0, deaths: 0, errosBrutos: 0 };
    atual.tries += boss.tries ?? 0;
    atual.deaths += boss.deaths ?? 0;
    fatias.set(raide, atual);
  }

  for (const detalhe of personagem.mechanicsDetail ?? []) {
    const raide = mapa.porNome.get(detalhe.boss);
    if (raide === undefined) continue;

    const atual = fatias.get(raide);
    // Mecânica de boss onde ele não registrou try é contradição do dado:
    // conta mesmo assim, porque o erro aconteceu.
    if (atual === undefined) {
      fatias.set(raide, { tries: 0, deaths: 0, errosBrutos: detalhe.tries ?? 0 });
      continue;
    }
    atual.errosBrutos += detalhe.tries ?? 0;
  }

  const temMecanica = personagem.mechanics !== undefined;
  const resultado = new Map<string, FatiaDeRaide>();

  for (const [raide, bruto] of fatias) {
    resultado.set(raide, {
      tries: bruto.tries,
      deaths: bruto.deaths,
      mechanics:
        temMecanica && bruto.tries > 0 ? umaCasa(bruto.errosBrutos / bruto.tries) : null,
    });
  }

  return resultado;
}

/**
 * De que raide foi a noite.
 *
 * Fatiar métrica por métrica resolve morte e mecânica e empaca em dps e
 * parse, que vêm da tabela agregada da noite. Mas a pergunta muda de
 * figura quando a noite inteira é de uma raide só: aí o agregado da noite
 * JÁ é o da raide, e todo número continua exato, sem refazer conta nenhuma.
 *
 * Nas quatorze noites da temporada, nenhuma tocou as duas — o core abre um
 * tier, limpa, e volta. `mista` existe porque isso vai acontecer um dia
 * (farm da antiga seguido de pull na nova), e nesse dia é melhor a noite
 * ficar de fora de uma visão por raide do que entrar inteira nas duas.
 */
export type RaideDaNoite =
  | { tipo: "uma"; raide: string }
  | { tipo: "mista"; raides: string[] }
  | { tipo: "sem-dado" };

export function raideDaNoite(
  players: PersonagemDaNoite[],
  mapa: MapaDeRaides
): RaideDaNoite {
  const vistas = new Set<string>();

  for (const personagem of players) {
    for (const boss of personagem.bossTries ?? []) {
      const raide = mapa.porEncontro.get(boss.encounterID);
      if (raide !== undefined) vistas.add(raide);
    }
  }

  if (vistas.size === 0) return { tipo: "sem-dado" };
  if (vistas.size === 1) return { tipo: "uma", raide: [...vistas][0] };
  return { tipo: "mista", raides: [...vistas].sort() };
}
