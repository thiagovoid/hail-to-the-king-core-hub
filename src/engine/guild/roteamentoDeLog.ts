/**
 * A que core pertence um log.
 *
 * Enquanto só o Thiago subia log, a pergunta não existia: tudo que ele
 * subia era do core. Com um segundo core, de raid líder próprio, o upload
 * sai do controle dele — e entra o risco de pug e raide de outra guilda
 * virarem número do core.
 *
 * Nenhum sinal sozinho é seguro. São três, em camadas:
 *
 * 1. **Declaração** (`log-cores.json`) vence tudo. É a saída pros casos
 *    que a heurística não cobre.
 * 2. **Sobreposição com o roster do core** é o teste de verdade. Medida
 *    ANTES de rascunhar ninguém — senão é circular, porque personagem
 *    desconhecido vira roster e a sobreposição vira 100% sozinha.
 * 3. **Nada bateu** não é "pertence a ninguém em silêncio": é motivo pra
 *    relatar, porque log descartado sem aviso foi como a primeira noite de
 *    um tier novo se perdeu.
 *
 * O corte de 50% tem folga dos dois lados, medido nas 18 noites da
 * temporada: a pior noite legítima teve 77% de conhecidos (era a noite com
 * três novatos), e o guild run teve 0% — dezoito personagens, nenhum do
 * core. Um pug com dois ou três do core entre vinte dá 10-15%.
 */

export interface CoreParaRotear {
  slug: string;
  /** Evento não tem roster: só entra por declaração. */
  formato: "core" | "evento";
  /** Nomes de personagem do roster daquele core, em minúsculas. */
  roster: Set<string>;
}

export type DecisaoDeRota =
  | { tipo: "declarado"; core: string | null; motivo: string }
  | { tipo: "sobreposicao"; core: string; fracao: number }
  | { tipo: "sem-core"; melhor: { core: string; fracao: number } | null };

/** Quanto do log é gente conhecida daquele core. */
export function sobreposicao(personagens: Set<string>, roster: Set<string>): number {
  if (personagens.size === 0) return 0;

  let conhecidos = 0;
  for (const nome of personagens) {
    if (roster.has(nome)) conhecidos += 1;
  }

  return conhecidos / personagens.size;
}

export function decidirCore(
  code: string,
  personagens: Set<string>,
  cores: CoreParaRotear[],
  declaracoes: Map<string, { core: string | null; motivo: string }>,
  corte: number
): DecisaoDeRota {
  const declarado = declaracoes.get(code);
  if (declarado) {
    return { tipo: "declarado", core: declarado.core, motivo: declarado.motivo };
  }

  // Evento fica fora da disputa: sem roster, a sobreposição dele é sempre
  // zero, e deixá-lo concorrer só geraria ruído no relatório.
  const candidatos = cores
    .filter((core) => core.formato === "core")
    .map((core) => ({ core: core.slug, fracao: sobreposicao(personagens, core.roster) }))
    .sort((a, b) => b.fracao - a.fracao);

  const melhor = candidatos[0] ?? null;

  if (melhor && melhor.fracao >= corte) {
    return { tipo: "sobreposicao", core: melhor.core, fracao: melhor.fracao };
  }

  return { tipo: "sem-core", melhor: melhor && melhor.fracao > 0 ? melhor : null };
}

/** A frase do relatório, pra quem for ler a saída da coleta. */
export function explicarDecisao(code: string, decisao: DecisaoDeRota): string {
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  switch (decisao.tipo) {
    case "declarado":
      return decisao.core === null
        ? `Log ${code} fora de todos os cores, por declaração: ${decisao.motivo}`
        : `Log ${code} declarado como ${decisao.core}: ${decisao.motivo}`;

    case "sobreposicao":
      return `Log ${code} -> ${decisao.core} (${pct(decisao.fracao)} do log é do roster dele).`;

    case "sem-core":
      return decisao.melhor
        ? `Log ${code} NÃO entrou: a melhor sobreposição foi ${pct(decisao.melhor.fracao)} com ${decisao.melhor.core}, abaixo do corte. Declare em log-cores.json se for dele.`
        : `Log ${code} NÃO entrou: nenhum personagem dele está em roster de core nenhum. Declare em log-cores.json se for de um core novo ou de evento.`;
  }
}
