# Requirements Document

## Introduction

O **Core Hub** é um portal web estático que centraliza todas as informações relevantes do core de raid "Hail to the King" do World of Warcraft. O site será construído com Astro, TailwindCSS e TypeScript, hospedado no GitHub Pages, e atualizado manualmente de forma semanal.

A **Fase 1** foca na entrega do site estático com dados simulados (JSON), cobrindo as seções: Home, Progressão, Roster, Mythic+, Logs, Loots, Planejamento, Ferramentas e Regras. Integrações automáticas com APIs externas são roadmap de fases futuras.

---

## Glossary

- **Portal**: O site web estático Core Hub.
- **Core**: O grupo de jogadores fixo que participa das raids.
- **Roster**: Lista de personagens ativos do core com suas informações.
- **Progressão**: Status de avanço na raid atual, expressa em bosses derrotados.
- **Boss**: Encontro de chefe em uma raid do World of Warcraft.
- **Pull**: Uma tentativa de matar um boss.
- **Wipe**: Morte de todos os membros do grupo durante uma tentativa.
- **IO**: Pontuação Raider.IO que reflete a experiência em Mythic+.
- **Mythic_Plus**: Modo de masmorra de alta dificuldade, escalável por nível de chave.
- **Parse**: Percentil de desempenho registrado no Warcraft Logs (0–100).
- **Loot**: Item de equipamento obtido em uma raid ou masmorra.
- **Attendance**: Percentual de presença do jogador nas raids.
- **DPS**: Dano por segundo (papel de dano).
- **HPS**: Cura por segundo (papel de cura).
- **Tank**: Papel de absorção de dano dos bosses.
- **Healer**: Papel de cura dos membros do grupo.
- **Main**: Personagem principal do jogador.
- **Alt**: Personagem alternativo do jogador.
- **Spec**: Especialização de classe escolhida.
- **Role**: Função no grupo (Tank, Healer, DPS).
- **JSON_Store**: Arquivos `.json` estáticos em `/data` que armazenam todos os dados do Portal.
- **Warcraft_Logs**: Serviço externo de registro de desempenho em raids.
- **Wipefest**: Serviço externo de análise de mecânicas de raid.
- **Raider_IO**: Serviço externo de ranking e perfil de Mythic+.
- **Raidbots**: Serviço externo de simulação de personagem.
- **Archon**: Serviço externo de builds e talentos de personagem.
- **Lighthouse**: Ferramenta de auditoria de performance, acessibilidade e SEO do Google.
- **GitHub_Pages**: Serviço de hospedagem estática gratuito integrado ao GitHub.

---

## Requirements

---

### Requisito 1 — Estrutura do Projeto e Build

**User Story:** Como desenvolvedor, quero um projeto Astro configurado com TailwindCSS e TypeScript, para que eu possa construir e publicar o site estaticamente no GitHub Pages.

#### Critérios de Aceitação

1. THE Portal SHALL ser gerado como um conjunto de arquivos HTML, CSS e JavaScript estáticos via `astro build`.
2. THE Portal SHALL ser configurado para deploy automático no GitHub_Pages via GitHub Actions após cada push na branch `main`.
3. THE Portal SHALL utilizar TailwindCSS para estilização com tema escuro como padrão.
4. THE Portal SHALL utilizar TypeScript estrito (`strict: true`) em todos os componentes Astro e scripts de utilitários.
5. THE JSON_Store SHALL armazenar todos os dados simulados em arquivos `.json` dentro do diretório `/data`, acessíveis em tempo de build.
6. WHEN o build é executado, THE Portal SHALL carregar todos os dados do JSON_Store e renderizar as páginas sem erros de TypeScript ou build.

---

### Requisito 2 — Página Inicial (Home)

**User Story:** Como membro do core, quero uma página inicial com visão geral do estado do grupo, para que eu possa acompanhar rapidamente o progresso e as informações mais relevantes.

#### Critérios de Aceitação

