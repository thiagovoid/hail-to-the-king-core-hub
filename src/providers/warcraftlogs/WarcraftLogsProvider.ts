import type { DataProvider, ProviderResult } from "../types";
import { wclGraphql } from "./client";
import { maioresPancadas, type PancadaLevada } from "./biggestHits";
import type { EventoDeCast } from "./cooldownUsage";
import { selectAggregateFights } from "./normalize";
import type { WclFight, WclFightTables, WclProfile, WclRankingEntry } from "./normalize";
import type { WclReportRankings } from "./reportRankings";

/** Um evento de interrupção ou de dispel. Quem fez, em quem, com o quê. */
export interface EventoDeUtilidade {
  timestamp: number;
  sourceID: number;
  targetID: number;
  /** A magia usada pra interromper/dissipar. */
  abilityGameID: number;
  /** A magia que foi interrompida ou dissipada. */
  extraAbilityGameID?: number;
  fight: number;
  /** Só em dispel: se o que saiu era buff do inimigo em vez de debuff nosso. */
  isBuff?: boolean;
}

/**
 * Quantas vezes uma magia inimiga foi COMEÇADA numa try.
 *
 * Contagem e não evento: a pergunta é "houve oportunidade, e quantas?", e a
 * resposta cabe numa linha por magia por try.
 */
export interface ContagemDeCastInimigo {
  fight: number;
  abilityGameID: number;
  casts: number;
}

export interface WclReportRef {
  code: string;
  startTime: number;
  zone?: { id: number } | null;
  owner?: { id: number } | null;
}

/**
 * Context for the "give me everything about this report" fetch: which
 * report, and which encounters actually belong to the current raid tier
 * (a report can contain trash/other-zone fights we don't care about).
 */
export interface WarcraftLogsReportContext {
  reportCode: string;
  validEncounterIds: Set<number>;
}

export interface WarcraftLogsRawReportTables {
  fights: WclFight[];
  raidFights: WclFight[];
  killedFights: WclFight[];
  aggregateFightIds: number[];
  allFightIds: number[];
  aggregateTables: WclFightTables;
  fullTables: WclFightTables;
  /** Lutas sem boss — o caminho entre um encontro e outro. */
  trashFights?: WclFight[];
  /** Tabelas do trash somado. Null quando o log não gravou trash nenhum. */
  trashTables?: WclFightTables | null;
  /** Toda morte da noite, com a try em que aconteceu. */
  deathEvents?: Array<{
    fight: number;
    targetID: number;
    timestamp: number;
    /** O que deu o golpe final. É o que dá CAUSA à morte, não só hora. */
    killingAbilityGameID?: number;
  }>;
  /** Dano por ator em CADA try, como pares (Map não sobrevive ao JSON). */
  damagePerFight?: Array<{ fightId: number; entries: Array<{ actorId: number; total: number }> }>;
  /**
   * `actorId` -> nome, como pares. Sem isso todo evento vira número solto.
   */
  actorNames?: Array<[number, string]>;
  /**
   * gameID -> nome de TODA habilidade do relatório, inclusive inimiga.
   *
   * Vem de graça no mesmo masterData dos atores, e é a única fonte sem
   * truncagem: a tabela agregada de dano recebido corta em 5 habilidades por
   * alvo, e a que matou raramente está entre as 5 maiores — metade das
   * mortes da temporada não sabia dizer de quê.
   */
  abilityNames?: Array<[number, string]>;
  /**
   * Todo cast de jogador da noite. É a peça mais cara — 53 mil eventos e
   * 5 MB crus — e era justamente a que não passava pelo coletor.
   */
  castEvents?: EventoDeCast[];
  /** Dano por habilidade dos atores que lançaram algo. Base do peso de cada cooldown. */
  damageAbilities?: Array<{ sourceID: number; abilities: Array<{ name?: string; total?: number }> }>;
  /** Dano recebido por ator na noite. Ver buildDefense. */
  damageTaken?: Array<{ id?: number; name?: string; total?: number; totalReduced?: number }>;
  /** Percentis calculados PRA ESTE relatório — a fonte do parse. */
  reportRankings?: WclReportRankings | null;
  /**
   * Epoch de início do relatório. É o que vira a DATA da noite.
   *
   * Vinha do `fetchReportMeta` na descoberta, e sem ele no bruto a
   * reconstrução saía com data de 1969 — o log inteiro estava lá e a noite
   * ia parar no lugar errado do histórico.
   */
  reportStartTime?: number;
  /** Interrupções da noite. Ver fetchUtilityEvents. */
  interrupts?: EventoDeUtilidade[];
  /**
   * As maiores pancadas levadas por pessoa em cada try, já reduzidas.
   *
   * É o único dado que prova que havia o que mitigar. Ver biggestHits.ts.
   */
  biggestHits?: PancadaLevada[];
  /**
   * Quantas vezes cada inimigo começou cada magia, por try.
   *
   * O denominador do interrupt: sem ele não dá pra separar "ninguém
   * interrompeu" de "não havia o que interromper".
   */
  enemyCastCounts?: ContagemDeCastInimigo[];
  /** Dispels da noite. */
  dispels?: EventoDeUtilidade[];
}

