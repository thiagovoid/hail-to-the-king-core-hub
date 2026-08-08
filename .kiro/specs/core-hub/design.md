# Documento de Design — Hail to the King: Core Hub

## Overview

O Core Hub é um portal web estático construído com **Astro**, **TailwindCSS** e **TypeScript**, hospedado no **GitHub Pages**. Toda a persistência de dados é feita através de arquivos JSON estáticos que são lidos em tempo de build pelo Astro. Não há backend, banco de dados ou chamadas de API em tempo de execução na Fase 1.

O objetivo central de design é produzir HTML pré-renderizado de alta performance com tema escuro inspirado em Warcraft Logs e Raider.IO, totalmente responsivo e acessível.

---

## Architecture

```
Repositório GitHub
│
├── /src
│   ├── /pages          — Páginas Astro (.astro) — uma por seção
│   ├── /components     — Componentes reutilizáveis (.astro)
│   ├── /layouts        — Layout global (BaseLayout.astro)
│   ├── /utils          — Funções utilitárias TypeScript puras
│   ├── /types          — Interfaces e tipos TypeScript
│   └── /styles         — global.css com variáveis de tema
│
├── /data               — JSON_Store (dados simulados)
│   ├── roster.json
│   ├── rules.json
│   ├── tools.json
│   ├── loot.json
│   ├── schedule.json
│   ├── /weekly
│   │   ├── week-01.json
│   │   └── week-02.json
│   └── /seasons
│       └── midnight-s1.json
│
├── /public             — Assets estáticos (imagens, ícones, favicon)
│
├── astro.config.mjs    — Configuração do Astro (output: static)
├── tailwind.config.mjs — TailwindCSS com tema customizado
├── tsconfig.json       — TypeScript strict: true
└── .github/workflows/deploy.yml — GitHub Actions para GitHub Pages
```

### Fluxo de Build

```
JSON_Store (/data/*.json)
     │
     ▼  leitura em tempo de build via import() dinâmico
Astro Pages (.astro)
     │
     ▼  astro build
/dist (HTML + CSS + JS estático, pré-renderizado)
     │
     ▼  GitHub Actions push → gh-pages branch
GitHub Pages (URL pública)
```

Não há JavaScript de cliente para busca de dados — tudo é pré-renderizado. JavaScript de cliente existe apenas para interatividade leve: menu hambúrguer, e filtros de loot via script inline com `dataset` attributes.

---

## Components and Interfaces

### Layout Global

**`BaseLayout.astro`**
- Props: `title: string`, `description: string`
- Renderiza: `<head>` com meta tags e viewport, `<NavBar />`, `<slot />`, `<Footer />`

**`NavBar.astro`**
- Menu sticky com links para todas as seções (Home, Progressão, Roster, Mythic+, Logs, Loots, Planejamento, Ferramentas, Regras)
- Em mobile: colapsa em botão hambúrguer com `aria-expanded` e controle por script inline mínimo
- `aria-label="Menu principal"`, `role="navigation"` na tag `<nav>`

**`Footer.astro`**
- Exibe nome do projeto, data da última atualização (lida de `schedule.json`) e link para GitHub

---

### Componentes de Home

**`HeroSection.astro`**
- Props: `config: SiteConfig`
- Exibe nome do core, guild, realm, temporada, raid atual e data de atualização

**`SummaryCard.astro`**
- Props: `title: string`, `value: string | number | null | undefined`, `subtitle?: string`, `icon?: string`
- Exibe `"—"` via `formatValue()` quando `value` é `null` ou `undefined`

---

### Componentes de Progressão

**`BossCard.astro`**
- Props: `boss: Boss`
- Acordeão nativo via `<details>/<summary>` — sem JavaScript
- Exibe indicador ✓ (verde) para `killed` e ✗ (vermelho) para `progress`/`not_started`
- Links externos condicionais via `safeUrl()` — tag `<a>` omitida quando URL é nula

---

### Componentes de Roster

**`PlayerCard.astro`**
- Props: `player: Player`
- Exibe avatar do personagem (`player.avatar`) em destaque; fallback para placeholder genérico quando nulo
- Nome do personagem com cor de classe via `getClassColor(player.class)`
- Linha de identidade abaixo do nome: Raça · Classe · Spec (ex: "Dwarf · Warrior · Protection")
- Badge de Hero Spec quando `player.heroSpec` não é nulo (ex: "Mountain Thane")
- Exibe `"—"` via `formatValue()` para todos os campos opcionais nulos
- Botões de link rápido: renderizados condicionalmente com `safeUrl()`, `target="_blank" rel="noopener noreferrer"`

