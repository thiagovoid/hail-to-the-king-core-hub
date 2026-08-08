# Implementation Plan: Hail to the King — Core Hub (Fase 1)

## Overview

Implementação incremental do portal web estático usando Astro, TailwindCSS e TypeScript. Cada tarefa produz código funcional que se integra às anteriores. Os dados são servidos por arquivos JSON estáticos em `/data`. O deploy é feito no GitHub Pages via GitHub Actions.

A stack é definida pelo design: **Astro + TailwindCSS + TypeScript**, sem backend. Testes com **Vitest** e **fast-check**.

## Tasks

- [x] 1. Configurar projeto Astro com TailwindCSS, TypeScript e estrutura de diretórios
  - Inicializar projeto Astro com template mínimo (`npm create astro@latest`)
  - Instalar e configurar `@astrojs/tailwind` com `tailwind.config.mjs` usando tema escuro customizado: fundo `#0d1117`, dourado `#f0a500`, verde `#00c48c`, vermelho `#e84040`
  - Configurar `tsconfig.json` com `strict: true` e path alias `@/` apontando para `src/`
  - Configurar `astro.config.mjs` com `output: "static"` e `base` apontando para o repositório GitHub Pages
  - Criar estrutura de diretórios: `src/pages`, `src/components`, `src/layouts`, `src/utils`, `src/types`, `src/styles`
  - Criar diretório `/data` com subdiretórios `data/weekly` e `data/seasons`
  - Instalar Vitest e fast-check: `npm install -D vitest @vitest/coverage-v8 fast-check`
  - Configurar `vitest.config.ts` incluindo arquivos `*.test.ts` em `/src`
  - Criar `.github/workflows/deploy.yml` para deploy automático no GitHub Pages após push na branch `main`
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Definir tipos TypeScript e criar dados simulados JSON
  - [x] 2.1 Criar `src/types/index.ts` com todas as interfaces: `SiteConfig`, `Boss`, `Player`, `WowClass`, `Loot`, `WeeklyLog`, `PlayerHighlight`, `Schedule`, `Tool`, `ToolCategory`, `RuleCategory`, `MythicStats`, `LootFilters`, `LootStats`
    - Incluir comentários JSDoc em cada interface
    - _Requisitos: 1.4, 1.5_

  - [x] 2.2 Criar `data/seasons/midnight-s2.json` com configuração do site (`SiteConfig`) e 8 bosses simulados — 7 mortos com killDate e pulls, 1 em progressão com bestPullPercent; links externos misturados entre preenchidos e `null`
    - _Requisitos: 2.1, 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 2.3 Criar `data/roster.json` com 12 jogadores cobrindo todas as classes e roles (2 tanks, 3 healers, 7 DPS); pelo menos 2 players com campos `raiderIo` nulos e 2 com campos `warcraftLogs` nulos para cobrir o caso de empty state
    - Incluir **Voidwar** como membro real: `class: "warrior"`, `race: "dwarf"`, `spec: "Protection"`, `heroSpec: "Mountain Thane"`, `role: "tank"`, `avatar: "https://render.worldofwarcraft.com/us/character/nemesis/94/91119198-avatar.jpg"`, `raiderIo.io: 3477`, `raiderIo.bestDungeon: "Pit of Saron"`, `raiderIo.highestKey: 17`
    - Todos os jogadores devem incluir os campos `race`, `heroSpec` (ou `null`) e `avatar` (ou `null`) conforme o tipo `Player` atualizado
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 2.4 Criar `data/loot.json` com 25 registros de loot simulados cobrindo diferentes semanas (1–4), jogadores e bosses
    - _Requisitos: 7.1, 7.2_

  - [x] 2.5 Criar `data/schedule.json` com objetivos da semana, composição completa por role, ausências e avisos da liderança simulados
    - _Requisitos: 8.1, 8.2, 8.3, 8.4_

  - [x] 2.6 Criar `data/tools.json` com ferramentas simuladas em todas as 6 categorias: Mythic+, Simulações, Builds, Raid, Economia e Utilitários (mínimo 2 ferramentas por categoria)
    - _Requisitos: 9.1, 9.2_

  - [x] 2.7 Criar `data/rules.json` com regras simuladas nas 5 categorias: Comportamento, Raid, Presença, Loot e Recrutamento (mínimo 3 regras por categoria)
    - _Requisitos: 10.1, 10.2_

  - [x] 2.8 Criar `data/weekly/week-01.json` e `data/weekly/week-02.json` com dados de duas sessões de raid simuladas incluindo destaques e links
    - _Requisitos: 6.1, 6.2, 6.3_

