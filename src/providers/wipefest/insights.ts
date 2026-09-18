/**
 * Interpretação da resposta da API do Wipefest para um fight.
 *
 * `api.wipefest.gg/report/<code>/fight/<id>` devolve, em JSON, a curadoria de
 * mecânicas daquele encontro — a mesma que a página renderiza. Não precisa de
 * navegador: a versão anterior disso clicava insight por insight com
 * Playwright pra ler o DOM.
 *
 * O que a API declara e evita heurística nossa:
 *
 *   insightConfigs[].statistics[].higherIsBetter → se a contagem é falha ou acerto
 *   playerValues[].values[].isBonus             → se entra no score principal
 *   playerValues[].values[].value               → a nota 0-100 por mecânica
 *   insights[].details                          → tabela com a contagem por jogador
 *
 * Isso importa porque o número por jogador não significa a mesma coisa em toda
 * mecânica: em "Stood in X" 5 é dano tomado 5 vezes (ruim); em "Soaked Y" é
 * ter ajudado 5 vezes (bom). Quem diz qual é qual é o `higherIsBetter`, não a
 * frase.
 *
 * Tudo puro: recebe o JSON, devolve estrutura. Sem rede.
 */

export interface WipefestApiStatistic {
  name: string;
  higherIsBetter: boolean;
}

export interface WipefestApiInsightConfig {
  id: string;
  group: string;
  /** Nome canônico em inglês — não muda com o idioma do log. */
  name: string;
  statistics?: WipefestApiStatistic[];
}

export interface WipefestApiInsight {
  id: string;
  group: string;
  /** Título com o nome da habilidade no idioma do log e markup do Wipefest. */
  title: string;
  /** HTML com a tabela por jogador, quando existe. */
  details?: string;
}

export interface WipefestApiPlayerValue {
  insightId: string;
  insightGroup: string;
  /** 0-100, já normalizado: 100 = fez certo, independente da direção da contagem. */
  value: number;
  isBonus: boolean;
  statisticName?: string;
  statisticUnscaledValue?: number;
}

export interface WipefestApiPlayer {
  /**
   * A API repete cada jogador em três recortes: o fight inteiro e os cortes
   * "até a primeira morte" / "até o wipe ser chamado" (o seletor "Ignore
   * events after N Deaths" da página). Só o primeiro corresponde ao card.
   */
  interval?: { unit?: string };
  playerId: number;
  totalValue: number;
  totalBonus: number;
  values: WipefestApiPlayerValue[];
}

export interface WipefestApiFight {
  insights?: WipefestApiInsight[];
  insightConfigs?: WipefestApiInsightConfig[];
  playerValues?: WipefestApiPlayer[];
  report?: { friendlies?: Array<{ id: number; name: string }> };
}

/**
 * Colunas que servem de contagem, em ordem de preferência. `damage` e
 * `healing` ficam de fora de propósito: total não é quantidade — dois
 * jogadores com o mesmo dano podem ter tomado 1 e 10 hits.
 */
const COUNT_COLUMNS = ["hits", "casts", "frequency"];

export function parseComponentData(componentData: string): {
  columns: string[];
  rows: Array<Record<string, unknown>>;
} {
  const json = JSON.parse(componentData.split("@@@").join("{").split("|||").join("}"));
  return {
    columns: (json.columnDatas ?? []).map((coluna: { id: string }) => coluna.id),
    rows: json.rowDatas ?? [],
  };
}

/** `{[style="shaman"] Gunst}` → `Gunst` */
export function limparMarkup(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function paraNumero(valor: unknown): number | undefined {
  const texto = limparMarkup(
    typeof valor === "object" && valor !== null ? (valor as { text?: string }).text : valor
  );
  if (!texto) return undefined;
  const numero = Number(texto.replace(/,/g, ""));
  return Number.isFinite(numero) ? numero : undefined;
}

/** Extrai a contagem por jogador do `details` de um insight. */
export function extractCounts(details: string | undefined): {
  countColumn?: string;
  byPlayer: Record<string, number>;
} {
  if (!details) return { byPlayer: {} };

  const match = details.match(/data-component-data='([^']+)'/);
  if (!match) return { byPlayer: {} };

  let parsed: ReturnType<typeof parseComponentData>;
  try {
    parsed = parseComponentData(match[1]);
  } catch {
    return { byPlayer: {} };
  }

  const countColumn = COUNT_COLUMNS.find((coluna) => parsed.columns.includes(coluna));
  if (!countColumn) return { byPlayer: {} };

  const byPlayer: Record<string, number> = {};
  for (const row of parsed.rows) {
    const player = limparMarkup((row.player as { markup?: string } | undefined)?.markup);
    const count = paraNumero(row[countColumn]);
    if (player && count !== undefined) byPlayer[player] = count;
  }

  return { countColumn, byPlayer };
}

