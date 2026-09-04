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
`wipefestScore` nos jogadores de `data/performance/week-NN.json` já gerado.
