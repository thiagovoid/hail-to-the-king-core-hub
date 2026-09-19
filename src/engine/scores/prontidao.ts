/**
 * Prontidão: pra qual conteúdo o jogador está pronto.
 *
 * Existe pra responder, com número, a pergunta que cobram da liderança —
 * "o core dá pra mítico?" — sem queimar ninguém empurrando conteúdo que
 * ainda não faz sentido pra ele.
 *
 * **Raider.IO não é a régua.** Ele mede Mythic+: gear, tempo investido e
 * execução em chave. Correlaciona com raide, mas não é a mesma coisa — e o
 * dado do core mostra onde erra: a Ligiaf tem IO 1939 e parse 47; o Dagom
 * tem IO 2446 e parse 15. Com um corte só de IO, o Dagom entraria e a
 * Ligiaf ficaria de fora. Ele entra como contexto, ao lado, nunca como
 * porteiro (ver `perfilDeChave`).
 *
 * O que decide é o que o site já mede da raide — parse, mecânicas, tempo
 * morto em luta e preparação — mais o número do ofício de cada função.
 */

/** Os três degraus. A ordem importa: o índice é o nível. */
export const NIVEIS = ["normal", "heroico", "mitico"] as const;
export type NivelDeConteudo = (typeof NIVEIS)[number];

export const ROTULO_DO_NIVEL: Record<NivelDeConteudo, string> = {
  normal: "Normal",
  heroico: "Heroico",
  mitico: "Mítico",
};

/** As exigências de raide de cada nível, iguais pra todas as funções. */
export interface ExigenciaDoNivel {
  /** Percentil mínimo no parse. */
  parse: number;
  /** Máximo de mecânicas distintas erradas por try. */
  mechanics: number;
  /** Máximo do tempo de luta passado morto com o raide vivo, em %. */
  deathShare: number;
  /** Mínimo de preparação (encantos, gemas, consumíveis). */
  preparation: number;
}

/**
 * Calibrado sobre as 113 noites-jogador da temporada.
 *
 * Normal fica perto da mediana do core de hoje (parse ~40, 11% morto), que
 * é onde o grupo está. Heroico exige o que os melhores já fazem. Mítico
 * exige o que ninguém faz ainda — e é isso que o torna objetivo.
 */
export const EXIGENCIA: Record<NivelDeConteudo, ExigenciaDoNivel> = {
  normal: { parse: 35, mechanics: 2.5, deathShare: 18, preparation: 50 },
  heroico: { parse: 55, mechanics: 1.8, deathShare: 10, preparation: 70 },
  mitico: { parse: 75, mechanics: 1.2, deathShare: 5, preparation: 85 },
};

/**
 * O perfil de Mythic+ da pessoa, pelo Raider.IO.
 *
 * Fica SEPARADO da prontidão de raide de propósito. IO mede chave: gear,
 * tempo investido e execução em M+. Correlaciona com raide, mas não é a
 * mesma coisa — e o dado do core mostra onde erra. Com um corte de IO em
 * 2500, a Ligiaf (IO 1939, parse 47) ficaria travada e o Dagom (IO 2446,
 * parse 15) passaria.
 *
 * Serve como contexto ao lado da prontidão, nunca como porteiro dela.
 */
export const IO_DO_NIVEL: Record<NivelDeConteudo, number> = {
  normal: 3000,
  heroico: 3300,
  mitico: 3500,
};

export function perfilDeChave(io: number | null): NivelDeConteudo | null {
  if (io === null) return null;

  let perfil: NivelDeConteudo | null = null;
  for (const nivel of NIVEIS) {
    if (io >= IO_DO_NIVEL[nivel]) perfil = nivel;
  }
  return perfil;
}

/**
 * O critério do OFÍCIO, um por função.
 *
 * O percentual do sim não serve pras três. Medido com os sims frescos: os
 * tanks travam em 69% (blackwatch), 68% (voidwar) e 63% (apocalipse),
 * porque um Paladino de Proteção nunca atinge o sim de boneco parado — ele
 * está tankando. Uma barra de 75% excluiria os três PARA SEMPRE, o que
 * mediria a função e não a pessoa.
 *
 * Então cada um é medido pelo que faz: dps pelo quanto entrega do próprio
 * potencial, tank pelos defensivos, healer pela cobertura e desperdício.
 */
export const CRITERIO_DO_OFICIO: Record<FuncaoDaProntidao, Record<NivelDeConteudo, number>> = {
  // % do próprio sim. Os cortes de 75/85/92 que a comunidade usa reprovavam
  // o core inteiro: com os sims frescos o melhor da casa é o jrxamã com 88%.
  // Ancorado no real — mítico exige o que só o melhor alcança hoje.
  dps: { normal: 60, heroico: 75, mitico: 88 },
  // Nota de Defender. Nas 17 noites-tank da temporada: 34,8 a 59,9, mediana 45,4.
  tank: { normal: 38, heroico: 45, mitico: 55 },
  // Nota de Curar. Nas 23 noites-healer: 67,9 a 89,5, mediana 81,9.
  healer: { normal: 75, heroico: 82, mitico: 88 },
};

export const ROTULO_DO_OFICIO: Record<FuncaoDaProntidao, string> = {
  dps: "% do seu sim",
  tank: "Defender",
  healer: "Curar",
};