- [x] 3. Implementar funções utilitárias puras em `src/utils/`
  - [x] 3.1 Implementar `src/utils/format.ts` com as funções:
    - `formatValue(v: unknown): string` — retorna `"—"` para `null | undefined | ""`; retorna `String(v)` caso contrário
    - `formatDate(iso: string | null): string` — converte ISO 8601 para `DD/MM/AAAA`; retorna `"—"` para nulo ou data inválida
    - `formatPercent(n: number | null): string` — ex: `"73%"` ou `"—"` para nulo
    - _Requisitos: 2.9, 4.6_

  - [x] 3.2 Escrever testes de propriedade para `formatValue`
    - **Propriedade 1: Campos ausentes nunca produzem texto inválido**
    - **Validates: Requirements 2.9, 4.6**
    - `// Feature: core-hub, Property 1: para qualquer entrada, formatValue nunca retorna "null", "undefined" ou "NaN"`
    - Usar `fc.option(fc.anything())` para gerar valores incluindo `null` e `undefined`
    - Verificar que o resultado é sempre uma string não-vazia
    - Verificar que o resultado nunca é `"null"`, `"undefined"` ou `"NaN"`
    - Verificar que para `null`, `undefined` e `""` o resultado é exatamente `"—"`
    - _Requisitos: 2.9, 4.6_

  - [x] 3.3 Implementar `src/utils/progression.ts` com:
    - `computeProgression(bosses: Boss[]): { killed: number; total: number; percent: number }` — conta kills e calcula percentual arredondado; retorna `{ killed: 0, total: 0, percent: 0 }` para array vazio
    - `safeUrl(url: string | null | undefined): string | null` — retorna `null` para URL nula, undefined ou string vazia; retorna a URL original caso contrário
    - _Requisitos: 2.2, 3.1, 3.6, 4.5_

  - [x] 3.4 Escrever testes de propriedade para `computeProgression`
    - **Propriedade 2: Contagem e percentual de progressão são matematicamente corretos**
    - **Validates: Requirements 2.2, 3.1**
    - `// Feature: core-hub, Property 2: para qualquer lista de bosses, killed/total/percent são consistentes`
    - Gerar arrays de Boss com `status` aleatório entre `"killed" | "progress" | "not_started"`
    - Verificar que `killed === bosses.filter(b => b.status === "killed").length`
    - Verificar que `total === bosses.length`
    - Verificar que `percent === Math.round((killed / total) * 100)` (quando total > 0)
    - Verificar que `0 <= percent <= 100`
    - _Requisitos: 2.2, 3.1_

  - [x] 3.5 Implementar `src/utils/roster.ts` com:
    - `sortPlayersByIo(players: Player[]): Player[]` — ordena por IO decrescente; players com IO `null` por último; empates mantêm ordem relativa; nenhum player é perdido
    - `getClassColor(cls: WowClass | null | undefined): string` — retorna classe CSS Tailwind para a cor da classe WoW; retorna `"text-gray-300"` como fallback para `null`/`undefined`
    - `computeMythicStats(players: Player[]): MythicStats` — calcula média de IO, maior IO e distribuição por faixa (2500+, 3000+, 3500+, 4000+)
    - _Requisitos: 4.7, 5.1, 5.2, 5.4, 13.5_

  - [x] 3.6 Escrever testes de propriedade para `sortPlayersByIo`
    - **Propriedade 3: Ordenação do ranking de Mythic+ por IO decrescente**
    - **Validates: Requirements 5.1, 5.4**
    - `// Feature: core-hub, Property 3: para qualquer lista de players, sortPlayersByIo retorna lista ordenada por IO decrescente sem perder elementos`
    - Gerar listas de Player com IO aleatório entre 0–5000 ou `null`
    - Verificar que para cada par consecutivo `(a, b)`: `(a.raiderIo.io ?? -1) >= (b.raiderIo.io ?? -1)`
    - Verificar que `sorted.length === original.length`
    - Verificar que cada player do original aparece exatamente uma vez no resultado
    - _Requisitos: 5.1, 5.4_

  - [x] 3.7 Escrever testes de propriedade para `getClassColor`
    - **Propriedade 6: Mapeamento de cor de classe é total e válido**
    - **Validates: Requirements 4.7, 13.5**
    - `// Feature: core-hub, Property 6: para qualquer WowClass válida, getClassColor retorna string CSS não-vazia`
    - Verificar que para cada valor do union type `WowClass`, o resultado é uma string não-vazia
    - Verificar que para `null` e `undefined`, retorna `"text-gray-300"`
    - _Requisitos: 4.7, 13.5_

  - [x] 3.8 Implementar `src/utils/loot.ts` com:
    - `filterLoots(loots: Loot[], filters: LootFilters): Loot[]` — aplica filtros por semana, jogador e boss simultaneamente; filtro `null`/`undefined`/vazio é ignorado; retorna todos os itens quando `filters` é `{}`
    - `computeLootStats(loots: Loot[]): LootStats[]` — agrupa por player calculando totalLoots, lastLootDate e avgPerMonth
    - _Requisitos: 7.2, 7.3, 7.4, 7.5_

  - [x] 3.9 Escrever testes de propriedade para `filterLoots`
    - **Propriedade 4: Filtragem de loots satisfaz completeness e soundness**
    - **Validates: Requirements 7.3, 7.4, 7.5**
    - `// Feature: core-hub, Property 4: para qualquer combinação de filtros, todos os resultados satisfazem os filtros e nenhum elegível é omitido`
    - Gerar arrays de Loot e `LootFilters` com campos aleatórios
    - Verificar que todo item no resultado satisfaz todos os filtros ativos (soundness)
    - Verificar que nenhum item do original que satisfaz todos os filtros está ausente do resultado (completeness)
    - Verificar que `filterLoots(loots, {})` retorna os mesmos itens que `loots` (round-trip sem filtro)
    - _Requisitos: 7.3, 7.4, 7.5_

