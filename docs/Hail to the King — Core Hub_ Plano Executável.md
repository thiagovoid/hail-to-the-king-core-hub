# Hail to the King — Core Hub
## Plano Executável do Ecossistema da Guild

> **Objetivo:** transformar o Core Hub de um site de consulta de performance em uma plataforma digital completa da Hail to the King.

---

# 1. Visão do Produto

O Core Hub será o ponto central da guild:

```text
                         HAIL TO THE KING
                                │
                         ┌──────┴──────┐
                         │  CORE HUB   │
                         └──────┬──────┘
                                │
       ┌────────────┬───────────┼───────────┬────────────┐
       │            │           │           │            │
   Performance   Community   Recruitment  Content    Operations
       │            │           │           │            │
     WCL etc.      Events     Applications  Media      Guild Data
     Analyzer      Rewards    Trials        News       Attendance
     Raidbots      Quiz       Members       Creators   Progression
       │
       └──────────────────────────────────────────────┐
                                                      │
                                                   ADDON
                                                      │
                                                     WoW
```

O produto será construído incrementalmente.

A regra principal será:

> **Cada fase deve entregar algo utilizável antes de começar a próxima.**

---

# 2. Estratégia de Implementação

## Não construir tudo ao mesmo tempo

O projeto será dividido em:

```text
FASE 0  → Fundação
FASE 1  → Core Hub 2.0
FASE 2  → Performance Engine
FASE 3  → Guild OS
FASE 4  → Recruitment
FASE 5  → Community + Events
FASE 6  → Content + Creators
FASE 7  → Chronicle + Gamificação
FASE 8  → Addon
FASE 9  → Automação
FASE 10 → Ecossistema completo
```

Prioridade:

```text
                    VALOR
                      ▲
                      │
         Performance  │  Recruitment
                      │
      Guild OS        │  Community
                      │
       Chronicle      │  Creators
                      │
         Addon        │
                      │
                      └──────────────────►
                           COMPLEXIDADE
```

---

# 3. Princípios Técnicos

## 3.1 Frontend não conhece providers

O frontend nunca deve depender diretamente de:

```text
Warcraft Logs
Wipefest
WoWAnalyzer
Raidbots
Raider.IO
```

Ele deve consumir modelos internos do Core Hub.

Exemplo:

```ts
PlayerPerformance
PerformanceAssessment
RaidReport
MythicRun
PlayerProfile
GuildEvent
Achievement
```

---

# 4. Arquitetura-alvo

A arquitetura deverá evoluir para:

```text
                    ┌─────────────────┐
                    │    FRONTEND     │
                    │      Astro      │
                    └────────┬────────┘
                             │
                       Domain Models
                             │
                    ┌────────▼────────┐
                    │   CORE DOMAIN   │
                    │                 │
                    │ Players         │
                    │ Performance     │
                    │ Guild           │
                    │ Events          │
                    │ Recruitment     │
                    │ Rewards         │
                    │ Chronicle       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   DATA LAYER    │
                    │                 │
                    │ normalized data │
                    │ raw data        │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
         WCL              Wipefest          Raidbots
          │                  │                  │
     WoWAnalyzer          Raider.IO        Blizzard
```

---

# 5. FASE 0 — Fundação

## Objetivo

Preparar o projeto para crescer sem criar dívida arquitetural.

## Entregáveis

### 5.1 Organizar domínio

Criar:

```text
src/
├── domain/
│   ├── guild/
│   ├── player/
│   ├── performance/
│   ├── recruitment/
│   ├── events/
│   ├── rewards/
│   ├── achievements/
│   ├── chronicle/
│   ├── creators/
│   └── media/
│
├── integrations/
│   ├── warcraftlogs/
│   ├── wipefest/
│   ├── wowanalyzer/
│   ├── raidbots/
│   └── raiderio/
│
├── services/
│
├── utils/
│
└── components/
```

