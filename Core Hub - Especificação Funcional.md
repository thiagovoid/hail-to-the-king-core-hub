# Core Hub - Especificação Funcional

## Visão Geral

### Objetivo

Criar um portal web estático para centralizar todas as informações relevantes do core de raid do World of Warcraft.

O site será atualizado semanalmente e utilizado como ponto único de consulta para todos os membros do grupo.

O link ficará fixado no Discord do core.

O objetivo é reduzir a dispersão de informações entre Discord, Raider.IO, Warcraft Logs, Wipefest, planilhas e mensagens, consolidando tudo em um único local.

---

# Objetivos do Projeto

## Objetivos Principais

- Centralizar informações do core.
- Facilitar acompanhamento da progressão.
- Melhorar transparência do grupo.
- Facilitar onboarding de novos membros.
- Preservar histórico da temporada.
- Compartilhar estatísticas e conquistas semanais.

---

# Público-Alvo

## Membros do Core

Consultam:

- Escalação
- Horários
- Progressão
- Loots
- Logs
- Vídeos
- Planejamento

## Liderança

Utiliza para:

- Comunicação oficial
- Controle do roster
- Planejamento semanal
- Divulgação de resultados

## Recrutas

Utilizam para:

- Conhecer o grupo
- Avaliar desempenho do core
- Entender regras e expectativas

---

# Tecnologias

## Frontend

- HTML5
- CSS3
- TypeScript
- Astro
- TailwindCSS

## Hospedagem

- GitHub Pages

## Controle de versão

- GitHub

## Integrações Externas

- Raider.IO API
- Warcraft Logs API
- Discord
- YouTube

---

# Estrutura Geral

```text
Home
Progressão
Roster
Mythic+
Logs
Vídeos
Loots
Planejamento
Ferramentas
Regras
Histórico
```

---

# Página Inicial

## Objetivo

Apresentar uma visão rápida do estado atual do core.

---

## Hero Section

Exibir:

- Nome do Core
- Guild
- Realm
- Temporada Atual
- Raid Atual
- Última Atualização

Exemplo:

```text
Hail to the King

Midnight Season 1

Liberation of Undermine

7/8 Mythic

Atualizado em:
08/08/2026
```

---

## Cards de Resumo

### Progressão

- Bosses derrotados
- Percentual concluído

### Média Raider.IO

- Média do grupo

### Melhor Key da Semana

### Participação da Raid

### Loots Distribuídos

### Próxima Raid

### Jogador da Semana

---

# Seção Progressão

## Objetivo

Mostrar evolução da raid atual.

---

## Lista de Bosses

Cada boss deverá exibir:

- Status
- Melhor tentativa
- Quantidade de pulls
- Data da kill

Exemplo:

```text
✓ Boss 1
✓ Boss 2
✓ Boss 3
✓ Boss 4
✓ Boss 5
✓ Boss 6
✓ Boss 7
✗ Boss Final
```

---

## Detalhes do Boss

Ao expandir:

### Estatísticas

- Melhor Pull
- Quantidade de Wipes
- Data da Kill

### Links

- Warcraft Logs
- Wipefest
- Vídeo da Kill

---

# Seção Roster

## Objetivo

Apresentar todos os personagens ativos do core.

---

## Card do Jogador

### Informações Básicas

- Nome
- Classe
- Spec
- Role
- Main ou Alt

### Informações Raider.IO

- IO Atual
- Melhor Dungeon
- Maior Key
- Ranking Realm

### Informações Warcraft Logs

- Parse Médio
- Melhor Parse
- Attendance

### Contato

- Discord

---

## Integrações do Jogador

Cada jogador deverá possuir botões rápidos para:

### Raidbots

Utilizado para:

- Simulações
- Gear Compare

### Archon

Utilizado para:

- Builds
- Talentos
- Estatísticas

### Warcraft Logs

Utilizado para:

- Logs individuais

### Wipefest

Utilizado para:

- Análise de mecânicas

### Raider.IO

Utilizado para:

- Perfil Mythic+

---

## Exemplo de Botões

```text
[Raider.IO]
[Raidbots]
[Archon]
[Warcraft Logs]
[Wipefest]
```

---

# Seção Mythic+

## Objetivo

Acompanhar evolução do grupo em M+.

---

## Ranking Interno

Tabela:

| Rank | Jogador | IO |
|--------|--------|--------|
| 1 | Player | 3900 |
| 2 | Player | 3850 |

---

## Estatísticas

### Média IO

### Melhor IO

### Distribuição por Faixa

- 2500+
- 3000+
- 3500+
- 4000+

---

## Top Keys

Tabela:

| Dungeon | Key |
|----------|----------|
| Priory | +21 |
| Dawnbreaker | +20 |

---

# Seção Logs

## Objetivo

Centralizar todos os Warcraft Logs.

---

## Organização Semanal

```text
Semana 01
Semana 02
Semana 03
Semana 04
```

