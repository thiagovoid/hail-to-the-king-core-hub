
import type { PlayerPerformanceGoals } from "./goals";

/**
 * Tipos TypeScript centrais do Core Hub — Core Nemesis
 * Todas as interfaces e tipos usados nas páginas, componentes e utilitários.
 */

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Classes jogáveis do World of Warcraft disponíveis no roster.
 */
export type WowClass =
  | "death-knight"
  | "demon-hunter"
  | "druid"
  | "evoker"
  | "hunter"
  | "mage"
  | "monk"
  | "paladin"
  | "priest"
  | "rogue"
  | "shaman"
  | "warlock"
  | "warrior";

/**
 * Raças jogáveis do World of Warcraft disponíveis no roster.
 */
export type WowRace =
  | "human"
  | "dwarf"
  | "night-elf"
  | "gnome"
  | "draenei"
  | "worgen"
  | "dark-iron-dwarf"
  | "kul-tiran"
  | "mechagnome"
  | "lightforged-draenei"
  | "void-elf"
  | "orc"
  | "troll"
  | "tauren"
  | "undead"
  | "blood-elf"
  | "goblin"
  | "pandaren"
  | "highmountain-tauren"
  | "nightborne"
  | "mag-har-orc"
  | "zandalari-troll"
  | "vulpera"
  | "dracthyr"
  | "earthen";

/**
 * Categorias de ferramentas externas exibidas na seção Ferramentas.
 */
export type ToolCategory =
  | "mythic-plus"
  | "simulation"
  | "builds"
  | "raid"
  | "economy"
  | "utilities";

/**
 * Identificadores das categorias de regras da guilda.
 */
export type RuleCategoryId =
  | "behavior"
  | "raid"
  | "attendance"
  | "loot"
  | "recruitment";

// ---------------------------------------------------------------------------
// Interfaces de destaque / highlight
// ---------------------------------------------------------------------------

/**
 * Destaque de um jogador em uma sessão de raid ou na semana.
 * Usado em `WeeklyLog` e `SiteConfig`.
 */
export interface PlayerHighlight {
  /** Nome do personagem em destaque. */
  playerName: string;
  /** Classe WoW do jogador para aplicar a cor correta. */
  class: WowClass;
  /** Valor numérico ou textual do destaque, ex: "142.5k DPS", "87% parse". */
  value: string;
}

// ---------------------------------------------------------------------------
// Configuração do Site
// ---------------------------------------------------------------------------

/**
 * Configuração de nível superior do site, lida do JSON da temporada ativa.
 * Contém dados de identidade do core, raid atual e destaques da semana.
 */
export interface SiteConfig {
  /** Nome do core de raid, ex: "Core Nemesis". */
  coreName: string;
  /** Nome da guilda no jogo. */
  guild: string;
  /** Realm (servidor) do personagem principal. */
  realm: string;
  /** Temporada atual do WoW, ex: "The War Within Season 2". */
  currentSeason: string;
  /** Nome da raid ativa no momento, ex: "Nerub-ar Palace". */
  currentRaid: string;
  /** Data da última atualização manual dos dados, formato ISO 8601. */
  lastUpdated: string;
  /** Informações sobre a próxima sessão de raid agendada. */
  nextRaid: {
    /** Data da próxima raid, formato ISO 8601 (ex: "2025-07-16"). */
    date: string;
    /** Horário de início da raid, formato "HH:MM" (ex: "20:00"). */
    time: string;
    /** Objetivo principal da sessão, ex: "Progressão no último boss". */
    objective: string;
  };
  /** Destaques da semana corrente lidos do JSON_Store. */
  weeklyHighlights: {
    /** Melhor DPS da semana, ou null se não disponível. */
    bestDps: PlayerHighlight | null;
    /** Melhor HPS (heal) da semana, ou null se não disponível. */
    bestHps: PlayerHighlight | null;
    /** Melhor tank da semana, ou null se não disponível. */
    bestTank: PlayerHighlight | null;
    /** Melhor chave mítica da semana, ou null se não disponível. */
    bestKey: { player: string; dungeon: string; level: number } | null;
    /** Jogador da semana, ou null se não disponível. */
    playerOfTheWeek: PlayerHighlight | null;
  };
}

// ---------------------------------------------------------------------------
// Boss / Progressão
// ---------------------------------------------------------------------------

/**
 * Representa um boss da raid com status de progressão e links externos.
 */
