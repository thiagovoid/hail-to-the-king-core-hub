/**
 * A COMP do core: o grupo tem gente e formação pra cada nível de conteúdo?
 *
 * Existe pra responder, com número, a pergunta que cobram da liderança —
 * "o core dá pra mítico?" — em vez de responder no sentimento.
 *
 * São DUAS perguntas diferentes, e misturá-las é o erro que este arquivo
 * evita:
 *
 * 1. **Tamanho e formação.** O mítico trava em 20 pessoas exatas, com tanks
 *    e healers na proporção. Nada disso depende de quão bem alguém joga: um
 *    raide de 17 não entra no mítico nem com 17 jogadores impecáveis.
 * 2. **Nível das pessoas.** Quantas fecham a régua daquele conteúdo na média
 *    da temporada (ver `prontidao.ts`).
 *
 * Uma pessoa entra com TODAS as cadeiras que ela já ocupou na temporada, não
 * com uma função fixa: "na ausência de alguém podemos trocar de cadeira pra
 * compor" é como o core joga de verdade, e um modelo de função única apagaria
 * justamente quem trocou pra ajudar.
 *
 * E uma ressalva que a tela precisa dizer: o core LIMPA o heroico hoje sem
 * ninguém individualmente pronto pro heroico. Grupo carrega — é o que grupo
 * faz. O que o mítico muda é que ali a conta não fecha no carrego.
 */

import { NIVEIS, type FuncaoDaProntidao, type NivelDeConteudo } from "../scores/prontidao";

export const FUNCOES: readonly FuncaoDaProntidao[] = ["tank", "healer", "dps"];

/** O que cada nível exige de FORMAÇÃO, antes de olhar o nível de ninguém. */
export interface ExigenciaDeComp {
  /** Quantas pessoas o conteúdo comporta no mínimo. */
  tamanho: number;
  /** O tamanho é exato? Só o mítico é — normal e heroico são flex. */
  tamanhoFixo: boolean;
  tanks: number;
  healers: number;
}

/**
 * Normal e heroico são flex: entram de 10 a 30, e o jogo ajusta o boss ao
 * número. O mítico é fixo em 20 — não tem 19, não tem 21.
 *
 * Os healers seguem a proporção que o próprio core roda: 3 em 15 nas noites
 * recentes, e 4 quando o raide passou de 16.
 */
export const COMP_DO_NIVEL: Record<NivelDeConteudo, ExigenciaDeComp> = {
  normal: { tamanho: 10, tamanhoFixo: false, tanks: 2, healers: 2 },
  heroico: { tamanho: 10, tamanhoFixo: false, tanks: 2, healers: 3 },
  mitico: { tamanho: 20, tamanhoFixo: true, tanks: 2, healers: 4 },
};

/** Uma cadeira que a pessoa sabe ocupar, e em que nível ela a ocupa. */
export interface PapelDaPessoa {
  funcao: FuncaoDaProntidao;
  /** O maior nível que ela fecha NESTE papel. Null = não fecha nem o normal. */
  nivel: NivelDeConteudo | null;
}

/** Uma pessoa do core, já reduzida ao que a COMP precisa saber. */
export interface PessoaNaComp {
  /** A PESSOA, não o personagem — alt não ocupa duas cadeiras. */
  id: string;
  /** Todas as cadeiras que ela ocupou na temporada. Nunca vazio. */
  papeis: PapelDaPessoa[];
}

export type CadeirasPorFuncao = Record<FuncaoDaProntidao, number>;

export interface CompDoNivel {
  nivel: NivelDeConteudo;
  exige: ExigenciaDeComp;
  /** Cadeiras que o conteúdo tem, por função. */
  cadeiras: CadeirasPorFuncao;
  /** Quem sabe ocupar cada cadeira, independente de nível. */
  disponivel: CadeirasPorFuncao;
  /** Quem ocupa cada cadeira JÁ na régua deste nível. */
  pronto: CadeirasPorFuncao;
  /** Total de pessoas no core (cada uma contada uma vez). */
  pessoas: number;
  /** Quantas delas fecham este nível em alguma das suas cadeiras. */
  pessoasProntas: number;
  /**
   * O que falta, em frases prontas pra tela. Vazio = a COMP fecha.
   *
   * Frases, e não códigos, porque cada falta tem uma resposta diferente:
   * faltar gente é recrutamento, faltar nível é treino. Um "false" não
   * diria qual dos dois.
   */
  falta: string[];
  /** Tamanho e formação fecham? (Sem olhar o nível de ninguém.) */
  formacaoFecha: boolean;
  /** Formação E nível fecham? */
  fecha: boolean;
}

const ROTULO: Record<FuncaoDaProntidao, [string, string]> = {
  tank: ["tank", "tanks"],
  healer: ["healer", "healers"],
  dps: ["dps", "dps"],
};

const NOME_DO_NIVEL: Record<NivelDeConteudo, string> = {
  normal: "normal",
  heroico: "heroico",
  mitico: "mítico",
};

function plural(quantidade: number, [um, varios]: [string, string]): string {
  return `${quantidade} ${quantidade === 1 ? um : varios}`;
}

function cadeirasDe(exige: ExigenciaDeComp): CadeirasPorFuncao {
  return {
    tank: exige.tanks,
    healer: exige.healers,
    dps: Math.max(0, exige.tamanho - exige.tanks - exige.healers),
  };
}