1. THE Portal SHALL exibir na Hero Section o nome do core ("Hail to the King"), a guild, o realm, a temporada atual, a raid atual e a data da última atualização lidos do JSON_Store.
2. THE Portal SHALL exibir um card de Progressão com o número de bosses derrotados e o percentual de conclusão da raid atual calculados a partir do JSON_Store.
3. THE Portal SHALL exibir um card de Média Raider.IO com a média de IO do grupo calculada a partir do JSON_Store.
4. THE Portal SHALL exibir um card de Melhor Key da Semana com a dungeon e o nível da maior chave concluída na semana lidos do JSON_Store.
5. THE Portal SHALL exibir um card de Participação da Raid com o percentual médio de presença do roster lido do JSON_Store.
6. THE Portal SHALL exibir um card de Loots Distribuídos com a quantidade total de itens distribuídos na temporada calculada a partir do JSON_Store.
7. THE Portal SHALL exibir um card de Próxima Raid com data, horário e objetivo da próxima sessão lidos do JSON_Store.
8. THE Portal SHALL exibir um card de Jogador da Semana com o nome e classe do destaque semanal lidos do JSON_Store.
9. IF um dado de card não está disponível no JSON_Store, THEN THE Portal SHALL exibir o valor `"—"` no card sem quebrar a renderização da página.

---

### Requisito 3 — Seção Progressão

**User Story:** Como membro do core, quero ver o status detalhado de cada boss da raid atual, para que eu possa acompanhar onde o grupo está na progressão.

#### Critérios de Aceitação

1. THE Portal SHALL exibir a lista completa de bosses da raid atual lida do JSON_Store, com indicador visual de derrota (✓) ou em progressão (✗).
2. THE Portal SHALL exibir para cada boss: nome, status, melhor percentual de pull, quantidade total de pulls e data da kill.
3. WHEN um boss possui `status` igual a `"killed"`, THE Portal SHALL exibir a data da kill no formato DD/MM/AAAA.
4. WHEN um boss possui `status` igual a `"progress"`, THE Portal SHALL exibir o melhor percentual de pull registrado no lugar da data.
5. THE Portal SHALL permitir expandir os detalhes de cada boss exibindo: Melhor Pull (%), total de Wipes, Data da Kill e links externos para Warcraft_Logs, Wipefest e Vídeo da Kill.
6. IF um link externo de boss não está definido no JSON_Store, THEN THE Portal SHALL omitir o elemento `<a>` correspondente sem exibir botão vazio ou quebrar a renderização.

---

### Requisito 4 — Seção Roster

**User Story:** Como membro do core, quero ver todos os jogadores ativos com suas informações de desempenho e links rápidos, para que eu possa consultar o perfil de qualquer membro facilmente.

#### Critérios de Aceitação

1. THE Portal SHALL exibir um card por jogador lido do JSON_Store contendo: avatar do personagem, nome, raça, classe, spec, hero spec (quando disponível), role e indicação de Main ou Alt.
2. THE Portal SHALL exibir o avatar do personagem (`player.avatar`) no topo do card; IF o campo `avatar` é nulo, THEN THE Portal SHALL exibir um placeholder genérico sem quebrar o layout.
3. THE Portal SHALL exibir o nome do personagem com a cor de classe do World of Warcraft correspondente (ex: Warrior = `#c79c6e`, Paladin = `#f58cba`).
4. THE Portal SHALL exibir uma linha de identidade no formato "Raça · Classe · Spec" abaixo do nome (ex: "Dwarf · Warrior · Protection").
5. THE Portal SHALL exibir um badge de Hero Spec abaixo da linha de identidade quando `player.heroSpec` não é nulo (ex: "Mountain Thane").
6. THE Portal SHALL exibir no card as informações de Raider_IO: IO Atual, Melhor Dungeon, Maior Key e Ranking Realm.
7. THE Portal SHALL exibir no card as informações de Warcraft_Logs: Parse Médio, Melhor Parse e Attendance.
8. THE Portal SHALL exibir no card o nick do Discord do jogador.
9. THE Portal SHALL exibir no card botões de link rápido para: Raider_IO, Raidbots, Archon, Warcraft_Logs e Wipefest, usando a URL do personagem definida no JSON_Store.
10. IF um campo de informação de jogador não está preenchido no JSON_Store, THEN THE Portal SHALL exibir `"—"` no lugar do valor sem quebrar a renderização do card.