export interface Boss {
  /** Identificador único do boss em kebab-case, ex: "ulgrax-the-devourer". */
  id: string;
  /** Nome completo do boss exibido na interface. */
  name: string;
  /** Status atual do encontro: morto, em progressão ou não iniciado. */
  status: "killed" | "progress" | "not_started";
  /** Quantidade total de pulls (tentativas) no boss. */
  pulls: number;
  /**
   * Melhor percentual de pull registrado (0–100).
   * Null quando o boss ainda não foi iniciado.
   */
  bestPullPercent: number | null;
  /**
   * Data da kill no formato ISO 8601.
   * Null quando o boss ainda não foi morto.
   */
  killDate: string | null;
  /** Links externos para registros e análises do boss. */
  links: {
    /** URL do log no Warcraft Logs, ou null. */
    warcraftLogs: string | null;
    /** URL da análise no Wipefest, ou null. */
    wipefest: string | null;
    /** URL do vídeo da kill (YouTube, Twitch VOD etc.), ou null. */
    video: string | null;
  };
}

// ---------------------------------------------------------------------------
// Roster / Jogadores
// ---------------------------------------------------------------------------

/**
 * Representa um membro do roster com dados de performance e links externos.
 */
export interface Player {
  /** Identificador único do personagem em kebab-case ou lowercase, ex: "voidwar". */
  id: string;
  /** Nome do personagem no jogo, exatamente como exibido. */
  name: string;
  /** Classe WoW do personagem. */
  class: WowClass;
  /** Raça WoW do personagem. */
  race: WowRace;
  /** Especialização ativa, ex: "Protection", "Fire", "Restoration". */
  spec: string;
  /**
   * Hero Spec selecionada (sistema de The War Within), ex: "Mountain Thane".
   * Null quando o personagem não possui Hero Spec definida.
   */
  heroSpec: string | null;
  /** Papel do personagem no grupo: tank, healer ou dps. */
  role: "tank" | "healer" | "dps";
  /** Indica se é o personagem principal ou alternativo do jogador. */
  type: "main" | "alt";
  /** Nick do Discord do jogador, ou null se não cadastrado. */
  discord: string | null;
  /**
   * URL do avatar do personagem (render.worldofwarcraft.com).
   * Null quando não disponível — o componente exibe um placeholder genérico.
   */
  avatar: string | null;
  /**
     * Metas individuais de performance do personagem.
     * Calculadas a partir de simulações, Warcraft Logs ou definidas manualmente.
     */
  performanceGoals?: PlayerPerformanceGoals;
  /** Estatísticas e perfil do Raider.IO. */
  raiderIo: {
    /** Pontuação IO atual, ou null se não disponível. */
    io: number | null;
    /** Nome da dungeon com melhor performance, ou null. */
    bestDungeon: string | null;
    /** Nível da maior chave completada, ou null. */
    highestKey: number | null;
    /** Posição de ranking no realm atual, ou null. */
    realmRank: number | null;
    /** URL do perfil no Raider.IO, ou null. */
    profileUrl: string | null;
  };
  /** Estatísticas e perfil do Warcraft Logs. */
  warcraftLogs: {
    /** Parse médio em percentil (0–100), ou null. */
    avgParse: number | null;
    /** Melhor parse em percentil (0–100), ou null. */
    bestParse: number | null;
    /** Percentual de presença nas raids (0–100), ou null. */
    attendance: number | null;
    /** URL do perfil no Warcraft Logs, ou null. */
    profileUrl: string | null;
  };
  /** Links externos rápidos exibidos nos botões do card. */
  externalLinks: {
    /** URL do perfil no Raider.IO, ou null. */
    raiderIo: string | null;
    /** URL do personagem no Raidbots, ou null. */
    raidbots: string | null;
    /** URL do personagem no Archon.gg, ou null. */
    archon: string | null;
    /** URL do perfil no Warcraft Logs, ou null. */
    warcraftLogs: string | null;
    /** URL da análise no Wipefest, ou null. */
    wipefest: string | null;
  };
}

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

/**
 * Registro de um item de loot distribuído durante uma sessão de raid.
 */
export interface Loot {
  /** Identificador único do registro de loot, ex: "loot-001". */
  id: string;
  /** Data da distribuição do loot, formato ISO 8601. */
  date: string;
  /** Referência ao `id` do jogador que recebeu o item. */
  player: string;
  /** Nome do item obtido, ex: "Mantle of the Silken Court". */
  itemName: string;
  /** Item level do item, ex: 626, 639. */
  itemLevel: number;
  /** Referência ao `id` do boss de onde o item dropou. */
  boss: string;
  /** Número da semana de raid em que o loot foi distribuído. */
  week: number;
}

// ---------------------------------------------------------------------------
// Logs Semanais
// ---------------------------------------------------------------------------

/**
 * Registro de uma sessão de raid semanal com destaques e links.
 */