---

## Dados por Semana

### Raid

- Data
- Duração
- Bosses mortos

### Destaques

- Melhor DPS
- Melhor HPS
- Melhor Tank
- Jogador da Semana

### Links

- Warcraft Logs
- Wipefest

---

# Seção Vídeos

## Objetivo

Criar biblioteca histórica das kills e progressões do core.

---

## Organização

Por temporada.

Exemplo:

```text
Midnight Season 1
```

---

## Organização por Boss

### Boss 1

- First Kill
- Melhor Pull
- Estratégia

### Boss 2

- First Kill
- Melhor Pull

---

## Informações Exibidas

### Vídeo

Embed do YouTube.

### Informações

- Data
- Duração
- Participantes

### Links

- Warcraft Logs
- Wipefest

---

## Destaques

Área especial para:

### Hall of Fame

- Primeira Kill do Tier
- Kill mais difícil
- Pull mais próximo
- Recorde de DPS
- Recorde de HPS

---

# Seção Loots

## Objetivo

Garantir transparência.

---

## Histórico de Loot

Tabela:

| Data | Jogador | Item | Boss |
|--------|--------|--------|--------|

---

## Estatísticas

Por jogador:

- Quantidade de loot
- Último loot
- Média de loot por mês

---

## Filtros

- Semana
- Jogador
- Boss

---

# Seção Planejamento

## Objetivo

Alinhar objetivos da semana.

---

## Objetivos

Exemplo:

```text
- Matar Boss 7
- Chegar ao Boss Final
- Fechar 4 chaves +18
```

---

## Composição Planejada

- Tanks
- Healers
- DPS

---

## Ausências Confirmadas

Lista de ausentes.

---

## Avisos da Liderança

Área para mensagens importantes.

---

# Seção Ferramentas

## Objetivo

Centralizar os melhores recursos da comunidade WoW.

---

## Mythic+

### Raider.IO

Perfil e rankings.

### Keystone.Guru

Rotas de Mythic+.

### Mythic Dungeon Tools

Planejamento de pulls.

---

## Simulações

### Raidbots

Simulações de personagem.

---

## Builds

### Archon

Meta atual.

### Wowhead

Guias.

### Icy Veins

Guias alternativos.

---

## Raid

### Warcraft Logs

Análise de performance.

### Wipefest

Análise de mecânicas.

### Method

Guias de bosses.

---

## Economia

### Undermine Exchange

Mercado e AH.

---

## Utilitários

### Questionably Epic

Ferramentas para healers.

### Bloodmallet

Comparação de trinkets.

---

# Seção Regras

## Comportamento

- Respeito obrigatório.
- Sem toxicidade.
- Ambiente colaborativo.

---

## Raid

- Consumíveis obrigatórios.
- Encantamentos obrigatórios.
- Conhecimento prévio das lutas.

---

## Presença

- Avisar faltas.
- Limite máximo de faltas consecutivas.

---

## Loot

- Critérios de distribuição.
- Prioridades.
- Casos excepcionais.

---

## Recrutamento

- Requisitos mínimos.
- Processo de avaliação.

---

# Dashboard Semanal

## Destaques

### Melhor DPS

### Melhor HPS

### Melhor Tank

### Melhor Key

### Jogador da Semana

### MVP da Raid

### MVP da Progressão

---

# Histórico de Temporadas

## Objetivo

Preservar a história do core.

---

## Por Temporada

### Midnight Season 1

- Progressão final
- Ranking Raider.IO
- Kills
- Vídeos
- Estatísticas

### Temporadas Futuras

Mesma estrutura.

---

# Estrutura de Dados

```text
/data

roster.json

rules.json

tools.json

loot.json

videos.json

schedule.json

weekly/
 ├── week-01.json
 ├── week-02.json
 ├── week-03.json

seasons/
 ├── midnight-s1.json
 ├── midnight-s2.json
```

---

# Requisitos de UX

## Responsividade

- Desktop
- Tablet
- Mobile

---

## Performance

Meta:

- Lighthouse acima de 90
- Tempo de carregamento abaixo de 2 segundos

---

## Acessibilidade

- Navegação por teclado
- Contraste adequado
- Labels acessíveis

---

# Requisitos Visuais

## Tema

Inspirado em:

- Warcraft Logs
- Raider.IO
- Discord
- Tema escuro

---

## Paleta

- Fundo escuro
- Destaques dourados
- Roxo Void
- Verde para kills
- Vermelho para progressão

---

# Roadmap Futuro

## Fase 1

- Estrutura estática
- Roster
- Progressão
- Logs
- Loots
- Regras

## Fase 2

- Integração automática Raider.IO
- Integração automática Warcraft Logs
- Dashboard semanal

## Fase 3

- Estatísticas históricas
- Evolução individual
- Histórico de temporadas
- Hall of Fame permanente

## Fase 4

- Integração Discord
- Publicação automática semanal
- Geração automática de resumo do core