export type FuncaoDaProntidao = "dps" | "tank" | "healer";

/** Os quatro critérios de raide, iguais pras três funções. */
export type ChaveDeRaide = "parse" | "mechanics" | "deathShare" | "preparation";

/** Como o jogador está contra UM critério. */
export interface CriterioAvaliado {
  chave: ChaveDeRaide | "oficio";
  rotulo: string;
  /** O que a pessoa tem hoje. Null quando o dado não existe. */
  valor: number | null;
  /** O que o nível pede. */
  exigido: number;
  /** Menor é melhor? (mecânicas e tempo morto). */
  menorEMelhor: boolean;
  cumpre: boolean;
}

export interface ProntidaoDoJogador {
  /** O maior nível em que TODOS os critérios fecham. Null se nem o normal fecha. */
  nivel: NivelDeConteudo | null;
  /** O degrau seguinte, pra tela mostrar só ele. Null quando já está no topo. */
  proximo: NivelDeConteudo | null;
  /** O que falta pro próximo degrau — só os critérios que não fecham. */
  falta: CriterioAvaliado[];
  /** Todos os critérios do próximo degrau, pra tela explicar a conta inteira. */
  criterios: CriterioAvaliado[];
  /**
   * O perfil de Mythic+ pelo Raider.IO. Contexto ao lado da prontidão,
   * nunca porteiro dela — ver `perfilDeChave`.
   */
  perfilDeChave: NivelDeConteudo | null;
}

/** O que a prontidão lê do jogador. Médias da temporada, não de uma noite. */
export interface MediasDoJogador {
  parse: number | null;
  mechanics: number | null;
  deathShare: number | null;
  preparation: number | null;
  io: number | null;
  /** % do próprio sim que a pessoa entrega. Null sem sim ou sem dps. */
  /**
   * O número do OFÍCIO dela: % do próprio sim pro dps, nota de Defender pro
   * tank, nota de Curar pro healer. Null quando o dado não existe.
   */
  oficio: number | null;
}

const ROTULOS: Record<ChaveDeRaide, string> = {
  parse: "Parse",
  mechanics: "Mecânicas por try",
  deathShare: "Tempo morto em luta",
  preparation: "Preparação",
};

const MENOR_E_MELHOR: Record<ChaveDeRaide, boolean> = {
  parse: false,
  mechanics: true,
  deathShare: true,
  preparation: false,
};

/**
 * Avalia um nível. Critério sem dado NÃO bloqueia.
 *
 * É a mesma regra do Score: a lacuna é nossa, não do jogador. Quem ainda
 * não tem sim medido não pode ficar preso no normal por causa disso.
 */
export function avaliarNivel(
  medias: MediasDoJogador,
  nivel: NivelDeConteudo
): CriterioAvaliado[] {
  const exigido = EXIGENCIA[nivel];

  return (Object.keys(ROTULOS) as ChaveDeRaide[]).map((chave) => {
    const valor = medias[chave];
    const menorEMelhor = MENOR_E_MELHOR[chave];
    const alvo = exigido[chave];

    return {
      chave,
      rotulo: ROTULOS[chave],
      valor,
      exigido: alvo,
      menorEMelhor,
      cumpre: valor === null ? true : menorEMelhor ? valor <= alvo : valor >= alvo,
    };
  });
}

/**
 * Em qual nível o jogador está, e o que falta pro próximo.
 *
 * O percentual do sim entra como critério extra quando existe: entregar 92%
 * do próprio potencial é exigência de mítico, e é o número que sobe sozinho
 * conforme a pessoa se equipa.
 */
export function avaliarProntidao(
  medias: MediasDoJogador,
  funcao: FuncaoDaProntidao
): ProntidaoDoJogador {
  const cumpreNivel = (nivel: NivelDeConteudo) => {
    const criterios = avaliarNivel(medias, nivel);
    const oficio =
      medias.oficio === null || medias.oficio >= CRITERIO_DO_OFICIO[funcao][nivel];
    return criterios.every((c) => c.cumpre) && oficio;
  };

  // Do topo pra baixo: o nível vale quando ele e os de baixo fecham.
  let nivel: NivelDeConteudo | null = null;
  for (const candidato of NIVEIS) {
    if (!cumpreNivel(candidato)) break;
    nivel = candidato;
  }

  const indiceAtual = nivel === null ? -1 : NIVEIS.indexOf(nivel);
  const proximo = indiceAtual + 1 < NIVEIS.length ? NIVEIS[indiceAtual + 1] : null;

  const criterios =
    proximo === null
      ? []
      : [
          ...avaliarNivel(medias, proximo),
          {
            chave: "oficio" as const,
            rotulo: ROTULO_DO_OFICIO[funcao],
            valor: medias.oficio,
            exigido: CRITERIO_DO_OFICIO[funcao][proximo],
            menorEMelhor: false,
            cumpre: medias.oficio === null || medias.oficio >= CRITERIO_DO_OFICIO[funcao][proximo],
          },
        ];

  return {
    nivel,
    proximo,
    criterios,
    falta: criterios.filter((c) => !c.cumpre),
    perfilDeChave: perfilDeChave(medias.io),
  };
}