export interface WeeklyLog {
  /** Número sequencial da semana, ex: 1, 2, 3. */
  weekNumber: number;
  /** Data da sessão de raid, formato ISO 8601. */
  date: string;
  /** Duração total da sessão em minutos. */
  durationMinutes: number;
  /** Quantidade de bosses mortos na sessão. */
  bossesKilled: number;
  /** Destaques individuais da sessão. */
  highlights: {
    /** Melhor DPS da sessão, ou null. */
    bestDps: PlayerHighlight | null;
    /** Melhor HPS (heal) da sessão, ou null. */
    bestHps: PlayerHighlight | null;
    /** Melhor tank da sessão, ou null. */
    bestTank: PlayerHighlight | null;
    /** Jogador da semana eleito pela liderança, ou null. */
    playerOfTheWeek: PlayerHighlight | null;
  };
  /** Links para análises externas da sessão. */
  links: {
    /** URL do relatório no Warcraft Logs, ou null. */
    warcraftLogs: string | null;
    /** URL da análise no Wipefest, ou null. */
    wipefest: string | null;
  };
}

// ---------------------------------------------------------------------------
// Planejamento Semanal
// ---------------------------------------------------------------------------

/**
 * Dados de planejamento da semana atual: objetivos, composição e avisos.
 */
export interface Schedule {
  /** Lista de objetivos da semana, ex: "Matar Queen Ansurek em Mítico". */
  weekObjectives: string[];
  /** Composição planejada por role para a próxima sessão. */
  composition: {
    /** Nomes dos tanks confirmados. */
    tanks: string[];
    /** Nomes dos healers confirmados. */
    healers: string[];
    /** Nomes dos DPS confirmados. */
    dps: string[];
  };
  /** Lista de jogadores com ausência confirmada na semana. */
  absences: string[];
  /** Notas e avisos publicados pela liderança do core. */
  leadershipNotes: string[];
}

// ---------------------------------------------------------------------------
// Ferramentas Externas
// ---------------------------------------------------------------------------

/**
 * Ferramenta externa da comunidade WoW exibida na seção Ferramentas.
 */
export interface Tool {
  /** Nome da ferramenta, ex: "Raider.IO". */
  name: string;
  /** Descrição breve da utilidade da ferramenta, em português. */
  description: string;
  /** URL da ferramenta (deve abrir em nova aba). */
  url: string;
  /** Categoria da ferramenta para agrupamento na interface. */
  category: ToolCategory;
}

// ---------------------------------------------------------------------------
// Regras da Guilda
// ---------------------------------------------------------------------------

/**
 * Categoria de regras da guilda com label de exibição e lista de regras.
 */
export interface RuleCategory {
  /** Identificador da categoria de regra. */
  category: RuleCategoryId;
  /** Rótulo legível exibido na interface, ex: "Comportamento". */
  label: string;
  /** Lista de regras da categoria em português. */
  rules: string[];
}

// ---------------------------------------------------------------------------
// Tipos de Suporte para Utilitários
// ---------------------------------------------------------------------------

/**
 * Estatísticas agregadas de Mythic+ calculadas a partir do roster.
 */
export interface MythicStats {
  /** Média de IO de todos os jogadores com IO disponível. */
  avgIo: number;
  /** Maior IO individual encontrado no roster. */
  maxIo: number;
  /** Distribuição de jogadores por faixa de IO. */
  distribution: {
    /** Número de jogadores com IO >= 2500. */
    tier2500: number;
    /** Número de jogadores com IO >= 3000. */
    tier3000: number;
    /** Número de jogadores com IO >= 3500. */
    tier3500: number;
    /** Número de jogadores com IO >= 4000. */
    tier4000: number;
  };
}

/**
 * Filtros aplicáveis à tabela de loots na seção Loots.
 * Campos undefined ou null indicam filtro inativo.
 */
export interface LootFilters {
  /** Filtrar por número de semana, ou null/undefined para ignorar. */
  week?: number | null;
  /** Filtrar por id do jogador, ou null/undefined para ignorar. */
  player?: string | null;
  /** Filtrar por id do boss, ou null/undefined para ignorar. */
  boss?: string | null;
}

/**
 * Estatísticas de loot por jogador calculadas por `computeLootStats`.
 */
export interface LootStats {
  /** Referência ao `id` do jogador. */
  playerId: string;
  /** Nome do jogador para exibição. */
  playerName: string;
  /** Total de itens recebidos pelo jogador. */
  totalLoots: number;
  /**
   * Data do loot mais recente do jogador, formato ISO 8601.
   * Null quando o jogador nunca recebeu loot.
   */
  lastLootDate: string | null;
  /** Média de loots recebidos por mês. */
  avgPerMonth: number;
}
