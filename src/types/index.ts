
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
 * Vínculo do jogador com a guilda (doc: "5.4 Definir status").
 * Reduzido do vocabulário original do doc — "prospect"/"mentor"/"retired"
 * pertencem a Recrutamento e Badges, domínios que ainda não existem no
 * Core Hub; adicionar esses valores agora criaria um campo sem consumidor,
 * o mesmo problema que a limpeza de dados desta sessão já resolveu uma vez.
 */
export type PlayerStatus = "trial" | "member" | "veteran" | "inactive";

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
 * Usado em `WeeklyHighlights`.
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
// Identidade da Guild (institucional)
// ---------------------------------------------------------------------------

/** Um dos valores centrais da guild, com uma frase curta explicando o que significa na prática. */
export interface GuildPillar {
  name: string;
  description: string;
}

/**
 * Conteúdo institucional da guild — quem somos, não como o core está
 * performando. Lido de `data/guild/about.json`, editado à mão pela
 * liderança (não é gerado por nenhum provider).
 */
export interface GuildAbout {
  founding: {
    year: number;
    text: string;
  };
  purpose: string;
  /** Frase de identidade usada como destaque na página institucional. */
  message: string;
  pillars: GuildPillar[];
}

/**
 * Um marco na história da guild. Lista curada à mão em
 * `data/guild/timeline.json` — cresce por edição direta quando algo
 * relevante acontece, não é um snapshot automático como as séries semanais.
 */
export interface TimelineEntry {
  year: number;
  title: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Configuração do Site
// ---------------------------------------------------------------------------

/**
 * Configuração de nível superior do site, lida do JSON da temporada ativa.
 * Contém apenas dados de identidade do core e da raid atual — quase
 * estáticos, mudam a cada temporada, não a cada semana. Destaques semanais
 * vivem à parte em `WeeklyHighlights` (`data/weekly/highlights/week-NN.json`).
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
}

// ---------------------------------------------------------------------------
// Destaques da Semana
// ---------------------------------------------------------------------------

/**
 * Destaques de uma semana de raid — melhor DPS/HPS/tank, melhor key e
 * jogador da semana. Um arquivo por semana em `data/weekly/highlights/`
 * (mesmo padrão de snapshot do `data/weekly/performance/week-NN.json`): nunca
 * sobrescrito, cada semana é seu próprio registro histórico.
 */
export interface WeeklyHighlights {
  /** Número sequencial da semana, mesma numeração de `data/weekly/performance/week-NN.json`. */
  week: number;
  /** Data de referência da semana (última sessão), formato ISO 8601. */
  date: string;
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
  /** Melhores chaves Mythic+ completadas na semana, ordenadas. */
  topKeys: Array<{ dungeon: string; keyLevel: number }>;
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
  /** Vínculo atual do jogador com a guilda. */
  status: PlayerStatus;
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