- [x] 4. Ponto de verificação — Testes das utils passando
  - Executar `npx vitest run` e garantir que todos os testes unitários e de propriedade passam
  - Verificar que nenhum teste retorna `"null"`, `"undefined"` ou `"NaN"` nas asserções
  - Resolver qualquer falha antes de prosseguir para os componentes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar layout global e navegação
  - [x] 5.1 Criar `src/types/index.ts` já definido na tarefa 2.1; criar `src/styles/global.css` com variáveis CSS de tema escuro, reset base e classes de cor por classe WoW (`.class-paladin`, `.class-mage`, etc.)
    - _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 5.2 Criar `src/layouts/BaseLayout.astro` com `<head>` completo (meta tags, viewport, canonical title), import de `global.css`, slot para conteúdo de página, `<NavBar />` e `<Footer />`
    - _Requisitos: 11.1, 12.3, 13.1_

  - [x] 5.3 Criar `src/components/NavBar.astro` com menu sticky contendo links para todas as 9 seções; botão hambúrguer para mobile com `aria-expanded`, controlado por script inline mínimo; `aria-label="Menu principal"` e `role="navigation"` na tag `<nav>`
    - _Requisitos: 11.1, 11.4, 11.5, 11.7_

  - [x] 5.4 Criar `src/components/Footer.astro` exibindo nome do projeto, data de última atualização (lida de `data/schedule.json`) e link para o repositório GitHub com `aria-label`
    - _Requisitos: 11.2_

