# Wipefest Provider

O Wipefest não gera log próprio — ele reaproveita o mesmo `reportCode` e a
mesma numeração de `fightId` da WCL (`wipefest.gg/report/<code>/fight/<id>`).
Confirmado inspecionando um report real usado pela guilda: a página lê o
report da WCL ao vivo, sem precisar de login pro score principal.

A página é uma SPA que calcula o score no cliente, e existe uma API
(`api.wipefest.gg/report/<code>/fight/<id>`) por trás — mas o campo de score
que ela devolve não bate com o número renderizado na tela (testado: chegou a
divergir 2 pontos). Por isso `WipefestProvider` automatiza o navegador
(Playwright) e lê o valor já calculado no DOM (`.player-card`), mesmo padrão
do Raidbots, em vez de recalcular a partir da API bruta.

O Wipefest só dá um score por fight individual (por pull de um boss), não por
run — `src/providers/wipefest/normalize.ts` faz a média simples entre os
fights que compõem a run, mesma granularidade de agregação que dps/parse da
WCL já usam.

Consumido por `scripts/wipefest/fetch-scores.ts`, que roda separado do
`fetch-performance.ts` (mesmo padrão de independência do Raidbots) e grava
`wipefestScore` nos jogadores de `data/weekly/performance/week-NN.json` já gerado.
Esse pipeline já é por semana/run desde o início (um arquivo por semana,
nunca sobrescrito) e já faz a média de todos os fights da run — nenhum ajuste
necessário aqui.

## Boss Insights (placar por boss)

Existe um segundo consumidor, `scripts/wipefest/fetch-boss-insights.ts`, que
alimenta `data/seasons/<season>/boss-insights.json` — o placar de mecânicas exibido
no card de cada boss na página de progressão. Esse artefato é
propositalmente separado do Unified Model (ver `src/types/bossInsights.ts`):
não é uma métrica agregada pro Score/Team Engine, é o placar daquela kill
específica.

Duas coisas a saber sobre esse pipeline:

- **Só lê o fight referenciado em `boss.links.warcraftLogs`** (a kill), não
  os pulls de progressão anteriores. Se no futuro decidirmos que o placar
  deveria refletir uma média entre tentativas em vez de só a kill, isso exige
  também estender `Boss` pra guardar mais de um fight por boss — hoje o
  schema da season só suporta um link. Decisão adiada de propósito (não
  impacta a estrutura atual).
- **O que já foi corrigido**: o script costumava reconstruir
  `data/seasons/<season>/boss-insights.json` do zero a cada execução — um erro
  transitório de rede num único boss apagava o placar dele (e o de qualquer
  boss que falhasse) mesmo que já tivesse sido capturado com sucesso antes.
  Agora ele carrega o arquivo existente e faz merge: um boss (ou o breakdown
  de mecânica de um jogador específico) só é sobrescrito quando a nova
  coleta tem sucesso; se falhar, o valor salvo anteriormente é preservado.
