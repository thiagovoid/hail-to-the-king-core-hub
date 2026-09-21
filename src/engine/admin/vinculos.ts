/**
 * Quem é alt de quem: propor, conferir e aplicar.
 *
 * O vínculo é o único dado do roster que nenhuma coleta sabe descobrir — WCL
 * vê dois personagens, não vê que atrás dos dois tem a mesma pessoa. Alguém
 * precisa dizer, e até hoje isso era abrir o JSON e editar na unha.
 *
 * Esta é a parte pura: recebe o roster e uma proposta, devolve o que está
 * errado e o que mudaria. A tela do /admin e o script que grava o arquivo
 * chamam as MESMAS funções de propósito — se a tela aprovasse algo que o
 * script recusa, o trabalho de quem coordena iria pro lixo no último passo.
 */
import { mapearPessoas, type PersonagemDoRoster } from "../guild/pessoas";

export interface PersonagemParaVincular extends PersonagemDoRoster {
  name: string;
}

/**
 * A proposta: personagem -> `id` do main, ou `null` pra "este é main".
 *
 * Só entra no mapa quem muda. Um objeto vazio é uma proposta válida: quer
 * dizer "não mexe em nada".
 */
export type Vinculos = Record<string, string | null>;

export interface Problema {
  id: string;
  motivo: string;
}

export interface Mudanca {
  id: string;
  name: string;
  /** O nome do main de antes, ou `null` se era main. */
  de: string | null;
  /** O nome do main de depois, ou `null` se vira main. */
  para: string | null;
}

const nomeDe = (roster: PersonagemParaVincular[], id: string | null | undefined) =>
  id ? (roster.find((p) => p.id === id)?.name ?? id) : null;

/**
 * Aplica a proposta preservando TODO o resto do personagem.
 *
 * Só `type` e `pertenceA` se mexem. O roster carrega parse, io, presença e
 * metas do Raidbots que vêm das coletas — reescrever um personagem inteiro
 * a partir da tela apagaria dado fresco com dado da hora do build.
 *
 * `type` é o PAPEL no core e `pertenceA` é o VÍNCULO: são coisas
 * diferentes, e por isso `replace` sobrevive aos dois sentidos. Quem está no
 * banco e vira alt de alguém continua sendo o do banco; deixando de ser alt,
 * volta pro banco em vez de ser promovido a main.
 */
export function aplicarVinculos<T extends PersonagemDoRoster>(
  roster: T[],
  vinculos: Vinculos
): T[] {
  return roster.map((personagem) => {
    if (!(personagem.id in vinculos)) return personagem;

    const main = vinculos[personagem.id];

    if (main === null) {
      return {
        ...personagem,
        type: personagem.type === "replace" ? "replace" : "main",
        pertenceA: null,
      };
    }

    return {
      ...personagem,
      type: personagem.type === "replace" ? ("replace" as const) : ("alt" as const),
      pertenceA: main,
    };
  });
}

/**
 * O que a proposta tem de errado, em linguagem de quem vai ler.
 *
 * Lista vazia quer dizer que pode gravar.
 */
export function validarVinculos(
  roster: PersonagemParaVincular[],
  vinculos: Vinculos
): Problema[] {
  const problemas: Problema[] = [];
  const porId = new Map(roster.map((p) => [p.id, p]));

  for (const [id, main] of Object.entries(vinculos)) {
    if (!porId.has(id)) {
      problemas.push({ id, motivo: `"${id}" não está no roster.` });
      continue;
    }
    if (main === null) continue;

    if (!porId.has(main)) {
      problemas.push({ id, motivo: `${porId.get(id)!.name} aponta pra "${main}", que não está no roster.` });
      continue;
    }
    if (main === id) {
      problemas.push({ id, motivo: `${porId.get(id)!.name} não pode ser alt de si mesmo.` });
    }
  }

  // Quem já foi reprovado acima não é reprovado de novo lá embaixo: apontar
  // pra si mesmo também acusaria "aponta pra um alt", e duas queixas da
  // mesma causa fazem quem lê procurar dois defeitos.
  const jaReclamados = new Set(problemas.map((p) => p.id));

  // Corrente de alt: A é alt de B, que é alt de C. `mapearPessoas` até
  // resolve subindo até o topo, mas aqui a gente recusa — quem escolheu B
  // na tela espera que a medalha vá pro B, e ela iria pro C calada.
  const depois = aplicarVinculos(roster, vinculos);
  const porIdDepois = new Map(depois.map((p) => [p.id, p]));

  for (const [id, main] of Object.entries(vinculos)) {
    if (main === null || jaReclamados.has(id)) continue;
    if (!porIdDepois.has(id) || !porIdDepois.has(main)) continue;

    const alvo = porIdDepois.get(main)!;
    if (alvo.pertenceA) {
      problemas.push({
        id,
        motivo: `${porId.get(id)!.name} aponta pra ${alvo.name}, que também é alt. O main de um alt precisa ser um main.`,
      });
    }
  }

  return problemas;
}

/** O que muda de fato — pra tela mostrar antes de gravar. */
export function mudancasDe(
  roster: PersonagemParaVincular[],
  vinculos: Vinculos
): Mudanca[] {
  const antes = mapearPessoas(roster);
  const depois = mapearPessoas(aplicarVinculos(roster, vinculos));

  return roster
    .filter((p) => antes.get(p.id) !== depois.get(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      de: antes.get(p.id) === p.id ? null : nomeDe(roster, antes.get(p.id)),
      para: depois.get(p.id) === p.id ? null : nomeDe(roster, depois.get(p.id)),
    }));
}
