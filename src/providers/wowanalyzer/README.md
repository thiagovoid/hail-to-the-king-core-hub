# WoW Analyzer Provider — pendente (Fase 3 do plano)

Sem API pública. `wowanalyzer.com` devolveu 403 (proteção anti-bot) num fetch
simples — é uma SPA que roda a análise inteira no navegador. Estratégia: automação
de navegador (Playwright), mesmo padrão do Raidbots/Wipefest — abrir a página do
report/fight/player, esperar a análise renderizar, ler o resultado do DOM. Não
reimplementamos a lógica de rotação/cooldown/uptime deles.

Precisa detectar specs sem módulo de análise e pular, igual o script do Raidbots já
faz com healers.