- [x] 6. Implementar Página Inicial (Home)
  - [x] 6.1 Criar `src/components/HeroSection.astro` exibindo nome do core, guild, realm, temporada, raid atual e data de atualização lidos de `data/seasons/midnight-s1.json`
    - _Requisitos: 2.1_

  - [x] 6.2 Criar `src/components/SummaryCard.astro` com props `title`, `value`, `subtitle` e `icon`; usar `formatValue()` para exibir `"—"` quando `value` é nulo ou indefinido
    - _Requisitos: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 6.3 Criar `src/pages/index.astro` importando `BaseLayout`, `HeroSection` e os 7 `SummaryCard` com dados calculados das utils: progressão via `computeProgression()`, média IO via `computeMythicStats()`, total de loots contado do `loot.json`, próxima raid e jogador da semana de `midnight-s1.json`
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 7. Implementar Seção Progressão
  - [x] 7.1 Criar `src/components/BossCard.astro` com acordeão `<details>/<summary>` nativo; exibir ✓ em verde para `killed` e ✗ em vermelho para `progress`/`not_started`; renderizar links externos condicionalmente com `safeUrl()` — omitir tag `<a>` quando retorno é `null`; usar `formatDate()` para a data da kill e `formatPercent()` para o melhor pull
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.3, 13.4_

  - [x] 7.2 Criar `src/pages/progressao.astro` carregando `data/seasons/midnight-s1.json`, calculando progressão geral com `computeProgression()` no cabeçalho e renderizando `BossCard` para cada boss
    - _Requisitos: 3.1, 3.2_

- [x] 8. Implementar Seção Roster
  - [x] 8.1 Criar `src/components/PlayerCard.astro` com layout inspirado no Raider.IO:
    - Exibir avatar do personagem (`player.avatar`) no topo com fallback para placeholder quando nulo
    - Nome do personagem com cor de classe via `getClassColor()` (ex: Warrior = `#c79c6e`)
    - Linha de identidade: "Raça · Classe · Spec" (ex: "Dwarf · Warrior · Protection")
    - Badge de Hero Spec quando `player.heroSpec` não é nulo (ex: "Mountain Thane")
    - Seções de stats: Raider.IO, Warcraft Logs e Discord com `formatValue()` para campos nulos
    - Renderizar os 5 botões de link rápido condicionalmente com `safeUrl()`; garantir `target="_blank" rel="noopener noreferrer"` em todos os links externos
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 8.2 Criar `src/pages/roster.astro` carregando `data/roster.json` e renderizando `PlayerCard` para cada jogador, separando mains de alts visualmente
    - _Requisitos: 4.1_

- [x] 9. Implementar Seção Mythic+
  - [x] 9.1 Criar `src/components/MythicRankingTable.astro` usando `sortPlayersByIo()` em tempo de build; exibir colunas Rank, Jogador e IO; tratar empates exibindo mesmo número de rank; exibir `"—"` para IO nulo
    - _Requisitos: 5.1, 5.4_

  - [x] 9.2 Criar `src/components/MythicStatsBar.astro` usando `computeMythicStats()` exibindo média de IO, maior IO individual e distribuição de jogadores por faixa (2500+, 3000+, 3500+, 4000+)
    - _Requisitos: 5.2_

  - [x] 9.3 Criar `src/pages/mythic.astro` carregando `data/roster.json`, montando ranking e barra de estatísticas, e exibindo tabela de Top Keys lida de `data/weekly/week-02.json`
    - _Requisitos: 5.1, 5.2, 5.3_

- [x] 10. Implementar Seção Logs
  - [x] 10.1 Criar `src/components/WeeklyLogCard.astro` exibindo data, duração (em horas e minutos), bosses mortos, destaques com cor de classe e links para Warcraft Logs e Wipefest (condicionais via `safeUrl()`)
    - _Requisitos: 6.1, 6.2, 6.3_

  - [x] 10.2 Criar `src/pages/logs.astro` carregando todos os arquivos `data/weekly/week-*.json` com `import.meta.glob`, ordenando por `weekNumber` decrescente e renderizando `WeeklyLogCard`; exibir "Nenhum log disponível ainda." quando o array estiver vazio
    - _Requisitos: 6.1, 6.4_

- [x] 11. Implementar Seção Loots
  - [x] 11.1 Criar `src/components/LootTable.astro` exibindo tabela com colunas Data, Jogador, Item e Boss; implementar filtros por Semana, Jogador e Boss via `<select>` e script inline usando `dataset` e `filterLoots()`; exibir "Nenhum loot encontrado para os filtros selecionados." quando array filtrado está vazio
    - _Requisitos: 7.1, 7.3, 7.4, 7.5_

  - [x] 11.2 Criar `src/components/LootStats.astro` exibindo estatísticas por jogador (total de loots, último loot e média/mês) calculadas por `computeLootStats()`
    - _Requisitos: 7.2_

  - [x] 11.3 Criar `src/pages/loots.astro` carregando `data/loot.json` e `data/roster.json` e montando `LootTable` e `LootStats`
    - _Requisitos: 7.1, 7.2_

