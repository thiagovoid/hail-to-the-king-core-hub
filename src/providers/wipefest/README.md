# Wipefest Provider — pendente (Fase 2 do plano)

Sem API pública. `wipefest.gg` é uma SPA que calcula tudo no navegador do usuário
(confirmado: um fetch simples devolve um HTML quase vazio) — a estratégia é
automação de navegador (Playwright), mesmo padrão do Raidbots, não parsing de
HTML estático.

Precisa, antes de implementar: um reportCode real pra inspecionar a estrutura da
página e confirmar se reports unlisted aparecem lá (mesma limitação que já existe
com `parse` na WCL).
