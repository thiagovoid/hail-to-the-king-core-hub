import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A rede de proteção do erro mais caro do projeto.
 *
 * `wcl:fetch-performance` reescreve o arquivo da semana INTEIRO e só conhece
 * os campos da WCL. Tudo que o Wipefest escreveu ali — `mechanics`, que pesa
 * 25 a 30 no Score — some em silêncio se `wipefest:build` não rodar depois.
 * Sem erro, sem aviso, sem teste vermelho: o site sobe bonito e com todas as
 * notas da semana erradas.
 *
 * Aconteceu três vezes, e as três foram descobertas depois de publicar. Um
 * lembrete em documentação depende de alguém lembrar de ler, e já falhou as
 * três vezes. Este teste não depende.
 *
 * A regra é factual, não heurística: se o bruto do Wipefest daquele relatório
 * está arquivado, então o Wipefest tinha o que dizer sobre aquela noite, e
 * `mechanics` TEM que estar no arquivo da semana. Noite que o Wipefest não
 * cobre não é cobrada aqui.
 */
const RAIZ = path.resolve(__dirname, '../..');
const SEMANAS = path.join(RAIZ, 'data/weekly/performance');
const BRUTO_WIPEFEST = path.join(RAIZ, 'data/raw/wipefest-api');

interface Noite {
  date: string;
  reportCode?: string;
  players: Array<{ playerId: string; mechanics?: unknown }>;
}

const semanas = existsSync(SEMANAS)
  ? readdirSync(SEMANAS)
      .filter((arquivo) => arquivo.endsWith('.json'))
      .map((arquivo) => ({
        arquivo,
        runs: (JSON.parse(readFileSync(path.join(SEMANAS, arquivo), 'utf-8')).runs ?? []) as Noite[],
      }))
  : [];

describe('mechanics não se perde no arquivo da semana', () => {
  it('existe pelo menos uma semana pra conferir', () => {
    // Sem isto o teste passaria vazio justamente quando os dados sumissem.
    expect(semanas.length).toBeGreaterThan(0);
  });

  for (const semana of semanas) {
    for (const noite of semana.runs) {
      const temBrutoDoWipefest =
        noite.reportCode !== undefined &&
        existsSync(path.join(BRUTO_WIPEFEST, noite.reportCode));

      if (!temBrutoDoWipefest) continue;

      it(`${semana.arquivo} · ${noite.date}: todo jogador tem mechanics`, () => {
        const sem = noite.players.filter((jogador) => jogador.mechanics === undefined);

        expect(
          sem.map((jogador) => jogador.playerId),
          `O bruto do Wipefest de ${noite.reportCode} está arquivado, então esta noite ` +
            `tinha mechanics e perdeu. Rode "npm run wipefest:build" — ele reconstrói do ` +
            `arquivo, sem ir à rede. Ver COLETA.md.`
        ).toEqual([]);
      });
    }
  }
});