---

### Componentes de Mythic+

**`MythicRankingTable.astro`**
- Props: `players: Player[]`
- Usa `sortPlayersByIo()` em tempo de build; empates exibidos na mesma posição de rank

**`MythicStatsBar.astro`**
- Props: `stats: MythicStats`
- Exibe média de IO, maior IO e distribuição por faixa de IO

---

### Componentes de Logs

**`WeeklyLogCard.astro`**
- Props: `week: WeeklyLog`
- Exibe data, duração, bosses mortos, destaques e links da sessão

---

### Componentes de Loots

**`LootTable.astro`** (com filtro client-side)
- Props: `loots: Loot[]`, `players: string[]`, `bosses: string[]`
- Filtros por Semana, Jogador e Boss via `<select>` e script inline usando `dataset`
- Empty state: "Nenhum loot encontrado para os filtros selecionados."

**`LootStats.astro`**
- Props: `stats: LootStats[]`
- Exibe estatísticas por jogador calculadas por `computeLootStats()`

---

### Componentes de Planejamento, Ferramentas e Regras

**`PlanningSection.astro`** — exibe objetivos, composição por role, ausências e avisos da liderança

**`ToolCard.astro`** — nome, descrição e link externo em nova aba

**`RulesSection.astro`** — categorias com listas de regras; categorias vazias são omitidas

---

## Data Models

Todos os tipos estão definidos em `src/types/index.ts`.

### SiteConfig

```typescript
interface SiteConfig {
  coreName: string;         // "Hail to the King"
  guild: string;
  realm: string;            // ex: "Azralon"
  currentSeason: string;    // ex: "Midnight Season 1"
  currentRaid: string;      // ex: "Liberation of Undermine"
  lastUpdated: string;      // ISO 8601
  nextRaid: {
    date: string;           // ISO 8601
    time: string;           // "20:00"
    objective: string;
  };
  weeklyHighlights: {
    bestDps: PlayerHighlight | null;
    bestHps: PlayerHighlight | null;
    bestTank: PlayerHighlight | null;
    bestKey: { player: string; dungeon: string; level: number } | null;
    playerOfTheWeek: PlayerHighlight | null;
  };
}
```

### Boss

```typescript
interface Boss {
  id: string;
  name: string;
  status: "killed" | "progress" | "not_started";
  pulls: number;
  bestPullPercent: number | null;  // 0–100, null se not_started
  killDate: string | null;          // ISO 8601, null se não morto
  links: {
    warcraftLogs: string | null;
    wipefest: string | null;
    video: string | null;
  };
}
```

### Player

```typescript
type WowClass =
  | "death-knight" | "demon-hunter" | "druid" | "evoker"
  | "hunter" | "mage" | "monk" | "paladin" | "priest"
  | "rogue" | "shaman" | "warlock" | "warrior";

type WowRace =
  | "human" | "dwarf" | "night-elf" | "gnome" | "draenei" | "worgen"
  | "dark-iron-dwarf" | "kul-tiran" | "mechagnome" | "lightforged-draenei"
  | "void-elf" | "orc" | "troll" | "tauren" | "undead" | "blood-elf"
  | "goblin" | "pandaren" | "highmountain-tauren" | "nightborne"
  | "mag-har-orc" | "zandalari-troll" | "vulpera" | "dracthyr" | "earthen";

interface Player {
  id: string;
  name: string;
  class: WowClass;
  race: WowRace;               // raça do personagem
  spec: string;
  heroSpec: string | null;     // hero spec (ex: "Mountain Thane", "Frostfire")
  role: "tank" | "healer" | "dps";
  type: "main" | "alt";
  discord: string | null;
  avatar: string | null;       // URL do render do personagem (render.worldofwarcraft.com)
  raiderIo: {
    io: number | null;
    bestDungeon: string | null;
    highestKey: number | null;
    realmRank: number | null;
    profileUrl: string | null;
  };
  warcraftLogs: {
    avgParse: number | null;    // 0–100
    bestParse: number | null;   // 0–100
    attendance: number | null;  // 0–100
    profileUrl: string | null;
  };
  externalLinks: {
    raiderIo: string | null;
    raidbots: string | null;
    archon: string | null;
    warcraftLogs: string | null;
    wipefest: string | null;
  };
}
```