/**
 * Nome da habilidade no idioma do log, tirado do título do insight.
 *
 * O `name` do insightConfig é canônico em inglês — ótimo pra cruzar entre
 * relatórios, péssimo pra ler: quem raida em português conhece "Peçonha
 * Sanguínea", não "Blood Venom", e não reconhece a própria mecânica.
 *
 * O título vem com markup do Wipefest: `Stood in {[style=icon] Peçonha
 * Sanguínea} {...} for {...} ticks`. O primeiro grupo é a habilidade.
 */
export function extractAbilityLabel(title: string | undefined): string | undefined {
  // Nem todo insight tem título: a API devolve entradas vazias, e sem esta
  // guarda o erro subia até o catch por fight do coletor — que registrava a
  // falha e seguia, deixando a coleta inteira sem rótulo em silêncio.
  const match = title?.match(/\{\[[^\]]*\]\s*([^{}]+)\}/);
  const nome = match?.[1]?.trim();
  // Números vêm do mesmo markup ({[style="info"] 12}); só interessa quando o
  // primeiro grupo é mesmo o nome da habilidade.
  return nome && nome.length > 2 && !/^[\d.,/%]+$/.test(nome) ? nome : undefined;
}

export interface PlayerMechanicError {
  /** Nome canônico da mecânica (inglês, estável entre idiomas). Chave, não rótulo. */
  mechanic: string;
  /** Nome como aparece no log — é o que vai pra tela. */
  label?: string;
  /** Nota 0-100 do Wipefest. Menor que 100 = algo saiu errado. */
  value: number;
  /** Quantas vezes, quando a tabela do insight informa. */
  count?: number;
  /** De qual coluna a contagem saiu — mantém o número rastreável. */
  countColumn?: string;
}

export interface PlayerFightMechanics {
  player: string;
  /** Nota geral do fight (o círculo verde no card). */
  score: number;
  /** Só mecânicas principais: bônus (flask, poção, soak) fica de fora. */
  errors: PlayerMechanicError[];
}

/** Mecânicas que o Wipefest pontua mas o core não conta. */
const IGNORED_MECHANICS = new Set(["Deaths"]);

/**
 * Consolida o fight: por jogador, quais mecânicas principais não fecharam 100
 * e quantas vezes.
 *
 * Bônus fica de fora do erro mecânico de propósito — é o que impede alguém de
 * levar falta por não usar poção. Esses itens pertencem à Preparação.
 */
