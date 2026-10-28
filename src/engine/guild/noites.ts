/**
 * As noites de um core, a partir das runs das semanas.
 *
 * Uma noite NÃO é um relatório: o WoW parte o log em dois arquivos quando
 * alguém desloga no meio da sessão, e foi exatamente o que aconteceu no
 * guild run de 23/10 — dois códigos, mesmo `startTime`, mesma noite. Tratar
 * cada arquivo como uma noite dobra o denominador da presença e corta ao
 * meio o número de todo mundo que jogou as duas metades.
 *
 * Então a noite é a DATA, e os relatórios dela são uma lista.
 */

/**
 * O mínimo que esta agregação lê de um jogador.
 *
 * Sem assinatura de índice de propósito: ela não bate com `PlayerPerformance`,
 * que é o que de fato chega aqui, e exigir uma empurraria um cast pra cada
 * chamador. Os campos que a junção mexe estão em `SOMAM` e `MAIOR`, lidos
 * por caminho — o cast fica em `ler` e `escrever`, numa linha cada.
 */
export interface JogadorDaRun {
  playerId: string;
}

export interface RunDaNoite {
  date: string;
  reportCode?: string;
  core?: string;
  players?: JogadorDaRun[];
}

export interface Noite<T> {
  date: string;
  /** Um por arquivo de log. Mais de um quer dizer que a noite foi partida. */
  reportCodes: string[];
  jogadores: T[];
}

/**
 * Campos que SOMAM quando a mesma pessoa aparece nas duas metades.
 *
 * São contadores: morrer duas vezes antes do logout e três depois é morrer
 * cinco vezes na noite.
 */
const SOMAM = [
  "deaths",
  "utility.interrupts",
  "utility.dispels",
  "utility.purges",
  "utility.battleRez",
  "utility.battleRezRecebidos",
  "deathCost.seconds",
  "deathSignature.primeiroACair",
  "deathSignature.efeitoDomino",
] as const;

/**
 * Campos que ficam com o MAIOR dos dois.
 *
 * São taxas e percentis, não contadores: somar dps de duas metades daria um
 * número que ninguém fez. Juntar direito exigiria o tempo de luta de cada
 * metade, que a tabela agregada da WCL não devolve por relatório — e o
 * maior é um número real, que a pessoa de fato pôs no placar naquela noite.
 */
const MAIOR = ["dps", "hps", "parse", "itemLevel", "trashShare"] as const;

function ler(objeto: JogadorDaRun, caminho: string): number | undefined {
  const valor = caminho
    .split(".")
    .reduce<unknown>((atual, parte) => (atual as Record<string, unknown>)?.[parte], objeto as unknown);
  return typeof valor === "number" ? valor : undefined;
}

function escrever(objeto: Record<string, unknown>, caminho: string, valor: number): void {
  const partes = caminho.split(".");
  const ultima = partes.pop() as string;
  let atual = objeto;
  for (const parte of partes) {
    const proximo = atual[parte];
    atual[parte] = typeof proximo === "object" && proximo !== null ? { ...proximo } : {};
    atual = atual[parte] as Record<string, unknown>;
  }
  atual[ultima] = valor;
}

/** Junta as duas aparições da mesma pessoa numa noite partida. */
function juntar(a: JogadorDaRun, b: JogadorDaRun): JogadorDaRun {
  const junto: Record<string, unknown> = { ...a, ...b };

  for (const caminho of SOMAM) {
    const x = ler(a, caminho);
    const y = ler(b, caminho);
    if (x === undefined && y === undefined) continue;
    escrever(junto, caminho, (x ?? 0) + (y ?? 0));
  }

  for (const caminho of MAIOR) {
    const x = ler(a, caminho);
    const y = ler(b, caminho);
    if (x === undefined && y === undefined) continue;
    escrever(junto, caminho, Math.max(x ?? -Infinity, y ?? -Infinity));
  }

  return junto as unknown as JogadorDaRun;
}

/**
 * As noites de um core, da mais recente pra mais antiga.
 *
 * Semanas entram já recortadas por core (ver `semanasDoCore`); aqui só
 * agrupa por data e junta quem aparece duas vezes.
 */
export function noitesDoCore<T extends { runs?: RunDaNoite[] }>(semanas: T[]): Array<Noite<JogadorDaRun>> {
  const porData = new Map<string, Noite<JogadorDaRun>>();

  for (const semana of semanas) {
    for (const run of semana.runs ?? []) {
      const noite = porData.get(run.date) ?? { date: run.date, reportCodes: [], jogadores: [] };

      if (run.reportCode && !noite.reportCodes.includes(run.reportCode)) {
        noite.reportCodes.push(run.reportCode);
      }

      for (const jogador of run.players ?? []) {
        const indice = noite.jogadores.findIndex((outro) => outro.playerId === jogador.playerId);
        if (indice === -1) noite.jogadores.push(jogador);
        else noite.jogadores[indice] = juntar(noite.jogadores[indice], jogador);
      }

      porData.set(run.date, noite);
    }
  }

  return [...porData.values()].sort((a, b) => b.date.localeCompare(a.date));
}