Não é obrigatório mover tudo imediatamente.

A migração deve ser incremental.

---

## 5.2 Definir modelos canônicos

Criar tipos para:

```ts
Guild
Player
PlayerPerformance
PerformanceAssessment
PerformanceGoal
Raid
RaidReport
BossEncounter
MythicRun
GuildEvent
GuildAchievement
GuildReward
Creator
NewsArticle
MediaItem
RecruitmentApplication
ChronicleEntry
```

---

## 5.3 Criar IDs estáveis

Todo objeto importante deverá possuir:

```ts
id: string
```

Nunca utilizar nome do personagem como identificador principal.

Exemplo:

```ts
Player {
    id: "player-nerlock",
    name: "Nerlock",
    realm: "...",
}
```

---

## 5.4 Definir status

Exemplo para jogador:

```text
prospect
trial
member
veteran
mentor
retired
```

Exemplo para recrutamento:

```text
new
review
interview
trial
approved
rejected
```

---

## Definition of Done

- [ ] Modelos principais definidos
- [ ] IDs estáveis
- [ ] Performance desacoplada dos providers
- [ ] Estrutura preparada para backend futuro
- [ ] Site atual continua funcionando

---

# 6. FASE 1 — Core Hub 2.0

## Objetivo

Transformar a homepage em um verdadeiro dashboard da guild.

---

# 6.1 Nova Homepage

A homepage deverá responder:

> “O que está acontecendo na Hail to the King?”

Estrutura:

```text
HERO

STATUS DA GUILD

CORE PERFORMANCE

PROGRESSÃO

MYTHIC+

PRÓXIMOS EVENTOS

ÚLTIMAS NOTÍCIAS

DESTAQUES

CREATORS

RECRUITMENT

HISTÓRIA
```

---

# 6.2 Guild Pulse

Criar componente:

```text
GuildPulse
```

Exemplo:

```text
CORE PULSE

🟢 Raid hoje
19/20 jogadores

⚔️ Progressão
5/8

🔥 Mythic+
14 keys esta semana

👥 Recrutamento
2 vagas abertas

🏆 Último achievement
...
```

---

# 6.3 Dashboard da guild

Criar:

```text
/guild
```

Com:

- status
- progressão
- atividade
- membros
- M+
- raids
- performance
- eventos
- achievements

---

# 6.4 Página de história

Criar:

```text
/historia
```

Conteúdo:

- fundação em 2012
- origem da guild
- pilares
- timeline
- momentos históricos
- membros importantes

---

# Definition of Done

- [ ] Homepage funciona como dashboard
- [ ] Guild Pulse
- [ ] Guild Dashboard
- [ ] História
- [ ] Timeline inicial
- [ ] Navegação reorganizada

---

# 7. FASE 2 — Performance Engine

## Objetivo

Transformar dados de performance em **diagnóstico e desenvolvimento**.

Hoje:

```text
DPS
Parse
Deaths
Mechanics
```

Evoluir para:

```text
Combate
Mecânicas
Preparação
Rotação
Cooldowns
Sobrevivência
Utilidade
```

---

# 7.1 Modelo

```ts
PerformanceAssessment {
    playerId

    combat
    mechanics
    preparation
    rotation
    cooldowns
    survivability
    utility

    overall
}
```

Cada área deve possuir:

```ts
score
status
metrics
evidence
recommendations
```

---

# 7.2 Separar três conceitos

Obrigatório:

```text
MÉTRICA
    ↓
OBJETIVO
    ↓
AVALIAÇÃO
```

Exemplo:

```text
DPS: 112k

Objetivo: 105k

Simulação: 126k

Avaliação:
89% do potencial simulado
```

---

# 7.3 Performance Profile

No perfil:

```text
COMBAT
████████░░ 84

MECHANICS
█████████░ 91

PREPARATION
██████████ 100

ROTATION
███████░░░ 76

SURVIVAL
██████████ 100
```