export function buildFightMechanics(api: WipefestApiFight): PlayerFightMechanics[] {
  // Chave composta de propósito: o id se repete entre grupos. Neste report,
  // id=3 é "Deaths" no grupo raid e "Average duration of Mark of Blood" no
  // grupo do encontro — indexar só por id troca o nome da mecânica.
  const chave = (group: string, id: string) => `${group}|${id}`;
  const configs = new Map(
    (api.insightConfigs ?? []).map((config) => [chave(config.group, config.id), config])
  );
  const nomes = new Map((api.report?.friendlies ?? []).map((amigo) => [amigo.id, amigo.name]));

  const contagens = new Map<string, ReturnType<typeof extractCounts>>();
  const rotulos = new Map<string, string>();
  for (const insight of api.insights ?? []) {
    const k = chave(insight.group, insight.id);
    contagens.set(k, extractCounts(insight.details));
    const rotulo = extractAbilityLabel(insight.title);
    if (rotulo && !rotulos.has(k)) rotulos.set(k, rotulo);
  }

  const resultado: PlayerFightMechanics[] = [];

  for (const jogador of api.playerValues ?? []) {
    // Sem isto o mesmo jogador aparece três vezes, e os recortes parciais
    // trazem score fracionário que não corresponde a nada na tela.
    if (jogador.interval?.unit && jogador.interval.unit !== "EntireFight") continue;

    const nome = nomes.get(jogador.playerId);
    if (!nome) continue;

    const errors: PlayerMechanicError[] = [];

    for (const valor of jogador.values) {
      // Mortes saíram do score do core por decisão do projeto — e a API não
      // as marca como bônus, então precisam sair explicitamente aqui.
      if (IGNORED_MECHANICS.has(configs.get(chave(valor.insightGroup, valor.insightId))?.name ?? "")) continue;
      const config = configs.get(chave(valor.insightGroup, valor.insightId));
      const direcao = config?.statistics?.[0]?.higherIsBetter;

      // O que conta como erro é a DIREÇÃO, não o isBonus. Coletar droplet é
      // participação (higherIsBetter: true); tomar dano de droplet é o
      // oposto (false) — e o Wipefest põe essa segunda no bônus. Filtrar por
      // isBonus deixava de fora justamente a mecânica que matou o Dagom.
      //
      // Isso também mantém fora soaks e dispels (true), então ninguém leva
      // falta por um soak que era dividido entre poucos.
      if (direcao !== false) continue;
      if (valor.value >= 100) continue;

      const contagem = contagens.get(chave(valor.insightGroup, valor.insightId));

      errors.push({
        mechanic: config?.name ?? valor.insightId,
        ...(rotulos.get(chave(valor.insightGroup, valor.insightId))
          ? { label: rotulos.get(chave(valor.insightGroup, valor.insightId)) }
          : {}),
        value: valor.value,
        ...(contagem?.byPlayer[nome] !== undefined ? { count: contagem.byPlayer[nome] } : {}),
        ...(contagem?.countColumn ? { countColumn: contagem.countColumn } : {}),
      });
    }

    resultado.push({ player: nome, score: jogador.totalValue, errors });
  }

  return resultado;
}

/** Mecânicas do grupo `raid` que não são preparação. */
const RAID_NAO_PREPARACAO = new Set(["Deaths"]);

export interface PlayerFightPreparation {
  player: string;
  /** 0-100 por item: Ready Check (flask/comida/gear), Poções, Healthstone. */
  itens: Array<{ nome: string; value: number }>;
}

/**
 * Consumíveis de cada jogador no fight, pela curadoria do Wipefest.
 *
 * Fecha a lacuna que a coleta da WarcraftLogs não resolvia: o
 * `combatantInfo` dos logs do core vem sem aura nenhuma, então flask,
 * comida e poção nunca entravam na nota de Preparação.
 *
 * O grupo `raid` é o que agrupa o que vale pra qualquer encontro — é onde o
 * Wipefest põe Ready Check, Potions e Healthstone. `Deaths` também mora lá e
 * fica de fora: mortes saíram do score por decisão do projeto.
 */
export function buildFightPreparation(api: WipefestApiFight): PlayerFightPreparation[] {
  const chave = (group: string, id: string) => `${group}|${id}`;
  const configs = new Map(
    (api.insightConfigs ?? []).map((config) => [chave(config.group, config.id), config])
  );
  const nomes = new Map((api.report?.friendlies ?? []).map((amigo) => [amigo.id, amigo.name]));

  const resultado: PlayerFightPreparation[] = [];

  for (const jogador of api.playerValues ?? []) {
    if (jogador.interval?.unit && jogador.interval.unit !== "EntireFight") continue;

    const nome = nomes.get(jogador.playerId);
    if (!nome) continue;

    const itens: PlayerFightPreparation["itens"] = [];

    for (const valor of jogador.values) {
      if (valor.insightGroup !== "raid") continue;

      const config = configs.get(chave(valor.insightGroup, valor.insightId));
      const nomeItem = config?.name;
      if (!nomeItem || RAID_NAO_PREPARACAO.has(nomeItem)) continue;

      itens.push({ nome: nomeItem, value: valor.value });
    }

    if (itens.length > 0) resultado.push({ player: nome, itens });
  }

  return resultado;
}
