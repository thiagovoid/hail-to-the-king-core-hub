# Core Hub Performance Platform

## Objetivo

Transformar o Core Hub em uma plataforma centralizadora de dados de performance de World of Warcraft, agregando informações provenientes de múltiplas ferramentas externas e convertendo esses dados em métricas de evolução individual e coletiva.

O Core Hub não deve depender de uma ferramenta específica.

A arquitetura deve permitir que novas fontes sejam adicionadas futuramente sem necessidade de alterar o restante do sistema.

---

# Visão Geral

Hoje os dados estão espalhados em diversas ferramentas:

| Ferramenta | Tipo de Informação |
|------------|-------------------|
| Warcraft Logs | DPS, HPS, Parses, Deaths |
| Wipefest | Mecânicas, preparação, erros |
| WoW Analyzer | Rotação, cooldowns, uptime |
| Raidbots | Simulações, metas teóricas |
| Raider.IO | Mythic+, score, progresso |
| Archon | Benchmarks da spec |
| Bloodmallet | Estatísticas de equipamentos |
| Future Tools | Qualquer nova ferramenta |

O Core Hub será responsável apenas por:

1. Coletar dados.
2. Normalizar dados.
3. Calcular métricas.
4. Gerar metas.
5. Exibir evolução.

---

# Princípio Principal

A aplicação nunca deve consumir diretamente um site externo.

Toda integração deve passar por um sistema de Providers.

Fluxo:

```text
Warcraft Logs
       \
        \
         > Provider
        /
Wipefest
       \
        \
         > Normalização
        /
WoW Analyzer

         ↓

Performance Engine

         ↓

Player Profile

         ↓

Frontend Astro
```

---

# Arquitetura de Camadas

## 1. Providers Layer

Responsável por buscar dados.

Cada ferramenta possui seu próprio provider.

Exemplo:

```text
providers/

  warcraftlogs/
    WarcraftLogsProvider.ts

  wipefest/
    WipefestProvider.ts

  wowanalyzer/
    WowAnalyzerProvider.ts

  raidbots/
    RaidbotsProvider.ts
```

Interface comum:

```ts
interface DataProvider {
  fetch(player: Player): Promise<ProviderResult>;
}
```

Todos os providers devem seguir esta interface.

---

# 2. Acquisition Layer

Responsável por executar os providers.

```text
services/

  DataCollector.ts
```

Exemplo:

```ts
await collector.run();
```

Funções:

- executar todos os providers
- controlar falhas
- controlar rate limit
- controlar cache
- salvar resultados brutos

---

# 3. Raw Storage Layer

Guardar exatamente o que veio da ferramenta.

Nunca alterar.

Estrutura:

```text
data/raw/

  warcraftlogs/
      week-01.json

  wipefest/
      week-01.json

  analyzer/
      week-01.json
```

Objetivo:

- debug
- auditoria
- reprocessamento

---

# 4. Normalization Layer

Transforma qualquer formato em um modelo único.

Exemplo:

Warcraft Logs:

```json
{
  "parse": 84,
  "dps": 92000
}
```

Wipefest:

```json
{
  "score": 91,
  "deaths": 1
}
```

Modelo interno:

```json
{
  "playerId": "voidwar",
  "week": 2,
  "metrics": {
    "dps": 92000,
    "parse": 84,
    "wipefestScore": 91,
    "deaths": 1
  }
}
```

---

# 5. Unified Performance Model

Criar um modelo único para toda a plataforma.

```ts
interface UnifiedPerformance {
  playerId: string;
  week: number;

  dps?: number;
  hps?: number;
  parse?: number;

  deaths?: number;

  mechanicErrors?: number;

  wipefestScore?: number;

  analyzerScore?: number;

  cooldownUsage?: number;

  uptime?: number;

  simDps?: number;

  itemLevel?: number;
}
```

Toda a aplicação deve utilizar apenas este modelo.

---

# 6. Metrics Engine

Camada responsável pelos cálculos.

```text
engine/

  metrics/
```

Exemplos:

```ts
calculateParseEvolution()
calculateDpsEvolution()
calculateMechanicEvolution()
calculateConsistency()
calculateAttendance()
calculateGoalProgress()
```

Nenhuma regra de negócio deve ficar nos providers.

---

# 7. Goal Engine

Responsável por criar metas.

Exemplo:

```ts
Goal {
  metric: "parse";
  target: 90;
}
```

---

## Metas Individuais

Exemplo:

```json
{
  "player": "Voidwar",
  "goals": {
    "parse": 90,
    "mechanics": 0,
    "deaths": 0
  }
}
```

---

## Metas Dinâmicas

Futuramente:

```text
Seu parse médio é 82.

Meta recomendada:
90.
```

---

# 8. Score Engine

Criar score geral do jogador.

Exemplo:

```text
Parse: 30%
Mecânicas: 25%
Cooldowns: 20%
Deaths: 15%
Preparação: 10%
```

Resultado:

```text
Overall Performance Score
87/100
```

---

# 9. Team Analytics Engine

Camada para métricas do grupo.

Exemplos:

- DPS médio do core
- Parse médio
- Mortes por boss
- Erros por mecânica
- Ranking interno
- Evolução semanal

Estrutura:

```text
engine/team/
```

---

# 10. Snapshot System

Toda coleta gera um snapshot.

```text
week-01
week-02
week-03
week-04
```

Nunca sobrescrever dados antigos.

Isso permitirá:

- gráficos históricos
- evolução real
- comparações

---

# Estrutura de Diretórios

```text
src/

  providers/
    warcraftlogs/
    wipefest/
    wowanalyzer/
    raidbots/

  services/
    DataCollector.ts

  engine/
    metrics/
    goals/
    scores/
    team/

  models/
    UnifiedPerformance.ts

data/

  raw/
    warcraftlogs/
    wipefest/
    wowanalyzer/

  normalized/
    performance/

  snapshots/
```

---

# Estratégia de Integração

## Prioridade 1

Warcraft Logs

Motivo:

- fonte mais confiável
- API disponível
- dados estruturados

Métricas:

- DPS
- HPS
- Parse
- Deaths

---

## Prioridade 2

Wipefest

Métricas:

- mechanics score
- deaths
- consumables
- preparation

---

## Prioridade 3

Raidbots

Métricas:

- sim DPS
- potencial teórico

---

## Prioridade 4

WoW Analyzer

Métricas:

- cooldown usage
- uptime
- rotação

---

# Sobre Web Scraping

Scraping deve ser considerado apenas quando:

```text
API inexistente
E
Dados relevantes
```

Arquitetura recomendada:

```text
Provider
    ↓
HTML Fetch
    ↓
Parser
    ↓
Normalized Result
```

Nunca misturar scraping com regras de negócio.

---

# Visão de Longo Prazo

O objetivo final não é apenas exibir logs.

O objetivo é responder perguntas como:

- Quem mais evoluiu nas últimas 4 semanas?
- Quem está mais próximo das metas?
- Quem possui melhor consistência?
- Qual jogador está abaixo do potencial do personagem?
- Quais mecânicas causam mais wipes?
- O core está melhorando ou piorando?

O Core Hub passa a ser uma camada de inteligência acima das ferramentas existentes, utilizando Warcraft Logs, Wipefest, WoW Analyzer, Raidbots e futuras integrações apenas como fontes de dados.