---

# 7.4 Development Plan

Cada jogador terá:

```text
MEU DESENVOLVIMENTO

🔴 Prioridade
Rotação

🟡 Melhorar
DPS relativo ao potencial

🟢 Manter
Mecânicas

🟢 Excelente
Preparação
```

---

# 7.5 Provider Architecture

Criar interface:

```ts
interface DataProvider {
    name: string;

    fetchPlayerData(
        player: Player
    ): Promise<ProviderResult>;
}
```

Implementações:

```text
WarcraftLogsProvider
WipefestProvider
WoWAnalyzerProvider
RaidbotsProvider
RaiderIOProvider
```

---

# 7.6 Normalização

Pipeline:

```text
Provider
   ↓
Raw Data
   ↓
Normalizer
   ↓
Canonical Data
   ↓
Performance Engine
   ↓
Assessment
   ↓
Frontend
```

---

# Definition of Done

- [ ] Performance Profile
- [ ] Assessment
- [ ] Goals
- [ ] Development Plan
- [ ] Provider interface
- [ ] Normalização
- [ ] WCL integrado sem contaminar o domínio
- [ ] Estrutura preparada para novos providers

---

# 8. FASE 3 — Guild OS

## Objetivo

Criar o núcleo administrativo da guild.

---

# 8.1 Área de membros

Criar:

```text
/membros
/membros/:id
```

Evoluir perfil para:

```text
Identidade
Performance
Histórico
Achievements
Eventos
Contribuições
Criador
Badges
```

---

# 8.2 Roster

Criar visão:

```text
TANK
HEALER
DPS
```

Filtros:

- classe
- spec
- role
- servidor
- status
- atividade

---

# 8.3 Attendance

Registrar:

```text
Raid
Data
Jogador
Presença
Ausência
Justificada
```

Dashboard:

```text
Attendance
92%
```

---

# 8.4 Core Health

Criar indicador:

```text
CORE HEALTH

Performance      🟢
Attendance       🟢
Recruitment      🟡
Activity         🟢
Roster           🟡
Progression      🟢
```

---

# 8.5 Officer Dashboard

Criar:

```text
/admin
```

Com:

```text
Core Health
Roster
Attendance
Recruitment
Performance
Events
Rewards
News
```

---

# Definition of Done

- [ ] Member dashboard
- [ ] Officer dashboard
- [ ] Attendance
- [ ] Core Health
- [ ] Roster avançado

---

# 9. FASE 4 — Recruitment Center

## Objetivo

Transformar o site em uma máquina de recrutamento.

---

# 9.1 Página pública

Criar:

```text
/recrutamento
```

Mostrar:

```text
QUEM SOMOS

O QUE PROCURAMOS

O QUE OFERECEMOS

COMO FUNCIONA

VAGAS

APLICAR
```

---

# 9.2 Vagas

Exemplo:

```text
🔥 HEALER

Alta prioridade

Raid
Mythic+

Servidor:
Todos

Experiência:
Intermediário+
```

---

# 9.3 Application

Criar formulário:

```text
BattleTag
Character
Realm
Class
Spec
Role
Armory
Raider.IO
WCL
Disponibilidade
Experiência
Objetivos
Sobre o jogador
```

---

# 9.4 Pipeline

```text
NEW
 ↓
REVIEW
 ↓
INTERVIEW
 ↓
TRIAL
 ↓
APPROVED
```

---

# 9.5 Recruitment Score

Nunca usar apenas DPS.

Avaliar:

```text
Performance
Experience
Attendance
Mechanics
Preparation
Social Fit
Communication
Availability
```

---

# 9.6 Cross-server recruitment

Mensagem central:

> Você não precisa estar no mesmo servidor para fazer parte da Hail to the King.

Criar página específica para isso.

---

# Definition of Done

- [ ] Recruitment page
- [ ] Open positions
- [ ] Application
- [ ] Pipeline
- [ ] Candidate profile
- [ ] Trial tracking
- [ ] Recruitment analytics