---

### Requisito 5 — Seção Mythic+

**User Story:** Como membro do core, quero acompanhar o ranking interno de Mythic+ e as top keys da semana, para que eu possa comparar minha evolução com o grupo.

#### Critérios de Aceitação

1. THE Portal SHALL exibir uma tabela de ranking interno de Mythic+ com colunas Rank, Jogador e IO Score, ordenada por IO decrescente lida do JSON_Store.
2. THE Portal SHALL exibir estatísticas agregadas: Média de IO do grupo, Maior IO individual e distribuição de jogadores por faixa de IO (2500+, 3000+, 3500+, 4000+).
3. THE Portal SHALL exibir uma tabela de Top Keys da semana com colunas Dungeon e Nível da Chave, lida do JSON_Store.
4. WHEN dois ou mais jogadores possuem o mesmo IO no ranking interno, THE Portal SHALL exibi-los na mesma posição de rank.

---

### Requisito 6 — Seção Logs

**User Story:** Como membro do core, quero visualizar os registros de raid organizados semanalmente, para que eu possa acessar os logs e ver os destaques de cada sessão.

#### Critérios de Aceitação

1. THE Portal SHALL exibir os logs organizados por semana (Semana 01, Semana 02...), lidos dos arquivos `weekly/week-XX.json` do JSON_Store.
2. THE Portal SHALL exibir por semana: data da raid, duração total da sessão em minutos, quantidade de bosses mortos e destaques (Melhor DPS, Melhor HPS, Melhor Tank, Jogador da Semana).
3. THE Portal SHALL exibir por semana links externos para Warcraft_Logs e Wipefest da sessão quando definidos no JSON_Store.
4. IF nenhum arquivo de semana está disponível no JSON_Store, THEN THE Portal SHALL exibir a mensagem "Nenhum log disponível ainda." na seção sem quebrar a renderização.

---

### Requisito 7 — Seção Loots

**User Story:** Como membro do core, quero ver o histórico de loots distribuídos com filtros por semana, jogador e boss, para que eu possa garantir a transparência na distribuição de itens.

#### Critérios de Aceitação

1. THE Portal SHALL exibir uma tabela histórica de loots com colunas Data, Jogador, Item e Boss, lida do JSON_Store.
2. THE Portal SHALL exibir estatísticas por jogador: quantidade total de loots recebidos, data do último loot e média de loots por mês.
3. THE Portal SHALL permitir filtrar a tabela de loots por Semana, Jogador e Boss de forma simultânea usando controles na interface.
4. WHEN nenhum loot corresponde ao conjunto de filtros ativos, THE Portal SHALL exibir "Nenhum loot encontrado para os filtros selecionados." no lugar da tabela.
5. WHEN todos os filtros são limpos, THE Portal SHALL restaurar a exibição completa da tabela de loots.

---

### Requisito 8 — Seção Planejamento

**User Story:** Como membro do core, quero ver os objetivos, composição e avisos da semana, para que eu possa me preparar adequadamente para a próxima sessão de raid.

#### Critérios de Aceitação

1. THE Portal SHALL exibir a lista de objetivos da semana lida do JSON_Store (`schedule.json`).
2. THE Portal SHALL exibir a composição planejada para a semana separada por role: Tanks, Healers e DPS.
3. THE Portal SHALL exibir a lista de ausências confirmadas da semana.
4. THE Portal SHALL exibir os avisos da liderança em área visualmente destacada.
5. IF não há dados de planejamento disponíveis no JSON_Store, THEN THE Portal SHALL exibir "Planejamento da semana ainda não publicado." em todas as subseções.

---

### Requisito 9 — Seção Ferramentas

**User Story:** Como membro do core, quero uma lista centralizada de ferramentas úteis da comunidade WoW organizadas por categoria, para que eu possa acessá-las rapidamente a partir de um único local.

#### Critérios de Aceitação

