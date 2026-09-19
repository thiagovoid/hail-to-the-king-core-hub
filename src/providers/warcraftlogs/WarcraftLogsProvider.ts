import type { DataProvider, ProviderResult } from "../types";
import { wclGraphql } from "./client";
import type { EventoDeCast } from "./cooldownUsage";
import { selectAggregateFights } from "./normalize";
import type { WclFight, WclFightTables, WclProfile, WclRankingEntry } from "./normalize";
import type { WclReportRankings } from "./reportRankings";

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
  deathEvents?: Array<{ fight: number; targetID: number; timestamp: number }>;
  /** Dano por ator em CADA try, como pares (Map não sobrevive ao JSON). */
  damagePerFight?: Array<{ fightId: number; entries: Array<{ actorId: number; total: number }> }>;
  /**
   * `actorId` -> nome, como pares. Sem isso todo evento vira número solto.
   */
  actorNames?: Array<[number, string]>;
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
            fights { id encounterID name kill difficulty startTime endTime friendlyPlayers }
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
  async fetchActorNames(reportCode: string): Promise<Map<number, string>> {
    const ESPERA_MS = [0, 2_000, 6_000];

    for (const [tentativa, espera] of ESPERA_MS.entries()) {
      if (espera > 0) await new Promise((resolve) => setTimeout(resolve, espera));

      const data = await wclGraphql<{
        reportData: { report: { masterData?: { actors?: Array<{ id: number; name: string; type: string }> } } | null };
      }>(
        `query($code: String!) {
          reportData { report(code: $code) { masterData { actors(type: "Player") { id name type } } } }
        }`,
        { code: reportCode }
      );

      const atores = data.reportData.report?.masterData?.actors ?? [];
      if (atores.length > 0) return new Map(atores.map((ator) => [ator.id, ator.name]));

      if (tentativa < ESPERA_MS.length - 1) {
        console.warn(
          `masterData do report ${reportCode} voltou vazio — tentando de novo em ${ESPERA_MS[tentativa + 1] / 1000}s.`
        );
      }
    }

    return new Map();
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
    const actorNames = await this.fetchActorNames(context.reportCode);
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
        castEvents,
        damageAbilities,
        damageTaken,
        reportRankings,
        reportStartTime: meta?.startTime,
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