---

# 10. FASE 5 — Events + Community

## Objetivo

Fazer o site gerar atividade, não apenas apresentar informação.

---

# 10.1 Event System

Criar:

```ts
GuildEvent {
    id
    title
    type
    date
    description
    participants
    rewards
}
```

Tipos:

```text
Raid
Mythic+
Social
PvP
Quiz
Contest
Community
Special
```

---

# 10.2 Calendário

Criar:

```text
/eventos
```

Com:

- calendário
- próximos eventos
- RSVP
- participantes
- resultado

---

# 10.3 Eventos especiais

Implementar templates:

```text
M+ Tournament
Transmog Contest
Leveling Race
Guild Quiz
Treasure Hunt
Achievement Night
World PvP
Alt Night
Game Night
Watch Party
Guild Anniversary
```

---

# 10.4 Community Points

Criar sistema opcional:

```text
Raid             +10
Event            +10
Quiz             +5
Help a member    +10
Guide            +20
Creator content  +20
Mentoring        +20
```

Não transformar isso em competição obrigatória.

---

# Definition of Done

- [ ] Event model
- [ ] Calendar
- [ ] RSVP
- [ ] Event results
- [ ] Community points
- [ ] Leaderboard opcional

---

# 11. FASE 6 — Creator Hub + Media

## Objetivo

Transformar os criadores da guild em parte do ecossistema.

---

# 11.1 Creator Hub

Criar:

```text
/criadores
```

Cards:

```text
Avatar
Nome
Especialidade
Twitch
YouTube
TikTok
Discord
Status
```

---

# 11.2 Live Status

Mostrar:

```text
🔴 AO VIVO
```

Quando possível através das APIs disponíveis.

---

# 11.3 Creator Profile

Criar:

```text
/criadores/:id
```

Com:

- bio
- canais
- vídeos
- lives
- clips
- especialidade
- conquistas

---

# 11.4 Media

Criar:

```text
/midia
```

Categorias:

```text
Screenshots
Clips
Vídeos
Memes
Eventos
Achievements
Fan Art
```

---

# 11.5 Creator → Recruitment

Criadores devem funcionar também como porta de entrada.

Fluxo:

```text
Conteúdo
 ↓
Creator
 ↓
Core Hub
 ↓
Guild
 ↓
Recruitment
```

---

# Definition of Done

- [ ] Creator Hub
- [ ] Creator profiles
- [ ] Live status
- [ ] Media gallery
- [ ] Creator content feed

---

# 12. FASE 7 — Chronicle + Achievements + Rewards

## Objetivo

Criar memória permanente da guild.

---

# 12.1 Chronicle

Criar:

```text
/chronicle
```

Exemplo:

```text
MIDNIGHT — SEASON 2

43 raids
812 wipes
91 keys +15
3 novos membros
2 achievements importantes

MVP:
Voidwar
```

---

# 12.2 Timeline automática

Eventos:

```text
2012
Guild fundada

2024
Primeiro grande achievement

2026
Nova temporada

...
```

---

# 12.3 Hall of Fame

Criar:

```text
/hall-da-fama
```

Categorias:

```text
MVP
Veteran
Mythic+
Raid
Mentor
Creator
Community
Achievement
```

---

# 12.4 Guild Achievements

Criar:

```ts
GuildAchievement {
    id
    title
    description
    category
    date
    players
}
```

Exemplos:

```text
First Raid
First +10
First +20
100 Raids
500 Keys
Zero Death Week
First CE
Mentor
Veteran
Creator
```

---

# 12.5 Rewards

Categorias:

```text
Performance
Consistency
Community
Mythic+
Special
```

A regra será:

> Recompensar contribuição, não apenas ranking bruto.

---

# Definition of Done