### Loot

```typescript
interface Loot {
  id: string;
  date: string;          // ISO 8601
  player: string;        // player.id
  itemName: string;
  itemLevel: number;
  boss: string;          // boss.id
  week: number;
}
```

### WeeklyLog

```typescript
interface PlayerHighlight {
  playerName: string;
  class: WowClass;
  value: string;   // ex: "142.5k DPS", "87% parse"
}

interface WeeklyLog {
  weekNumber: number;
  date: string;           // ISO 8601
  durationMinutes: number;
  bossesKilled: number;
  highlights: {
    bestDps: PlayerHighlight | null;
    bestHps: PlayerHighlight | null;
    bestTank: PlayerHighlight | null;
    playerOfTheWeek: PlayerHighlight | null;
  };
  links: {
    warcraftLogs: string | null;
    wipefest: string | null;
  };
}
```

### Schedule

```typescript
interface Schedule {
  weekObjectives: string[];
  composition: {
    tanks: string[];
    healers: string[];
    dps: string[];
  };
  absences: string[];
  leadershipNotes: string[];
}
```

### Tool e Rule

```typescript
type ToolCategory =
  | "mythic-plus" | "simulation" | "builds"
  | "raid" | "economy" | "utilities";

interface Tool {
  name: string;
  description: string;
  url: string;
  category: ToolCategory;
}

type RuleCategoryId =
  | "behavior" | "raid" | "attendance" | "loot" | "recruitment";

interface RuleCategory {
  category: RuleCategoryId;
  label: string;
  rules: string[];
}
```

### Tipos de Suporte para Utils

```typescript
interface MythicStats {
  avgIo: number;
  maxIo: number;
  distribution: {
    tier2500: number;
    tier3000: number;
    tier3500: number;
    tier4000: number;
  };
}

interface LootFilters {
  week?: number | null;
  player?: string | null;
  boss?: string | null;
}

interface LootStats {
  playerId: string;
  playerName: string;
  totalLoots: number;
  lastLootDate: string | null;
  avgPerMonth: number;
}
```

---

## Correctness Properties

*Uma propriedade é uma característica ou comportamento que deve ser verdadeiro em todas as execuções válidas de um sistema — essencialmente, uma declaração formal sobre o que o sistema deve fazer. As propriedades servem de ponte entre especificações legíveis por humanos e garantias de correção verificáveis por máquinas.*

### Property 1: Campos ausentes nunca produzem texto inválido

*Para qualquer* valor de entrada (`null`, `undefined`, string vazia, número, boolean ou objeto), a função `formatValue` deve sempre retornar uma string não-vazia e nunca deve retornar as strings literais `"null"`, `"undefined"` ou `"NaN"`. Para entradas nulas, vazias ou indefinidas, deve retornar exatamente `"—"`.

**Validates: Requirements 2.9, 4.6**

---

### Property 2: Contagem e percentual de progressão são matematicamente corretos

*Para qualquer* lista de `Boss` com combinação arbitrária de `status` (`"killed"`, `"progress"`, `"not_started"`), a função `computeProgression` deve retornar um objeto onde `killed` é exatamente o número de bosses com `status === "killed"`, `total` é o comprimento do array, e `percent` é `Math.round((killed / total) * 100)` com valor no intervalo `[0, 100]`.

**Validates: Requirements 2.2, 3.1**

---

### Property 3: Ordenação do ranking de Mythic+ por IO decrescente

*Para qualquer* lista de `Player` com valores de IO arbitrários (incluindo `null`), a função `sortPlayersByIo` deve retornar um array onde: (a) nenhum player é perdido ou duplicado em relação ao array original, (b) para cada par consecutivo `(a, b)` no resultado, `(a.raiderIo.io ?? -1) >= (b.raiderIo.io ?? -1)`, e (c) players com IO `null` aparecem por último.

**Validates: Requirements 5.1, 5.4**

---

### Property 4: Filtragem de loots satisfaz completeness e soundness