1. THE Portal SHALL exibir as ferramentas lidas do `tools.json` do JSON_Store, organizadas nas categorias: Mythic_Plus, Simulações, Builds, Raid, Economia e Utilitários.
2. THE Portal SHALL exibir para cada ferramenta: nome, descrição breve e link externo abrindo em nova aba.
3. IF uma categoria não possui ferramentas cadastradas no JSON_Store, THEN THE Portal SHALL ocultar a categoria inteira sem exibir cabeçalho vazio.

---

### Requisito 10 — Seção Regras

**User Story:** Como membro ou recruta do core, quero ler as regras do grupo organizadas por categoria, para que eu possa entender as expectativas e responsabilidades.

#### Critérios de Aceitação

1. THE Portal SHALL exibir as regras lidas do `rules.json` do JSON_Store, organizadas nas categorias: Comportamento, Raid, Presença, Loot e Recrutamento.
2. THE Portal SHALL exibir cada regra como item de lista dentro de sua categoria.
3. IF uma categoria de regras não possui itens no JSON_Store, THEN THE Portal SHALL ocultar a categoria inteira sem exibir cabeçalho vazio.

---

### Requisito 11 — Navegação e Layout Global

**User Story:** Como usuário do portal, quero uma navegação clara e responsiva entre todas as seções, para que eu possa acessar qualquer informação a partir de qualquer dispositivo.

#### Critérios de Aceitação

1. THE Portal SHALL exibir um menu de navegação fixo (sticky) no topo com links para todas as seções: Home, Progressão, Roster, Mythic+, Logs, Loots, Planejamento, Ferramentas e Regras.
2. THE Portal SHALL exibir um rodapé com o nome do projeto, data da última atualização e link para o repositório GitHub.
3. THE Portal SHALL adaptar o layout para desktop (≥ 1280px), tablet (768px–1279px) e mobile (< 768px).
4. WHEN o Portal é acessado em viewport menor que 768px, THE Portal SHALL colapsar o menu de navegação em um botão hambúrguer funcional.
5. THE Portal SHALL suportar navegação por teclado em todos os elementos interativos: links, botões, acordeões e filtros.
6. THE Portal SHALL garantir contraste de cores mínimo de 4,5:1 entre texto e fundo em todos os textos do Portal, conforme WCAG 2.1 AA.
7. THE Portal SHALL incluir atributos `aria-label` e `role` apropriados em todos os elementos interativos e regiões de conteúdo.

---

### Requisito 12 — Performance e Qualidade

**User Story:** Como usuário do portal, quero que o site carregue rapidamente e com alta qualidade técnica, para que a experiência de uso seja fluida independentemente do dispositivo.

#### Critérios de Aceitação

1. THE Portal SHALL atingir pontuação Lighthouse ≥ 90 nas categorias Performance, Acessibilidade, Best Practices e SEO em desktop.
2. THE Portal SHALL carregar o conteúdo visível inicial (LCP) em menos de 2 segundos em conexão de banda larga simulada (4 Mbps).
3. THE Portal SHALL utilizar atributos `width` e `height` explícitos em todas as tags `<img>` para evitar mudança de layout (CLS igual a 0).
4. THE Portal SHALL aplicar `loading="lazy"` em todas as imagens posicionadas fora da viewport inicial.

---

### Requisito 13 — Tema Visual

**User Story:** Como membro do core, quero que o portal tenha tema visual escuro inspirado em Warcraft Logs e Raider.IO, para que a experiência seja familiar ao ecossistema de ferramentas que já utilizamos.

#### Critérios de Aceitação

1. THE Portal SHALL utilizar tema escuro como padrão com fundo nas tonalidades de `#0d1117` a `#1a2030`.
2. THE Portal SHALL utilizar cor dourada (`#f0a500` ou equivalente) para destaques, títulos principais e elementos de ênfase.
3. THE Portal SHALL utilizar cor verde (`#00c48c` ou equivalente) para indicar bosses mortos e status positivos.
4. THE Portal SHALL utilizar cor vermelha (`#e84040` ou equivalente) para indicar bosses em progressão e alertas.
5. THE Portal SHALL aplicar as cores de classe do World of Warcraft nos nomes de personagens (ex: Paladin = `#f58cba`, Mage = `#69ccf0`).