- [ ] Chronicle
- [ ] Timeline
- [ ] Hall of Fame
- [ ] Guild achievements
- [ ] Player badges
- [ ] Rewards
- [ ] Season MVP

---

# 13. FASE 8 — Academia

## Objetivo

Fazer o Core Hub ensinar os jogadores.

---

# 13.1 Academia

Criar:

```text
/academia
```

Categorias:

```text
Iniciante
Mythic+
Raid
Classes
Performance
Mechanics
Addons
UI
```

---

# 13.2 Player Learning Path

Exemplo:

```text
NÍVEL 1
Fundamentos
       ↓
NÍVEL 2
Rotação
       ↓
NÍVEL 3
Mecânicas
       ↓
NÍVEL 4
Performance
       ↓
NÍVEL 5
Alta performance
       ↓
MENTOR
```

---

# 13.3 Recomendações personalizadas

A partir do Performance Assessment:

```text
Player
 ↓
Performance
 ↓
Weak Areas
 ↓
Recommended Guides
 ↓
Learning
 ↓
New Performance
```

Exemplo:

```text
Seu maior ponto de melhoria:

Cooldown Usage

Leia:
"Como planejar cooldowns durante uma raid"

Depois:
Faça novamente o boss.

Objetivo:
>90% cooldown efficiency
```

---

# Definition of Done

- [ ] Academy
- [ ] Guides
- [ ] Categories
- [ ] Learning paths
- [ ] Performance → Guide recommendation

---

# 14. FASE 9 — News + Editorial

## Objetivo

Transformar o site em um canal vivo.

Criar:

```text
/noticias
```

Tipos:

```text
Announcement
Guild News
WoW News
Guide
Event
Achievement
Recruitment
Creator
```

---

# 14.1 Homepage

Mostrar:

```text
ÚLTIMAS NOTÍCIAS
```

---

# 14.2 Destaques

Criar:

```text
Featured
```

Para:

- achievements
- first kills
- eventos
- creators
- recrutamento

---

# Definition of Done

- [ ] News model
- [ ] News listing
- [ ] Article page
- [ ] Categories
- [ ] Featured content

---

# 15. FASE 10 — Addon

## Objetivo

Levar o Core Hub para dentro do WoW.

O addon não deve duplicar o site.

Ele será:

> **o cliente in-game do Core Hub.**

---

# 15.1 Arquitetura

```text
               WORLD OF WARCRAFT
                       │
                       ▼
                  CORE HUB ADDON
                       │
          ┌────────────┼────────────┐
          │            │            │
       Context     Collection   Communication
          │            │            │
          └────────────┼────────────┘
                       ▼
                    BACKEND
                       │
                       ▼
                   CORE HUB
```

---

# 15.2 Dashboard

```text
CORE HUB

Performance 84

DPS          91
Mechanics    94
Survival     72
Cooldowns    78
```

---

# 15.3 Focus da Raid

Mostrar:

```text
MEU FOCO HOJE

🎯 Parse > 80
💀 Deaths = 0
⚙ Mechanics < 3
🔥 Cooldowns > 90%
```

---

# 15.4 Guild Pulse

```text
CORE PULSE

Raid hoje 🟢

19/20

Progress:
5/8

M+:
14 keys

Recruitment:
2 vagas
```

---

# 15.5 Notificações

Exemplos:

```text
📅 Raid começa em 30 minutos

🔥 Novo evento criado

🏆 Novo achievement

🔴 Creator da guild está live

👥 Recrutamento atualizado
```

---

# 15.6 Boss Assistant

Durante a raid:

```text
BOSS

Seu objetivo:
Mechanics < 2

Deaths:
0

Parse:
78

Focus:
Cooldowns
```

Após o combate:

```text
RESULTADO

DPS       112k
Parse      78
Deaths      0
Mechanics   1

Boa execução.

Próximo foco:
Cooldown usage
```

---

# 15.7 Chronicle Integration

Após uma conquista:

```text
FIRST KILL!

Boss:
XXXXXXXX

Pulls:
37

Duration:
6:42

MVP:
Voidwar
```

Esse evento poderá alimentar o Chronicle.

---

# Definition of Done

Primeira versão do addon:

- [ ] Login/identidade
- [ ] Guild Pulse
- [ ] Raid reminders
- [ ] Personal goals
- [ ] Performance summary
- [ ] Basic notifications

Não implementar todo o addon de uma vez.

---

# 16. Backend

## Momento correto

Não criar backend complexo na Fase 0.

O backend deve surgir quando:

```text
dados externos
+
dados de membros
+
eventos
+
recruitment
+
addon
```

passarem a exigir persistência real.

---

# 16.1 Backend mínimo

Possível stack:

```text
API
Node / TypeScript

Database
PostgreSQL

Cache
Redis

Jobs
Queue / Cron

Auth
OAuth / Discord / Battle.net
```

A escolha definitiva deve ser feita quando a necessidade aparecer.

---

# 16.2 Serviços

```text
core-api
     │
     ├── players
     ├── guild
     ├── performance
     ├── recruitment
     ├── events
     ├── rewards
     ├── chronicle
     ├── creators
     └── notifications
```

---

# 17. Automação

Depois que os módulos estiverem estáveis:

```text
SCHEDULED JOB
      ↓
FETCH PROVIDERS
      ↓
NORMALIZE
      ↓
ANALYZE
      ↓
STORE
      ↓
UPDATE CORE
      ↓
NOTIFY
```

Exemplo:

```text
Segunda-feira

↓
Importar raids

↓
Atualizar performance

↓
Calcular evolução

↓
Detectar pontos de melhoria

↓
Atualizar perfil

↓
Gerar resumo semanal
```

---

# 18. Weekly Guild Report

Criar relatório automático:

```text
HAIL TO THE KING
WEEKLY REPORT

RAIDS
3

M+
42

ATTENDANCE
91%

AVERAGE PARSE
76

DEATHS
18

TOP EVOLUTION
Nerlock

MOST CONSISTENT
Voidwar

NEW MEMBERS
2

ACHIEVEMENTS
3
```

---

# 19. Ordem Real de Desenvolvimento

A ordem recomendada é:

```text
1. Fundação
       ↓
2. Homepage / Guild Dashboard
       ↓
3. Performance Engine
       ↓
4. Member System
       ↓
5. Officer Dashboard
       ↓
6. Recruitment
       ↓
7. Events
       ↓
8. Community / Rewards
       ↓
9. Creators / Media
       ↓
10. Chronicle
       ↓
11. Academy
       ↓
12. News
       ↓
13. Backend / API
       ↓
14. Addon
       ↓
15. Automation
```

---

# 20. O que NÃO fazer agora

Para evitar overengineering:

## Não construir inicialmente

- microservices
- sistema de IA complexo
- addon completo
- app mobile
- chat próprio
- sistema financeiro
- marketplace
- ranking global
- sistema de pontos extremamente complexo
- scraping indiscriminado
- integração com dezenas de APIs simultaneamente

---

# 21. MVP Estratégico

Se fosse necessário escolher apenas **5 coisas**, seriam:

### 1. Guild Dashboard

Mostrar:

```text
Progress
Roster
M+
Raid
Events
Recruitment
```

### 2. Performance Engine

Transformar:

```text
DPS
Parse
Mechanics
Deaths
```

em:

```text
Performance
Assessment
Goals
Development
```

### 3. Recruitment

Criar um fluxo real:

```text
Visitante
 ↓
Application
 ↓
Analysis
 ↓
Trial
 ↓
Member
```

### 4. Events

Criar motivo para visitar o site:

```text
Raid
M+
Quiz
Contests
Social
```

### 5. Chronicle

Criar memória:

```text
Players
Achievements
First kills
Seasons
History
```

Esses cinco módulos já transformariam completamente o Core Hub.