*Para qualquer* lista de `Loot` e combinação de `LootFilters`, a função `filterLoots` deve retornar um array onde: (a) todo item no resultado satisfaz todos os filtros ativos simultaneamente (soundness), e (b) nenhum item do array original que satisfaz todos os filtros está ausente do resultado (completeness). Adicionalmente, `filterLoots(loots, {})` deve retornar um array com os mesmos itens que o original (round-trip sem filtro).

**Validates: Requirements 7.3, 7.4, 7.5**

---

### Property 5: Links nulos nunca geram elementos âncora no HTML

*Para qualquer* entidade (Boss ou Player) no JSON_Store onde um campo de URL é `null` ou string vazia, a função `safeUrl` deve retornar `null`, e nenhum elemento `<a>` deve ser gerado para esse link no HTML renderizado.

**Validates: Requirements 3.6, 4.5**

---

### Property 6: Mapeamento de cor de classe é total e válido

*Para qualquer* valor do tipo `WowClass`, a função `getClassColor` deve retornar uma string CSS não-vazia representando a cor da classe. Para entrada `null` ou valor inválido, deve retornar a string de fallback `"text-gray-300"`.

**Validates: Requirements 4.7, 13.5**

---

## Error Handling

| Situação | Comportamento |
|---|---|
| Campo `null` ou `undefined` em dado opcional | `formatValue()` retorna `"—"`; componente não quebra |
| Array vazio no JSON_Store | Componente exibe mensagem de estado vazio da seção |
| Link externo `null` | `safeUrl()` retorna `null`; tag `<a>` não é renderizada |
| Arquivo JSON inválido | Build falha com erro descritivo no terminal (fail-fast) |
| Imagem não encontrada | `alt` text exibido; layout não quebra via `width`/`height` explícitos |
| Filtro de loot sem resultados | "Nenhum loot encontrado para os filtros selecionados." |
| Semana sem arquivo JSON | "Nenhum log disponível ainda." na seção de Logs |
| Schedule vazio | "Planejamento da semana ainda não publicado." em todas as subseções |

---

## Testing Strategy

### Abordagem Dual

Os testes cobrem duas camadas complementares:

1. **Testes unitários** — verificam exemplos concretos, casos de borda e funções utilitárias TypeScript puras
2. **Testes de propriedade** — verificam propriedades universais sobre transformações de dados (via Vitest + fast-check, mínimo 100 iterações por propriedade)

### Configuração

- **Framework**: Vitest
- **Biblioteca PBT**: fast-check
- **Cobertura mínima**: 80% nas funções utilitárias (`src/utils/`)
- **Execução**: `vitest run` (single-run, sem watch mode)

### Funções Utilitárias a Testar (`src/utils/`)

| Arquivo | Função | Propriedades |
|---|---|---|
| `format.ts` | `formatValue(v)` | Propriedade 1 |
| `format.ts` | `formatDate(iso)` | Unitário + edge cases |
| `format.ts` | `formatPercent(n)` | Unitário |
| `progression.ts` | `computeProgression(bosses)` | Propriedade 2 |
| `progression.ts` | `safeUrl(url)` | Propriedade 5 |
| `roster.ts` | `sortPlayersByIo(players)` | Propriedade 3 |
| `roster.ts` | `getClassColor(cls)` | Propriedade 6 |
| `roster.ts` | `computeMythicStats(players)` | Unitário |
| `loot.ts` | `filterLoots(loots, filters)` | Propriedade 4 |
| `loot.ts` | `computeLootStats(loots)` | Unitário |

### Anotação de Testes de Propriedade

Cada teste de propriedade deve ser anotado com o comentário:
```
// Feature: core-hub, Property N: <texto resumido da propriedade>
```

### Testes Unitários

- `formatValue`: `null`, `undefined`, `0`, `""`, `"texto"`, `42`
- `formatDate`: ISO válido, ISO inválido, `null`
- `sortPlayersByIo`: lista vazia, um jogador, todos com IO nulo, empates
- `filterLoots`: sem filtro, filtro único, múltiplos filtros, filtro sem resultados
- `computeProgression`: todos mortos (100%), nenhum morto (0%), parcial
- `safeUrl`: URL válida, string vazia, `null`, URL inválida

### Testes de Performance e Acessibilidade

- Lighthouse CI via GitHub Actions após cada deploy (meta: ≥ 90 em todas as categorias)
- Auditoria manual com axe DevTools por página antes da entrega
