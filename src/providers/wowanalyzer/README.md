# WoW Analyzer Provider — bloqueado em produção (Cloudflare)

**Status: código escrito e testado, mas não roda de verdade.** `wowanalyzer.com`
tem proteção anti-bot ativa da Cloudflare — testado com Playwright real (headless
e headed, sem a extensão do Chrome): a página sempre devolve o desafio "Um
momento... Executando verificação de segurança" em vez do conteúdo. Não vamos
tentar contornar isso (trocar fingerprint, stealth plugins, etc.) — está fora do
que fazemos independente do contexto.

Investigado também se existe uma API separada (como achamos no Wipefest,
`api.wipefest.gg`): **não existe**. As únicas requisições de rede da página são
analytics/anúncios — a análise inteira roda no navegador, direto contra a API
pública da WCL (mesma que já usamos), com a lógica de cada spec sendo código
JS aberto no GitHub deles. Não tem atalho de API; a única forma de reproduzir
o número seria reimplementar a lógica de análise por spec, o que não fazemos
(mesmo princípio já aplicado ao Wipefest, só que aqui seria bem mais esforço:
cada spec tem um analisador escrito por um voluntário diferente da comunidade).

## O que ficou pronto mesmo assim

- URL confirmada: `wowanalyzer.com/report/<reportCode>/<fightId>-<slug-qualquer>/<Nome>/standard`
  — reaproveita reportCode/fightId da WCL igual o Wipefest, e resolve o jogador
  só pelo nome (sem precisar do `actorId`).
- **Não existe um score único 0-100** como o Wipefest — cada spec tem checklist
  e métricas próprias. A única coisa universal o suficiente pro modelo unificado
  é o percentual da seção "Always Be Casting" (sempre a primeira da aba padrão),
  que vira `PlayerPerformance.uptime`. Ver memory `wowanalyzer-findings` pra
  detalhes completos e exemplos reais (DPS vs healer).
- `WoWAnalyzerProvider.ts` + `normalize.ts` (`averageUptime`) implementam essa
  extração e passam nos testes unitários — a lógica está correta, só não
  consegue rodar contra o site real hoje.

## Retomar no futuro

Se a regra da Cloudflare mudar, ou surgir alguma forma legítima de acesso
(ex: parceria, chave de API oficial), o código já está pronto pra ligar —
`scripts/wowanalyzer/fetch-scores.ts` segue o mesmo padrão do
`wipefest/fetch-scores.ts`. Reler `wowanalyzer-findings` antes de retomar.
