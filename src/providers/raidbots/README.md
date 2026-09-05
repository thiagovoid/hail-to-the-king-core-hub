# Raidbots Provider

O Raidbots não tem API pra rodar simulação sob demanda, então `RaidbotsProvider`
automatiza o próprio Quick Sim do site (`raidbots.com/simbot/quick`) via Playwright:
abre a página real, espera renderizar, roda a simulação e lê o `data.json` do
report gerado — sem reimplementar nenhuma lógica de simulação.

Consumido por `scripts/raidbots/update-performance-goals.ts`, que grava
`performanceGoals.dps` em `data/guild/roster.json`, um personagem de cada vez (é um
serviço gratuito mantido por terceiros — evitar qualquer coisa parecida com abuso).

Specs de healer não são suportadas pelo Quick Sim; isso vem como raw
`{ status: "unsupported-spec" }`, não como erro, porque é a resposta real da
ferramenta.

Mesmo padrão de automação de navegador que Wipefest e WoW Analyzer vão usar
(ambos SPAs client-side, sem API viável).