---

# 22. Backlog Inicial

## EPIC 01 — Foundation

- [ ] Criar domain models
- [ ] Criar provider interfaces
- [ ] Padronizar IDs
- [ ] Definir data contracts
- [ ] Documentar arquitetura

---

## EPIC 02 — Guild Dashboard

- [ ] Guild Pulse
- [ ] Progression widget
- [ ] Mythic+ widget
- [ ] Recruitment widget
- [ ] Events widget
- [ ] News widget

---

## EPIC 03 — Performance

- [ ] Canonical metrics
- [ ] Assessment
- [ ] Performance Profile
- [ ] Goals
- [ ] Development Plan
- [ ] Provider architecture
- [ ] WCL adapter

---

## EPIC 04 — Members

- [ ] Member profile
- [ ] Roster
- [ ] Roles
- [ ] Status
- [ ] Achievements
- [ ] Badges
- [ ] Attendance

---

## EPIC 05 — Recruitment

- [ ] Recruitment page
- [ ] Open positions
- [ ] Application
- [ ] Candidate profile
- [ ] Candidate pipeline
- [ ] Trial
- [ ] Approval

---

## EPIC 06 — Events

- [ ] Event model
- [ ] Calendar
- [ ] Event page
- [ ] RSVP
- [ ] Participants
- [ ] Results

---

## EPIC 07 — Community

- [ ] Community points
- [ ] Leaderboard
- [ ] Quiz
- [ ] Rewards
- [ ] Guild achievements

---

## EPIC 08 — Content

- [ ] News
- [ ] Media
- [ ] Creator Hub
- [ ] Creator profile
- [ ] Live status

---

## EPIC 09 — Chronicle

- [ ] Timeline
- [ ] Seasons
- [ ] First kills
- [ ] Guild achievements
- [ ] Hall of Fame
- [ ] Historical statistics

---

## EPIC 10 — Academy

- [ ] Guides
- [ ] Categories
- [ ] Learning paths
- [ ] Recommendations
- [ ] Performance integration

---

## EPIC 11 — Backend

- [ ] API
- [ ] Database
- [ ] Authentication
- [ ] Persistence
- [ ] Jobs
- [ ] Notifications

---

## EPIC 12 — Addon

- [ ] Addon skeleton
- [ ] Authentication
- [ ] Guild Pulse
- [ ] Goals
- [ ] Notifications
- [ ] Raid assistant
- [ ] Performance summary

---

# 23. Definition of Done Global

Uma funcionalidade somente será considerada concluída quando:

```text
Código
  +
Dados
  +
UI
  +
Estados vazios
  +
Estados de erro
  +
Responsividade
  +
Acessibilidade básica
  +
Testes
  +
Documentação
```

estiverem implementados.

---

# 24. Regra para Claude Code

Antes de implementar qualquer tarefa:

```text
1. Inspecionar o código existente.

2. Identificar componentes reutilizáveis.

3. Identificar modelos existentes.

4. Identificar possíveis conflitos arquiteturais.

5. Propor a menor alteração necessária.

6. Implementar.

7. Rodar build/testes.

8. Corrigir regressões.

9. Resumir arquivos alterados.

10. Registrar decisões arquiteturais importantes.
```

Claude Code **não deve assumir que uma estrutura descrita neste documento já existe no repositório**.

O repositório atual é a fonte de verdade.

---

# 25. Estratégia de Commits

Cada incremento deverá ser pequeno.

Exemplo:

```text
feat(guild): add guild pulse dashboard

feat(performance): introduce canonical assessment model

feat(recruitment): add recruitment positions

feat(events): add guild event model

feat(chronicle): add guild timeline
```

Evitar commits gigantes como:

```text
feat: implement entire guild ecosystem
```

---

# 26. Roadmap de Entrega

## Milestone 1 — Core Hub 2.0

```text
Foundation
+
Guild Dashboard
+
Performance
```