function fechaNivel(nivel: NivelDeConteudo | null, alvo: NivelDeConteudo): boolean {
  return nivel !== null && NIVEIS.indexOf(nivel) >= NIVEIS.indexOf(alvo);
}

/** A pessoa sabe ocupar esta cadeira? (Opcionalmente: já na régua do nível.) */
function ocupa(
  pessoa: PessoaNaComp,
  funcao: FuncaoDaProntidao,
  alvo: NivelDeConteudo | null
): boolean {
  return pessoa.papeis.some(
    (papel) => papel.funcao === funcao && (alvo === null || fechaNivel(papel.nivel, alvo))
  );
}

function contar(
  pessoas: PessoaNaComp[],
  alvo: NivelDeConteudo | null
): CadeirasPorFuncao {
  return {
    tank: pessoas.filter((p) => ocupa(p, "tank", alvo)).length,
    healer: pessoas.filter((p) => ocupa(p, "healer", alvo)).length,
    dps: pessoas.filter((p) => ocupa(p, "dps", alvo)).length,
  };
}

/** Todos os 7 conjuntos não vazios das três funções. */
const CONJUNTOS: FuncaoDaProntidao[][] = [
  ["tank"],
  ["healer"],
  ["dps"],
  ["tank", "healer"],
  ["tank", "dps"],
  ["healer", "dps"],
  ["tank", "healer", "dps"],
];

/**
 * Quantas pessoas faltam pra preencher as cadeiras, por função.
 *
 * Não basta contar função por função: quem sabe tankar E curar seria contada
 * como dois, e o raide apareceria completo com uma pessoa a menos sentada.
 * Daí olhar todos os conjuntos de funções — a condição de Hall — e pegar o
 * pior deles. Com três funções são sete contas, e sai exato.
 */
function faltando(
  pessoas: PessoaNaComp[],
  cadeiras: CadeirasPorFuncao,
  alvo: NivelDeConteudo | null
): { porFuncao: CadeirasPorFuncao; combinada: number } {
  const porFuncao = { tank: 0, healer: 0, dps: 0 } as CadeirasPorFuncao;
  let combinada = 0;

  for (const conjunto of CONJUNTOS) {
    const assentos = conjunto.reduce((soma, funcao) => soma + cadeiras[funcao], 0);
    const aptas = pessoas.filter((p) => conjunto.some((f) => ocupa(p, f, alvo))).length;
    const deficit = Math.max(0, assentos - aptas);

    if (conjunto.length === 1) {
      porFuncao[conjunto[0]] = deficit;
    }

    combinada = Math.max(combinada, deficit);
  }

  return { porFuncao, combinada };
}

function frasesDe(
  falta: { porFuncao: CadeirasPorFuncao; combinada: number },
  sufixo: string
): string[] {
  const frases = FUNCOES.filter((funcao) => falta.porFuncao[funcao] > 0).map((funcao) =>
    `${plural(falta.porFuncao[funcao], ROTULO[funcao])}${sufixo}`
  );

  // Quando o buraco combinado é maior que a soma dos buracos por função, o
  // gargalo é gente flexível sendo contada duas vezes — e aí o número que
  // importa é o total, não a lista.
  const somaPorFuncao = FUNCOES.reduce((soma, funcao) => soma + falta.porFuncao[funcao], 0);
  if (falta.combinada > somaPorFuncao) {
    frases.push(`${plural(falta.combinada - somaPorFuncao, ["pessoa", "pessoas"])}${sufixo}`);
  }

  return frases;
}

export function avaliarComp(pessoas: PessoaNaComp[], nivel: NivelDeConteudo): CompDoNivel {
  const exige = COMP_DO_NIVEL[nivel];
  const cadeiras = cadeirasDe(exige);
  const falta: string[] = [];

  // --- 1. Tamanho: não depende de quão bem ninguém joga ---
  if (pessoas.length < exige.tamanho) {
    const quantas = exige.tamanho - pessoas.length;
    falta.push(
      exige.tamanhoFixo
        ? `${plural(quantas, ["pessoa", "pessoas"])} pro raide fechar em ${exige.tamanho} — o mítico não flexiona`
        : `${plural(quantas, ["pessoa", "pessoas"])} pro mínimo de ${exige.tamanho}`
    );
  }

  // --- 2. Formação: tem quem ocupe cada cadeira? ---
  falta.push(...frasesDe(faltando(pessoas, cadeiras, null), " no core"));
  const formacaoFecha = falta.length === 0;

  // --- 3. Nível: quem ocupa a cadeira está na régua? ---
  falta.push(...frasesDe(faltando(pessoas, cadeiras, nivel), ` na régua do ${NOME_DO_NIVEL[nivel]}`));

  return {
    nivel,
    exige,
    cadeiras,
    disponivel: contar(pessoas, null),
    pronto: contar(pessoas, nivel),
    pessoas: pessoas.length,
    pessoasProntas: pessoas.filter((p) => FUNCOES.some((f) => ocupa(p, f, nivel))).length,
    falta,
    formacaoFecha,
    fecha: falta.length === 0,
  };
}

/** Os três níveis de uma vez, que é como a tela mostra. */
export function avaliarComps(pessoas: PessoaNaComp[]): CompDoNivel[] {
  return NIVEIS.map((nivel) => avaliarComp(pessoas, nivel));
}