/**
 * Context for the ranking (parse) pass — run separately from `fetch()`
 * because who counts as "roster" for this report (including brand-new
 * characters discovered from its own tables) is only known after the first
 * pass runs across every report of the batch.
 */
export interface WarcraftLogsRankingContext {
  reportCode: string;
  aggregateFightIds: number[];
  killedEncounterIds: number[];
  players: Array<{ profile: WclProfile; metric: "dps" | "hps" }>;
}

export interface WarcraftLogsRawRankings {
  rankings: WclRankingEntry[];
}

/**
 * Raw-data access for WarcraftLogs. Every method here mirrors one GraphQL
 * query — no business rules, no normalization. `fetch()` is the DataProvider
 * entrypoint (one full report's fight/table data); the other methods are
 * building blocks the acquisition layer (report discovery, ranking pass)
 * composes on its own.
 */
export class WarcraftLogsProvider
  implements DataProvider<WarcraftLogsReportContext, WarcraftLogsRawReportTables>
{
  readonly name = "warcraftlogs";

  async resolveGuildId(name: string, serverSlug: string, serverRegion: string): Promise<number> {
    const data = await wclGraphql<{ guildData: { guild: { id: number } } }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        guildData {
          guild(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id
          }
        }
      }`,
      { name, serverSlug, serverRegion }
    );
    return data.guildData.guild.id;
  }

  async fetchRaidEncounterIds(zoneID: number): Promise<Set<number>> {
    const data = await wclGraphql<{ worldData: { zone: { encounters: Array<{ id: number }> } } }>(
      `query($zoneID: Int!) {
        worldData {
          zone(id: $zoneID) {
            encounters { id }
          }
        }
      }`,
      { zoneID }
    );
    return new Set(data.worldData.zone.encounters.map((encounter) => encounter.id));
  }

  /** Same zone encounters as `fetchRaidEncounterIds`, with names — for mapping bosses to encounterIDs. */
  async fetchRaidEncounters(zoneID: number): Promise<Array<{ id: number; name: string }>> {
    const data = await wclGraphql<{ worldData: { zone: { encounters: Array<{ id: number; name: string }> } } }>(
      `query($zoneID: Int!) {
        worldData {
          zone(id: $zoneID) {
            encounters { id name }
          }
        }
      }`,
      { zoneID }
    );
    return data.worldData.zone.encounters;
  }

  async fetchGuildReports(guildId: number, startTime: number, endTime: number, zoneID: number): Promise<WclReportRef[]> {
    const data = await wclGraphql<{ reportData: { reports: { data: WclReportRef[] } } }>(
      `query($guildID: Int!, $startTime: Float, $endTime: Float) {
        reportData {
          reports(guildID: $guildID, startTime: $startTime, endTime: $endTime) {
            data { code startTime zone { id } }
          }
        }
      }`,
      { guildID: guildId, startTime, endTime }
    );
    return data.reportData.reports.data.filter((report) => report.zone?.id === zoneID);
  }

  async fetchUserReports(userID: number, startTime: number, endTime: number, zoneID: number): Promise<WclReportRef[]> {
    const data = await wclGraphql<{ reportData: { reports: { data: WclReportRef[] } } }>(
      `query($userID: Int!, $startTime: Float, $endTime: Float, $zoneID: Int) {
        reportData {
          reports(userID: $userID, startTime: $startTime, endTime: $endTime, zoneID: $zoneID) {
            data { code startTime zone { id } }
          }
        }
      }`,
      { userID, startTime, endTime, zoneID }
    );
    return data.reportData.reports.data;
  }

  async fetchReportMeta(code: string): Promise<WclReportRef | null> {
    const data = await wclGraphql<{ reportData: { report: WclReportRef | null } }>(
      `query($code: String!) {
        reportData {
          report(code: $code) {
            code
            startTime
            zone { id }
          }
        }
      }`,
      { code }
    );
    return data.reportData.report;
  }

  /**
   * Finds reports by character presence rather than guild/uploader — the
   * only way to reach personal/unlisted reports. Callers must decide which
   * of these to trust (see WCL_UPLOADER_USER_IDS in AUTOMACAO.md).
   */
  async fetchCharacterRecentReports(profile: WclProfile): Promise<WclReportRef[]> {
    const data = await wclGraphql<{
      characterData: { character: { recentReports?: { data: WclReportRef[] } } | null };
    }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            recentReports(limit: 20) {
              data { code startTime zone { id } owner { id } }
            }
          }
        }
      }`,
      { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region }
    );
    return data.characterData.character?.recentReports?.data ?? [];
  }

  async fetchReportFights(code: string): Promise<WclFight[]> {
    const data = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
      `query($code: String!) {
        reportData {
          report(code: $code) {
            fights { id encounterID name kill difficulty startTime endTime friendlyPlayers enemyNPCs { id gameID instanceCount } }
          }
        }
      }`,
      { code }
    );
    return data.reportData.report.fights;
  }

  /** Passing multiple fightIDs aggregates them (sum total, sum activeTime) — same as WCL's "All Kills" tab. */
  async fetchFightTables(code: string, fightIDs: number[]): Promise<WclFightTables> {
    const data = await wclGraphql<{ reportData: { report: WclFightTables } }>(
      `query($code: String!, $fightIDs: [Int]) {
        reportData {
          report(code: $code) {
            damage: table(fightIDs: $fightIDs, dataType: DamageDone)
            healing: table(fightIDs: $fightIDs, dataType: Healing)
            summary: table(fightIDs: $fightIDs, dataType: Summary)
          }
        }
      }`,
      { code, fightIDs }
    );
    return data.reportData.report;
  }

  /**
   * Percentis calculados para ESTE relatório — o que a página da WCL mostra.
   *
   * Diferente de `fetchEncounterRankings`, que é o ranking global do
   * personagem e não inclui os logs do core (conferido no CI: nenhum dos oito
   * relatórios da temporada aparece lá). É também uma chamada por relatório,
   * contra uma por jogador por encontro.
   */
  /**
   * Toda morte do relatório, com a try em que aconteceu.
   *
   * `events` trabalha em tempo RELATIVO ao início do log. Passar o epoch de
   * `report.startTime` aqui devolve zero eventos — sem erro nenhum, o que
   * faz a coleta parecer bem-sucedida e vazia. Mesma armadilha que já pegou
   * a coleta de casts.
   */
  async fetchDeathEvents(
    code: string,
    duracaoDoLogMs: number
  ): Promise<Array<{ fight: number; targetID: number; timestamp: number }>> {
    const mortes: Array<{ fight: number; targetID: number; timestamp: number }> = [];
    let inicio = 0;

    // A WCL pagina por timestamp, não por offset: a próxima página começa
    // onde `nextPageTimestamp` aponta. O teto de voltas evita laço infinito
    // se a API devolver sempre o mesmo ponteiro.
    for (let pagina = 0; pagina < 20; pagina += 1) {
      const data = await wclGraphql<{
        reportData: {
          report: {
            events: {
              data: Array<{ fight: number; targetID: number; timestamp: number }>;
              nextPageTimestamp: number | null;
            };
          };
        };
      }>(
        `query($code: String!, $start: Float!, $end: Float!) {
          reportData { report(code: $code) {
            events(dataType: Deaths, startTime: $start, endTime: $end, limit: 500) {
              data nextPageTimestamp
            }
          } }
        }`,
        { code, start: inicio, end: duracaoDoLogMs }
      );

      const pagina_ = data.reportData.report.events;
      mortes.push(...pagina_.data);

      if (pagina_.nextPageTimestamp === null || pagina_.nextPageTimestamp <= inicio) break;
      inicio = pagina_.nextPageTimestamp;
    }

    return mortes;
  }

  /**
   * Interrupções e dispels da noite.
   *
   * São o trabalho de utilidade: não aparece em dano nem em cura, e sustenta
   * o raide. Numa noite de 12 trys são 22 interrupções e 79 dispels — evento
   * raro, então cabe numa página só e custa quase nada (7,8 pontos os dois).
   *
   * Battle rez NÃO vem daqui: `Resurrects` não existe no enum da WCL. Ela sai
   * dos casts que já coletamos, sem chamada nova (ver `MAGIAS_DE_BATTLE_REZ`).
   */
  async fetchUtilityEvents(
    code: string,
    duracaoDoLogMs: number
  ): Promise<{
    interrupts: EventoDeUtilidade[];
    dispels: EventoDeUtilidade[];
  }> {
    const data = await wclGraphql<{
      reportData: {
        report: {
          interrupts: { data: EventoDeUtilidade[] };
          dispels: { data: EventoDeUtilidade[] };
        };
      };
    }>(
      `query($code: String!, $end: Float!) {
        reportData { report(code: $code) {
          interrupts: events(dataType: Interrupts, startTime: 0, endTime: $end, limit: 5000) { data }
          dispels: events(dataType: Dispels, startTime: 0, endTime: $end, limit: 5000) { data }
        } }
      }`,
      { code, end: duracaoDoLogMs }
    );

    return {
      interrupts: data.reportData.report.interrupts.data ?? [],
      dispels: data.reportData.report.dispels.data ?? [],
    };
  }

  /**
   * Dano por jogador em CADA try, separado — e não somado como no agregado.
   *
   * Vai tudo numa requisição só, com uma alias de tabela por luta: doze
   * tabelas de uma noite típica custaram 188ms e uns poucos pontos do limite
   * de 3600/h. Somar as trys aqui perderia justamente o que interessa, que é
   * a try em que alguém não fez nada.
   */
  async fetchDamagePerFight(
    code: string,
    fightIDs: number[]
  ): Promise<Map<number, Map<number, number>>> {
    const porTry = new Map<number, Map<number, number>>();
    if (fightIDs.length === 0) return porTry;

    // Lotes pra não montar uma query gigante num log de muitas trys.
    const LOTE = 15;

    for (let inicio = 0; inicio < fightIDs.length; inicio += LOTE) {
      const lote = fightIDs.slice(inicio, inicio + LOTE);
      const aliases = lote
        .map((id, indice) => `t${indice}: table(fightIDs: [${id}], dataType: DamageDone)`)
        .join("\n            ");

      const data = await wclGraphql<{
        reportData: {
          report: Record<string, { data: { entries: Array<{ id: number; total: number }> } }>;
        };
      }>(`query($code: String!) { reportData { report(code: $code) {
            ${aliases}
      } } }`, { code });

      lote.forEach((fightId, indice) => {
        const tabela = data.reportData.report[`t${indice}`];
        porTry.set(
          fightId,
          new Map((tabela?.data.entries ?? []).map((entry) => [entry.id, entry.total ?? 0]))
        );
      });
    }

    return porTry;
  }

  async fetchReportRankings(reportCode: string): Promise<WclReportRankings | null> {
    const data = await wclGraphql<{ reportData: { report: { rankings?: WclReportRankings } | null } }>(
      `query($code: String!) {
        reportData {
          report(code: $code) {
            rankings
          }
        }
      }`,
      { code: reportCode }
    );
    return data.reportData.report?.rankings ?? null;
  }

  async fetchEncounterRankings(
    profile: WclProfile,
    encounterID: number,
    metric: "dps" | "hps"
  ): Promise<{ ranks: WclRankingEntry["ranks"] } | null> {
    const data = await wclGraphql<{
      characterData: { character: { encounterRankings?: { ranks: WclRankingEntry["ranks"] } } | null };
    }>(
      `query($name: String!, $serverSlug: String!, $serverRegion: String!, $encounterID: Int!, $metric: CharacterRankingMetricType) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            encounterRankings(encounterID: $encounterID, metric: $metric)
          }
        }
      }`,
      { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region, encounterID, metric }
    );
    return data.characterData.character?.encounterRankings ?? null;
  }

  /**
   * Zone-wide (whole raid tier, not one encounter) average/best performance —
   * used for the roster's avgParse/bestParse, not the per-run parse field.
   * Swallows errors (returns null) like the original script did: it's an
   * optional stat, not worth failing the whole sync for one player.
   */
  async fetchZoneRankings(
    profile: WclProfile,
    zoneID: number,
    metric: "dps" | "hps"
  ): Promise<{ medianPerformanceAverage?: number; bestPerformanceAverage?: number } | null> {
    try {
      const data = await wclGraphql<{
        characterData: {
          character: {
            zoneRankings?: { medianPerformanceAverage?: number; bestPerformanceAverage?: number };
          } | null;
        };
      }>(
        `query($name: String!, $serverSlug: String!, $serverRegion: String!, $zoneID: Int!, $metric: CharacterPageRankingMetricType) {
          characterData {
            character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
              zoneRankings(zoneID: $zoneID, metric: $metric)
            }
          }
        }`,
        { name: profile.name, serverSlug: profile.realm, serverRegion: profile.region, zoneID, metric }
      );
      return data.characterData.character?.zoneRankings ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Nome de cada ator do relatório, por id. Os eventos só trazem
   * `sourceID` — sem esse mapa não dá pra ligar um cast a um jogador.
   */
  /**
   * Quem é quem no relatório: `actorId` -> nome do personagem.
   *
   * Tenta de novo quando volta vazio, porque volta vazio às vezes: o log de
   * 15/09 devolveu zero atores numa coleta e a lista completa dois minutos
   * depois, na mesma versão do código. E vazio aqui não falha sozinho — ele
   * derruba junto tudo que depende de ligar evento a jogador (cooldowns,
   * dano recebido, bosses mortos, a noite try a try), deixando a noite pela
   * metade sem nada explodir.
   */
  async fetchActorNames(
    reportCode: string
  ): Promise<{ atores: Map<number, string>; habilidades: Map<number, string> }> {
    const ESPERA_MS = [0, 2_000, 6_000];

    for (const [tentativa, espera] of ESPERA_MS.entries()) {
      if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));

      const data = await wclGraphql<{
        reportData: {
          report: {
            masterData?: {
              actors?: Array<{ id: number; name: string; type: string }>;
              abilities?: Array<{ gameID: number; name: string }>;
            };
          } | null;
        };
      }>(
        /**
         * `abilities` vem de graça na query que já era feita pelos atores, e
         * é a única fonte que traduz id de habilidade INIMIGA sem truncagem.
         *
         * A tabela agregada de dano recebido trunca em 5 habilidades por
         * alvo, e a que matou raramente está entre as 5 maiores — metade das
         * mortes da temporada não sabia dizer de quê. Sem nome, a pancada
         * mais cara da noite também vira "habilidade 1234567", que não é
         * laudo nenhum.
         */
        `query($code: String!) {
          reportData { report(code: $code) { masterData {
            actors(type: "Player") { id name type }
            abilities { gameID name }
          } } }
        }`,
        { code: reportCode }
      );

      const atores = data.reportData.report?.masterData?.actors ?? [];
      const habilidades = data.reportData.report?.masterData?.abilities ?? [];
      if (atores.length > 0) {
        return {
          atores: new Map(atores.map((ator) => [ator.id, ator.name])),
          habilidades: new Map(
            habilidades
              .filter((h): h is { gameID: number; name: string } => Boolean(h?.gameID && h?.name))
              .map((h) => [h.gameID, h.name])
          ),
        };
      }

      if (tentativa < ESPERA_MS.length - 1) {
        console.warn(
          `masterData do report ${reportCode} voltou vazio — tentando de novo em ${ESPERA_MS[tentativa + 1] / 1000}s.`
        );
      }
    }

    return { atores: new Map(), habilidades: new Map() };
  }

  /**
   * Todo cast de jogador nas trys informadas.
   *
   * Eventos, não tabela: a tabela de Casts vem truncada em 5 habilidades por
   * jogador (conferido no CI) e nenhum cooldown aparece nela. São ~53 mil
   * eventos numa noite de 12 trys, a 14 pontos de API — 0,4% do limite por
   * hora, medido antes de entrar no cron.
   *
   * `endTime` é obrigatório junto com `startTime`: sem ele a WCL devolve a
   * janela vazia, sem erro nenhum.
   */
  async fetchCastEvents(
    reportCode: string,
    fights: Array<{ id: number; startTime: number; endTime: number }>
  ): Promise<EventoDeCast[]> {
    const eventos: EventoDeCast[] = [];

    for (const fight of fights) {
      let cursor: number | undefined = fight.startTime;

      // A WCL pagina em 10 mil eventos. Sem o laço, try longa voltaria
      // truncada e o tempo em recarga sairia menor do que foi.
      while (cursor !== undefined) {
        const pagina: {
          reportData: {
            report: {
              events?: { data?: EventoDeCast[]; nextPageTimestamp?: number | null };
            } | null;
          };
        } = await wclGraphql(
          `query($code: String!, $fightIDs: [Int]!, $start: Float!, $end: Float!) {
            reportData { report(code: $code) {
              events(fightIDs: $fightIDs, dataType: Casts, startTime: $start, endTime: $end, limit: 10000) {
                data
                nextPageTimestamp
              }
            } }
          }`,
          { code: reportCode, fightIDs: [fight.id], start: cursor, end: fight.endTime }
        );

        for (const evento of pagina.reportData.report?.events?.data ?? []) {
          // `fight` vem no evento, mas nem todo dataType preenche — como a
          // busca é try a try, o id da try é sabido aqui de qualquer jeito.
          eventos.push({ ...evento, fight: fight.id });
        }

        cursor = pagina.reportData.report?.events?.nextPageTimestamp ?? undefined;
      }
    }

    return eventos;
  }

  /**
   * As maiores pancadas levadas por cada pessoa, try a try.
   *
   * É o lado que falta pra Defender ter laudo. Hoje ela prova que o botão foi
   * apertado, nunca que havia o que mitigar — e "você não usou X" não acusa
   * nada sozinho. Com o instante da porrada, a frase ganha o cruzamento.
   *
   * O fluxo bruto é dominado por tique periódico de 2k, então a redução
   * acontece AQUI, antes de arquivar: try a try, pra não segurar a noite
   * inteira em memória. O que não é guardado nunca trafega pro git.
   *
   * `hostilityType: Friendlies` porque a pergunta é sobre o raide apanhando,
   * e `endTime` é obrigatório junto com `startTime`: sem ele a WCL devolve a
   * janela vazia sem erro nenhum, a mesma armadilha do `fetchCastEvents`.
   */
  async fetchBiggestHits(
    reportCode: string,
    fights: Array<{ id: number; startTime: number; endTime: number }>
  ): Promise<PancadaLevada[]> {
    const escolhidas: PancadaLevada[] = [];

    for (const fight of fights) {
      const daTry: PancadaLevada[] = [];
      let cursor: number | undefined = fight.startTime;

      while (cursor !== undefined) {
        const pagina: {
          reportData: {
            report: {
              events?: { data?: PancadaLevada[]; nextPageTimestamp?: number | null };
            } | null;
          };
        } = await wclGraphql(
          `query($code: String!, $fightIDs: [Int]!, $start: Float!, $end: Float!) {
            reportData { report(code: $code) {
              events(
                fightIDs: $fightIDs, dataType: DamageTaken, hostilityType: Friendlies,
                startTime: $start, endTime: $end, limit: 10000, includeResources: true
              ) {
                data
                nextPageTimestamp
              }
            } }
          }`,
          { code: reportCode, fightIDs: [fight.id], start: cursor, end: fight.endTime }
        );

        for (const evento of pagina.reportData.report?.events?.data ?? []) {
          daTry.push({
            // `fight` nem sempre vem preenchido no evento; como a busca é try
            // a try, o id é sabido aqui de qualquer jeito.
            fight: fight.id,
            timestamp: evento.timestamp,
            targetID: evento.targetID,
            abilityGameID: evento.abilityGameID,
            amount: evento.amount,
            ...(evento.unmitigatedAmount !== undefined && {
              unmitigatedAmount: evento.unmitigatedAmount,
            }),
            ...(evento.absorbed !== undefined && { absorbed: evento.absorbed }),
            ...(evento.hitPoints !== undefined && { hitPoints: evento.hitPoints }),
            ...(evento.maxHitPoints !== undefined && { maxHitPoints: evento.maxHitPoints }),
          });
        }

        cursor = pagina.reportData.report?.events?.nextPageTimestamp ?? undefined;
      }

      escolhidas.push(...maioresPancadas(daTry));
    }

    return escolhidas.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Quantas vezes cada inimigo COMEÇOU cada magia, try a try.
   *
   * É o denominador que falta pro interrupt. Hoje a conta só tem numerador —
   * quantos kicks você acertou — e 35 das 113 noites da temporada têm zero
   * interrupção do raide inteiro. Sem denominador não dá pra distinguir
   * "ninguém interrompeu" de "não havia o que interromper", e a dimensão
   * acaba punindo desenho de boss. Pior: cria incentivo perverso, porque
   * apertar o kick numa luta sem alvo tira nota de quem apertou.
   *
   * Guarda CONTAGEM, não evento: a pergunta é "houve oportunidade e quantas",
   * e a resposta cabe em uma linha por magia por try. A temporada inteira sai
   * em poucos KB, contra megabytes se fossem os eventos.
   *
   * `begincast` e não `cast` de propósito: a magia interrompida nunca emite o
   * `cast`. Contar os concluídos daria um denominador que já desconta
   * justamente o sucesso que se quer medir.
   */
  async fetchEnemyCastCounts(
    reportCode: string,
    fights: Array<{ id: number; startTime: number; endTime: number }>
  ): Promise<ContagemDeCastInimigo[]> {
    const contagens: ContagemDeCastInimigo[] = [];

    for (const fight of fights) {
      const porMagia = new Map<number, number>();
      let cursor: number | undefined = fight.startTime;

      while (cursor !== undefined) {
        const pagina: {
          reportData: {
            report: {
              events?: {
                data?: Array<{ type?: string; abilityGameID?: number }>;
                nextPageTimestamp?: number | null;
              };
            } | null;
          };
        } = await wclGraphql(
          `query($code: String!, $fightIDs: [Int]!, $start: Float!, $end: Float!) {
            reportData { report(code: $code) {
              events(
                fightIDs: $fightIDs, dataType: Casts, hostilityType: Enemies,
                startTime: $start, endTime: $end, limit: 10000
              ) {
                data
                nextPageTimestamp
              }
            } }
          }`,
          { code: reportCode, fightIDs: [fight.id], start: cursor, end: fight.endTime }
        );

        for (const evento of pagina.reportData.report?.events?.data ?? []) {
          // Só `begincast`, e por dois motivos que coincidem: a magia com
          // tempo de conjuração emite os dois eventos, então contar ambos
          // contaria o mesmo lançamento duas vezes — e magia instantânea,
          // que só emite `cast`, não é interrompível de qualquer forma. O
          // `begincast` é ao mesmo tempo o sem-duplicata e o interrompível.
          if (evento.type !== "begincast" || evento.abilityGameID === undefined) continue;

          porMagia.set(evento.abilityGameID, (porMagia.get(evento.abilityGameID) ?? 0) + 1);
        }

        cursor = pagina.reportData.report?.events?.nextPageTimestamp ?? undefined;
      }

      for (const [abilityGameID, casts] of porMagia) {
        contagens.push({ fight: fight.id, abilityGameID, casts });
      }
    }

    return contagens;
  }

  /**
   * Dano por habilidade de cada jogador, sem truncar.
   *
   * A tabela agregada de DamageDone traz só as 5 maiores habilidades de
   * cada um — a mesma truncagem da tabela de Casts. Justamente as
   * situacionais ficam de fora, que são as que o filtro de relevância
   * existe pra descartar: Feral Lunge é 0,00% do dano do jogador e não
   * aparecia na lista, então passava como se não causasse dano nenhum.
   *
   * `sourceID` + `viewBy: Ability` devolve a lista inteira daquele jogador
   * (26 habilidades no lugar de 5). Uma consulta por jogador, agrupadas em
   * lotes por apelido pra não virar uma ida por pessoa.
   */
  async fetchDamageAbilities(
    reportCode: string,
    fightIDs: number[],
    sourceIDs: number[]
  ): Promise<Array<{ sourceID: number; abilities: Array<{ name?: string; total?: number }> }>> {
    const resultado: Array<{ sourceID: number; abilities: Array<{ name?: string; total?: number }> }> = [];
    const TAMANHO_DO_LOTE = 8;

    for (let i = 0; i < sourceIDs.length; i += TAMANHO_DO_LOTE) {
      const lote = sourceIDs.slice(i, i + TAMANHO_DO_LOTE);
      const campos = lote
        .map((id) => `  j${id}: table(fightIDs: $fightIDs, dataType: DamageDone, sourceID: ${id}, viewBy: Ability)`)
        .join("\n");

      const data = await wclGraphql<{ reportData: { report: Record<string, unknown> | null } }>(
        `query($code: String!, $fightIDs: [Int]!) {
          reportData { report(code: $code) {
${campos}
          } }
        }`,
        { code: reportCode, fightIDs }
      );

      for (const id of lote) {
        const tabela = (data.reportData.report?.[`j${id}`] ?? {}) as {
          data?: { entries?: Array<{ name?: string; total?: number }> };
        };
        resultado.push({ sourceID: id, abilities: tabela.data?.entries ?? [] });
      }
    }

    return resultado;
  }

  /**
   * Dano recebido por jogador na noite.
   *
   * `totalReduced` é o insumo da metade de mitigação de "Defender": quanto
   * do dano que vinha na sua direção foi cortado por armadura, absorção e
   * cooldown. Diferente de dano causado, aqui a tabela agregada serve — só
   * precisamos do total por jogador, não da quebra por habilidade.
   */
  async fetchDamageTaken(
    reportCode: string,
    fightIDs: number[]
  ): Promise<Array<{ id?: number; name?: string; total?: number; totalReduced?: number }>> {
    const data = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
      `query($code: String!, $fightIDs: [Int]!) {
        reportData { report(code: $code) { table(fightIDs: $fightIDs, dataType: DamageTaken) } }
      }`,
      { code: reportCode, fightIDs }
    );

    const tabela = (data.reportData.report?.table ?? {}) as {
      data?: { entries?: Array<{ id?: number; name?: string; total?: number; totalReduced?: number }> };
    };
    return tabela.data?.entries ?? [];
  }

  /** Points-based rate limit status — see AUTOMACAO.md / DataCollector's minDelayMs for why this matters. */
  async fetchRateLimitData(): Promise<{ limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number }> {
    const data = await wclGraphql<{
      rateLimitData: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number };
    }>(
      `query {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
      }`
    );
    return data.rateLimitData;
  }

  /**
   * DataProvider entrypoint — pass 1: everything WCL knows about a report's
   * fights/tables. Does not include rankings (see `fetchRankings`), because
   * who to fetch rankings for isn't known until this pass runs across every
   * report in the batch (new characters get discovered from these tables).
   */
  async fetch(context: WarcraftLogsReportContext): Promise<ProviderResult<WarcraftLogsRawReportTables>> {
    const fights = await this.fetchReportFights(context.reportCode);
    const raidFights = fights.filter((fight) => context.validEncounterIds.has(fight.encounterID));
    const killedFights = raidFights.filter((fight) => fight.kill);

    // O agregado é a noite inteira — kills e wipes (ver selectAggregateFights).
    // Como agora coincide com "todos os fights", uma query só resolve o que
    // antes eram duas (agregado + tabela completa pra mortes/composição).
    const aggregateFightIds = selectAggregateFights(raidFights).map((fight) => fight.id);
    const allFightIds = raidFights.map((fight) => fight.id);

    const aggregateTables = await this.fetchFightTables(context.reportCode, aggregateFightIds);
    const fullTables = aggregateTables;

    /**
     * O trash é o que o coletor sempre jogou fora — `encounterID: 0`. São
     * poucos minutos da noite (4 de 97 em 27/08), mas é a única janela em
     * que dá pra ver quem ajuda na limpeza e quem espera passar.
     */
    const trashFights = fights.filter((fight) => fight.encounterID === 0);
    const trashTables =
      trashFights.length > 0
        ? await this.fetchFightTables(context.reportCode, trashFights.map((fight) => fight.id))
        : null;

    // Try a try: presença vem de graça com os fights, mortes e dano custam
    // uma query cada. Ver buildNightDetail.
    const duracaoDoLogMs = Math.max(...fights.map((fight) => fight.endTime), 0);
    const deathEvents = await this.fetchDeathEvents(context.reportCode, duracaoDoLogMs);
    const damagePerFight = await this.fetchDamagePerFight(context.reportCode, allFightIds);

    /**
     * O resto do que uma noite precisa, na MESMA passada.
     *
     * Estas quatro chamadas viviam soltas no script de coleta e nunca eram
     * arquivadas — inclusive os casts, que sozinhos são 5 MB e a chamada mais
     * cara de todas. Enquanto ficassem de fora, versionar o bruto não
     * resolveria nada: recalcular continuaria exigindo ir à rede buscar
     * justamente a parte grande.
     */
    const { atores: actorNames, habilidades: abilityNames } = await this.fetchActorNames(
      context.reportCode
    );
    const castEvents = await this.fetchCastEvents(context.reportCode, raidFights);

    // Só quem aparece nos eventos: buscar dano de ator que não lançou nada é
    // ida de rede à toa.
    const atoresComCast = [...new Set(castEvents.map((evento) => evento.sourceID))].filter((id) =>
      actorNames.has(id)
    );
    const damageAbilities = await this.fetchDamageAbilities(
      context.reportCode,
      aggregateFightIds,
      atoresComCast
    );
    const damageTaken = await this.fetchDamageTaken(context.reportCode, aggregateFightIds);
    const reportRankings = await this.fetchReportRankings(context.reportCode);
    const meta = await this.fetchReportMeta(context.reportCode);
    const utilidade = await this.fetchUtilityEvents(context.reportCode, duracaoDoLogMs);

    /**
     * As maiores pancadas de cada um, try a try.
     *
     * A chamada mais cara depois dos casts, e a que dá laudo a Defender: sem
     * o instante da porrada, "você não usou o defensivo" não acusa nada,
     * porque pode não ter havido o que mitigar. A redução às 20 maiores
     * acontece dentro do fetch, então o que chega aqui já é o que fica.
     */
    const biggestHits = await this.fetchBiggestHits(context.reportCode, raidFights);

    /**
     * O denominador do interrupt. Barato: é contagem, não evento.
     *
     * Inclui o TRASH, e é aí que mora a razão de ser dele: 529 das 652
     * interrupções da temporada (81%) aconteceram fora de luta de boss.
     * Coletar só os bosses daria um denominador que descreve um quinto da
     * atividade real — e comparar interrupções da noite inteira contra
     * oportunidades só de boss produz 133 kicks para 25 oportunidades, que é
     * a cara de uma métrica quebrada.
     */
    const enemyCastCounts = await this.fetchEnemyCastCounts(context.reportCode, [
      ...raidFights,
      ...trashFights,
    ]);

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: {
        fights,
        raidFights,
        killedFights,
        aggregateFightIds,
        allFightIds,
        aggregateTables,
        fullTables,
        trashFights,
        trashTables,
        deathEvents,
        // Map não sobrevive ao JSON.stringify do arquivo bruto — vai como
        // lista de pares, que é o que o arquivo em data/raw/ precisa guardar.
        damagePerFight: [...damagePerFight].map(([fightId, porAtor]) => ({
          fightId,
          entries: [...porAtor].map(([actorId, total]) => ({ actorId, total })),
        })),
        actorNames: [...actorNames],
        abilityNames: [...abilityNames],
        castEvents,
        damageAbilities,
        damageTaken,
        reportRankings,
        reportStartTime: meta?.startTime,
        interrupts: utilidade.interrupts,
        biggestHits,
        enemyCastCounts,
        dispels: utilidade.dispels,
      },
    };
  }

  /**
   * Pass 2: best rank percent (parse) per player, among the encounters their
   * run actually killed. Archived separately under
   * data/raw/warcraftlogs/<code>-rankings.json.
   */
  async fetchRankings(context: WarcraftLogsRankingContext): Promise<ProviderResult<WarcraftLogsRawRankings>> {
    const rankings: WclRankingEntry[] = [];

    for (const player of context.players) {
      for (const encounterID of context.killedEncounterIds) {
        const ranking = await this.fetchEncounterRankings(player.profile, encounterID, player.metric);
        rankings.push({
          characterName: player.profile.name,
          encounterID,
          metric: player.metric,
          ranks: ranking?.ranks ?? [],
        });
      }
    }

    return {
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      raw: { rankings },
    };
  }
}