- [x] 12. Implementar Seção Planejamento
  - Criar `src/pages/planejamento.astro` carregando `data/schedule.json` e exibindo: lista de objetivos da semana, composição planejada separada por role (Tanks, Healers, DPS), lista de ausências confirmadas e avisos da liderança em área visualmente destacada
  - Exibir "Planejamento da semana ainda não publicado." quando `weekObjectives`, `composition` e `leadershipNotes` estiverem todos vazios
  - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 13. Implementar Seção Ferramentas
  - Criar `src/components/ToolCard.astro` com nome, descrição e link externo em nova aba (`target="_blank" rel="noopener noreferrer"`)
  - Criar `src/pages/ferramentas.astro` carregando `data/tools.json`, agrupando ferramentas por categoria e ocultando categorias sem itens
  - _Requisitos: 9.1, 9.2, 9.3_

- [x] 14. Implementar Seção Regras
  - Criar `src/pages/regras.astro` carregando `data/rules.json` e renderizando cada `RuleCategory` com seu label e lista de regras como `<ul><li>` items; ocultar categorias sem regras
  - _Requisitos: 10.1, 10.2, 10.3_

- [x] 15. Ponto de verificação — Build e integração completos
  - Executar `astro build` e verificar ausência de erros de TypeScript ou build
  - Verificar que todas as 9 páginas geram HTML sem strings `"null"`, `"undefined"` ou `"NaN"` visíveis
  - Executar `npx vitest run` para confirmar que todos os testes ainda passam
  - Verificar responsividade nas três breakpoints com DevTools do navegador
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Refinamento de acessibilidade e performance
  - [x] 16.1 Adicionar `width` e `height` explícitos em todas as tags `<img>` para eliminar CLS; adicionar `loading="lazy"` em imagens fora da viewport inicial
    - _Requisitos: 12.3, 12.4_

  - [x] 16.2 Auditar todas as páginas com axe DevTools e corrigir issues: contraste mínimo 4,5:1, `aria-label` ausentes, `role` incorretos; verificar navegação por teclado em acordeões de boss, filtros de loot e menu hambúrguer
    - _Requisitos: 11.5, 11.6, 11.7_

  - [x] 16.3 Adicionar step de Lighthouse CI no `.github/workflows/deploy.yml` para auditar pós-deploy e reprovar workflow se pontuação < 90 em qualquer categoria
    - _Requisitos: 12.1, 12.2_

- [x] 17. Ponto de verificação final — Pronto para deploy
  - Executar `astro build` final e confirmar que `/dist` contém todas as páginas estáticas
  - Executar suite completa com `npx vitest run --coverage` e confirmar cobertura ≥ 80% em `src/utils/`
  - Confirmar que o GitHub Actions workflow está configurado corretamente para deploy no GitHub Pages
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para uma entrega mais rápida (MVP)
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os pontos de verificação garantem validação incremental
- Testes de propriedade usam fast-check com mínimo de 100 iterações por propriedade
- Testes unitários cobrem exemplos concretos e casos de borda
- Fase 2 (integrações automáticas com Raider.IO e Warcraft Logs) começa após aprovação da Fase 1

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"]
    },
    {
      "wave": 2,
      "tasks": ["2"]
    },
    {
      "wave": 3,
      "tasks": ["3"]
    },
    {
      "wave": 4,
      "tasks": ["4"]
    },
    {
      "wave": 5,
      "tasks": ["5"]
    },
    {
      "wave": 6,
      "tasks": ["6", "7", "8", "9", "10", "11", "12", "13", "14"]
    },
    {
      "wave": 7,
      "tasks": ["15"]
    },
    {
      "wave": 8,
      "tasks": ["16"]
    },
    {
      "wave": 9,
      "tasks": ["17"]
    }
  ]
}
```