Resultado:

> O Core Hub passa a ser o painel principal da guild.

---

## Milestone 2 — Guild OS

```text
Members
+
Roster
+
Attendance
+
Officer Dashboard
```

Resultado:

> A guild começa a operar através do Core Hub.

---

## Milestone 3 — Growth

```text
Recruitment
+
Events
+
Community
```

Resultado:

> O Core Hub começa a gerar crescimento e atividade.

---

## Milestone 4 — Culture

```text
Creators
+
Media
+
Rewards
+
Achievements
+
Chronicle
```

Resultado:

> O Core Hub começa a representar a cultura e a história da guild.

---

## Milestone 5 — Learning

```text
Academy
+
Performance Recommendations
+
Learning Paths
```

Resultado:

> O Core Hub passa a ajudar os jogadores a evoluírem.

---

## Milestone 6 — Platform

```text
Backend
+
Integrations
+
Automation
+
Addon
```

Resultado:

> O Core Hub deixa de ser apenas um site e passa a ser uma plataforma.

---

# 27. Métricas de sucesso

O sucesso não deve ser medido apenas por visitas.

## Guild

```text
Active Members
Attendance
Raid Participation
M+ Activity
Retention
```

## Recruitment

```text
Applications
Qualified Candidates
Trials
Conversion
Retention
```

## Performance

```text
Average Parse
Performance Evolution
Mechanics Improvement
Deaths
Goal Completion
```

## Community

```text
Events
Participants
Content
Creators
Quiz participation
Community contributions
```

## Product

```text
Weekly Active Users
Returning Users
Addon Users
Feature Usage
```

---

# 28. Visão Final

O Core Hub deverá evoluir:

```text
SITE
 ↓
DASHBOARD
 ↓
GUILD OS
 ↓
COMMUNITY PLATFORM
 ↓
PERFORMANCE PLATFORM
 ↓
LEARNING PLATFORM
 ↓
IN-GAME CLIENT
 ↓
DIGITAL ECOSYSTEM
```

E o ciclo completo será:

```text
                    VISITANTE
                       │
                       ▼
                   CORE HUB
                       │
              ┌────────┴────────┐
              │                 │
          CONHECE            PARTICIPA
          A GUILD              EVENTO
              │                 │
              └────────┬────────┘
                       ▼
                   RECRUIT
                       │
                       ▼
                     TRIAL
                       │
                       ▼
                    MEMBER
                       │
                       ▼
                  PERFORMANCE
                       │
                       ▼
                   ACADEMIA
                       │
                       ▼
                    EVOLVE
                       │
              ┌────────┴────────┐
              │                 │
            CREATOR           MENTOR
              │                 │
              └────────┬────────┘
                       ▼
                   COMMUNITY
                       │
                       ▼
                  ACHIEVEMENTS
                       │
                       ▼
                   CHRONICLE
                       │
                       ▼
                 HALL OF FAME
```

---

# 29. Princípio definitivo

O Core Hub não deve tentar substituir Discord, Warcraft Logs, Raider.IO, Twitch ou outras ferramentas.

Ele deve ser a **camada que conecta tudo isso**.

```text
              EXTERNAL WORLD
                     │
       ┌─────────────┼─────────────┐
       │             │             │
      WCL        Raider.IO     Raidbots
       │             │             │
       └─────────────┼─────────────┘
                     │
                     ▼
               ┌───────────┐
               │ CORE HUB  │
               └─────┬─────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    Performance   Community    History
        │            │            │
        ▼            ▼            ▼
      Player       Guild        Chronicle
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
                   ADDON
                     │
                     ▼
                    WOW
```

A visão final é:

> **O Core Hub não é o site da Hail to the King.**
>
> **É a representação digital da Hail to the King.**

Ele deve conectar **jogadores, performance, aprendizado, recrutamento, eventos, criadores, comunidade e história** em um único ecossistema.