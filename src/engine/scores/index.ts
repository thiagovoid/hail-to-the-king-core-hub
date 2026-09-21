import type { PlayerPerformance } from "../../types/performance";
import type { CorePerformanceTargets, CoreTarget } from "../../types/index";
import { progressoComFolga } from "../metrics";
import { notaDeAjudar } from "./ajudar";

export type ScoreDimensionKey =
  | "parse"
  | "mechanics"
  | "attack"
  | "defense"
  | "healing"
  | "survival"
  | "help"
  | "deliver"
  | "preparation";

export interface ScoreDimension {
  key: ScoreDimensionKey;
  label: string;
  /** Peso da dimensão — os quatro somam exatamente 100. */
  weight: number;
  /**
   * O que o valor mede ("erros por try", "percentil"). Sem isto, 2,3 e 11
   * na mesma tela pareciam grandezas do mesmo tipo — um é média por try, o
   * outro é frequência entre trys.
   */
  unit: string;
  /** O que a métrica mede, pra explicar a nota na interface. */
  description: string;
  /** De onde o dado vem (ou por que ainda não vem). */
  source: string;
  /**
   * Sub-nota 0-100 da dimensão, ou null quando o dado por trás dela ainda
   * não é coletado. Dimensão null fica de fora da média ponderada — nunca
   * conta como 0, pra métrica que não temos não puxar o jogador pra baixo.
   */
  score: number | null;
  /**
   * Valor medido de verdade (34 de parse, 2.3 erros por try), não o
   * progresso. É o que a tela mostra: "87" parece um valor mas é percentual
   * de caminho andado, e ninguém reconhecia a própria métrica nele.
   */
  value: number | null;
  /** Meta do core usada nessa dimensão, pra UI conseguir explicar a nota. */
  target: CoreTarget;
}

export interface OverallPerformanceScore {
  /** A nota final: as dimensões ponderadas, JÁ multiplicadas por sobrevivência. */
  overall: number | null;
  /** A média ponderada antes do multiplicador — é o que o fator escala. */
  beforeSurvival: number | null;
  /**
   * Quanto da nota sobrou depois de descontar o tempo morto. 1 = intacta.
   *
   * Null quando a noite não tem o dado de morte (log antigo).
   */
  survivalFactor: number | null;
  dimensions: ScoreDimension[];
}

/**
 * O quanto a nota vale depois de descontar o tempo em que a pessoa não
 * estava lá.
 *
 * Dentro da meta do core não desconta nada: progressão tem morte, e a call
 * de wipe já custa perto de zero por construção (ver `deathCost`). Acima
 * dela, desconta o EXCESSO, ponto a ponto — passar 30% da noite morto com a
 * meta em 10% deixa a nota valendo 80% do que valia.
 */
export function fatorDeSobrevivencia(share: number, meta: number): number {
  return 1 - Math.max(0, share - meta) / 100;
}

/**
 * Peso de cada dimensão.
 *
 * As cinco que valem pra todo mundo somam 100 (Parse 35, Mecânicas 30,
 * Atacar 15, Defender 10, Preparação 10). "Curar" fica FORA dessa soma de
 * propósito: ela só existe pra quem curou, e a média é renormalizada pelas
 * dimensões disponíveis de cada um — então o healer é avaliado com ela
 * dentro, e o dps nem vê que ela existe.
 *
 * O peso 20 põe "Curar" acima de Atacar e Defender e abaixo de Mecânicas:
 * pro healer é o ofício principal, mas não apaga o resto.
 */
/** Função que a régua usa. Não é o cargo no roster — ver funcaoEfetiva. */
export type FuncaoDoJogador = "dps" | "tank" | "healer";

/**
 * Peso de cada dimensão POR FUNÇÃO. Cada coluna soma 100.
 *
 * Healer cura, tank segura, dps bate — e a nota tem que refletir isso. Medir
 * um tank com Parse valendo 35 é avaliá-lo pelo dano, que não é o ofício
 * dele; medir um healer por Atacar é pior ainda.
 *
 * Mecânicas fica em 25 pras três de propósito: errar mecânica custa wipe
 * independente da função, e um tank que segura muito bem ignorando mecânica
 * precisa cair mesmo assim.
 *
 * Preparação é 15 no tank contra 10 nos outros: consumível de tank é
 * sobrevivência, não só número.
 */
/**
 * Sobreviver tem peso ZERO de propósito: ela não é parcela, é multiplicador.
 *
 * Peso não funcionaria. Medido nas 113 noites da temporada: subir o peso de
 * Sobreviver de 15 pra 40 movia o Dagom de 70 pra 69. Um ponto — porque as
 * outras dimensões batem no teto de 100% e absorvem a ruim.
 *
 * E parcela não é o que se quer dizer. Estar com a melhor preparação, o
 * melhor dps e tudo em dia não significa nada se a pessoa morreu no começo
 * da luta: o raide seguiu sem ela. Isso é invalidação, não desconto — ver
 * `fatorDeSobrevivencia`.
 */
/**
 * AJUDAR PESA ZERO, e isso foi uma correção, não um esquecimento.
 *
 * Ela media aproveitamento de recarga das magias de utilidade, e recarga não
 * descreve magia situacional. Das 27 magias que a temporada registrou, só
 * duas são rotacionais — Power Infusion (85,6% de eficiência) e Evangelism
 * (67,3%). Todo o resto vive em um dígito, porque não se usa por recarga:
 * usa-se quando a luta pede.
 *
 * A prova de que o que ela media era o KIT, e não a pessoa: Apocalipse e
 * Cowsadeer têm exatamente o mesmo par de magias medidas (Hammer of Justice
 * e Intercession) e tiravam 100 e 21,7. O Heracranosx tirava 100 de uma
 * noite com uma magia usada uma vez. O Heroísmo, que por desenho se usa uma
 * vez por try, dava 85,6 a um jogador e 28,2 a outro. E três pessoas não
 * tinham nota nenhuma a temporada inteira.
 *
 * Curadoria de lista não conserta: o defeito não é a lista estar errada, é a
 * régua não existir. O que ela media segue visível como DADO — magia a
 * magia, interrupções, battle rez, dispels — sem virar nota.
 *
 * Os 15 pontos vão pro ofício de cada função, que é onde a pessoa já é
 * cobrada pelo que ela de fato escolheu fazer.
 */
const PESOS_POR_FUNCAO: Record<FuncaoDoJogador, Record<ScoreDimensionKey, number>> = {
  dps: { parse: 0, mechanics: 25, attack: 15, defense: 10, healing: 0, survival: 0, help: 0, deliver: 50, preparation: 0 },
  tank: { parse: 0, mechanics: 30, attack: 10, defense: 60, healing: 0, survival: 0, help: 0, deliver: 0, preparation: 0 },
  healer: { parse: 0, mechanics: 30, attack: 5, defense: 10, healing: 55, survival: 0, help: 0, deliver: 0, preparation: 0 },
};

/**
 * A função pela qual a pessoa é medida NESTA noite.
 *
 * Ter nota de cura significa que a WCL registrou a pessoa no balde de
 * healers, e isso vale mais que o cadastro: a Ligiaf está no roster como dps
 * e passou a noite de 15/09 curando. Medi-la com os pesos de dps daria peso
 * 20 a "Atacar", que ela nem tem, e zero ao que ela realmente fez.
 */
export function funcaoEfetiva(
  performance: PlayerPerformance,
  funcaoDoRoster?: FuncaoDoJogador
): FuncaoDoJogador {
  if (performance.healing !== undefined) return "healer";
  return funcaoDoRoster ?? "dps";
}

/**
 * A mitigação que vale nota cheia PARA UM TANQUE.
 *
 * A mitigação estava fora da nota com uma justificativa que a temporada
 * confirma entre funções e desmente entre tanques. Entre funções ela mede
 * armadura: a mediana é 45,8% no dps e 39,6% no tanque, porque tanque come
 * dano mágico, que armadura não corta. Pontuar isso puniria quem tanka.
 *
 * Entre tanques, porém, ela separa — e separa na direção que quem assiste à
 * raide enxerga. Na temporada: Apocalipse mitiga 42% e come 82 mil de dano
 * por segundo; Blackwatch mitiga 35% e come 95 mil. A nota de cooldowns
 * dizia o contrário (45 contra 47), e o dado de mitigação dizia o que o
 * olho via.
 *
 * 42% é o p75 das 17 noites-tanque. Vale só pra tanque, e por isso a
 * comparação é sempre entre iguais.
 */
export const MITIGACAO_DO_TANQUE = 42;

const DIMENSION_META: Record<
  ScoreDimensionKey,
  { label: string; unit: string; description: string; source: string }
> = {
  parse: {
    label: "Parse",
    unit: "percentil",
    description:
      "Percentil do seu dano (ou cura) comparado com jogadores da mesma spec no mesmo boss e dificuldade. 60 significa que você ficou acima de 60% deles.",
    source:
      "Warcraft Logs. Só existe para boss morto — wipe não recebe ranking, então esse número olha os bosses que caíram na noite.",
  },
  mechanics: {
    label: "Mecânicas",
    unit: "erros por try",
    description:
      "Média de mecânicas DISTINTAS erradas por try — dano evitável tomado, soak perdido. Errar a mesma mecânica cinco vezes na mesma try conta uma: a régua é quantas coisas diferentes deram errado, não quantas pancadas você levou.",
    source:
      "Wipefest, todas as trys da noite (kill ou wipe). A curadoria deles é que decide o que conta: dano de soak dividido entre o grupo não é erro, tomar uma habilidade que dava pra desviar é.",
  },
  attack: {
    label: "Atacar",
    unit: "% de execução",
    description:
      "Quanto da luta você passou atacando (uptime) e quanto do tempo seus cooldowns ofensivos ficaram em recarga. Cooldown guardado é dano que não aconteceu: a régua é tempo em recarga, não quantidade de usos.",
    source:
      "Warcraft Logs (tempo ativo e cada cast da noite) + Wowhead (recarga e cargas de cada magia). Cooldown que quase não representa dano seu — um gap closer, por exemplo — fica de fora da conta.",
  },
  defense: {
    label: "Defender",
    unit: "% de execução",
    description:
      "Quanto do tempo seus cooldowns defensivos ficaram em recarga. Dano recebido e mitigação aparecem ao lado como contexto, mas não entram na nota: a mitigação ficou entre 38% e 48% pro raide inteiro, com os tanks por último — ela mede armadura e buff, não decisão.",
    source:
      "Warcraft Logs (eventos de cast e dano recebido) + Wowhead (recarga de cada magia).",
  },
  healing: {
    label: "Curar",
    unit: "% de execução",
    description:
      "Quanto do dano que o raide tomou passou pelas suas mãos, medido contra o quinhão que caberia a você, mais o quanto da sua cura NÃO caiu em quem já estava cheio. Curar mais não é curar melhor: quem cura muito costuma estar num raide que apanhou muito.",
    source:
      "Warcraft Logs (cura efetiva, overheal e dano recebido pelo raide). Só existe pra quem a WCL registrou curando na noite — não pro que está escrito no roster.",
  },
  survival: {
    label: "Sobreviver",
    unit: "% da noite morto",
    description:
      "Quanto do tempo de luta da noite você passou morto ENQUANTO o raide ainda lutava. Não é contagem de mortes: morrer três segundos antes do wipe custa três segundos, morrer no começo de uma luta de oito minutos custa oito minutos. Progressão de trezentas trys com call de wipe no fim sai perto de zero — resiliência não é punida, desperdício é.",
    source:
      "Warcraft Logs (eventos de morte, com a try em que aconteceram). Morte em try que virou kill aparece à parte: o boss caiu sem você.",
  },
  help: {
    label: "Ajudar",
    unit: "% do que a magia dá",
    description:
      "O que você fez pelo GRUPO: interromper, controlar adds, acelerar o raide, socorrer e levantar quem caiu. Cada magia é medida contra o melhor aproveitamento já visto DELA nesta temporada — um Kick de 15s nunca ficaria em recarga a luta inteira, e cobrar isso mediria o kit em vez da pessoa. Quem não tem utilidade de grupo não é medido por ela.",
    source:
      "Warcraft Logs (cada cast da noite) + Wowhead (recarga de cada magia), sobre uma lista curada de utilidade de grupo. Defensivo e cooldown de dano ficam de fora: já contam em Defender e Atacar.",
  },
  deliver: {
    label: "Entregar",
    unit: "% do seu sim",
    description:
      "Quanto do SEU potencial você entregou: o dano da noite contra a simulação que o Raidbots fez do seu personagem, com o seu equipamento e os seus talentos. Não é comparação com ninguém — é você contra o teto do seu próprio boneco.",
    source:
      "Warcraft Logs (dano da noite) + Raidbots (simulação semanal por jogador). A meta de sim fica guardada na noite, porque ela sobe conforme a pessoa se equipa: comparar o dano de agosto com o sim de setembro diria que alguém piorou quando melhorou.",
  },
  preparation: {
    label: "Preparação",
    unit: "% pronto",
    description:
      "Encantos e gemas do equipamento, mais os consumíveis da noite (flask, comida, poção, pedra de vida). Vale a presença, não o item exato: encanto ou gema fora do BIS conta igual.",
    source:
      "Warcraft Logs (gear do log) + Wowhead (quantos encantos e gemas a sua spec espera) + Wipefest (o que o ready check flagrou faltando).",
  },
};

/**
 * A meta desta dimensão PARA ESTA FUNÇÃO.
 *
 * Quase toda dimensão tem meta única — é o que mantém a régua comparável. A
 * exceção existe onde a diferença é de kit e não de esforço: ver
 * `CoreTarget.porFuncao`.
 */
export function metaDaFuncao(target: CoreTarget, funcao: FuncaoDoJogador): CoreTarget {
  const especifica = target.porFuncao?.[funcao];
  return especifica === undefined ? target : { ...target, target: especifica };
}

function progress(value: number | undefined, target: CoreTarget): number | null {
  if (value === undefined) return null;
  return progressoComFolga(value, target.target, target.direction);
}

/**
 * Score Engine: Score Geral 0-100 de um jogador numa noite de raid,
 * comparando cada dimensão contra a meta do core (igual pra todo mundo,
 * definida em `config.performanceTargets` do arquivo da temporada).
 *
 * O insumo é a noite inteira: desde que a agregação da WCL passou a somar
 * todas as trys (kills + wipes), `dps`/`hps` e as notas do Wipefest cobrem
 * a noite toda, não só os kills. A exceção é `parse`: a WCL só calcula
 * percentil pra kill — wipe não tem ranking, então esse número continua
 * sendo o melhor parse entre os bosses mortos na noite.
 *
 * Mortes saíram da contabilização por hora (segue coletado, aparece no
 * histórico, mas não pontua).
 *
 * As cinco dimensões têm coleta rodando. "Cooldowns" era uma só e virou
 * duas — Atacar e Defender — quando ficou claro que a régua é diferente
 * pros dois lados: cooldown ofensivo guardado é dano perdido, defensivo
 * guardado muitas vezes é a decisão certa.
 *
 * Dimensão sem dado é descartada e seu peso é redistribuído entre as que
 * têm — em vez de assumir um denominador fixo de 100 pontos.
 */
/**
 * O valor de Defender desta noite.
 *
 * Pro tanque, a nota de cooldowns entra em média com a mitigação
 * normalizada (ver MITIGACAO_DO_TANQUE). Pras outras funções continua só o
 * cooldown, porque ali a mitigação mede equipamento.
 */
/**
 * Quanto do próprio sim a pessoa entregou na noite, 0-100+.
 *
 * Substituiu Parse como a medida de dano do dps, e a razão é prática: parse
 * SÓ EXISTE PARA BOSS MORTO. Num grupo em progressão, a métrica de maior
 * peso media justamente as lutas que o core já domina, e ficava cega na
 * luta que estava sendo aprendida. Além disso parse é percentil contra a
 * população, o que premia jogo ganancioso — e jogo ganancioso é o que mata
 * gente em progressão.
 *
 * Null sem dano ou sem sim medido: dimensão sem dado sai da média em vez de
 * virar zero.
 */
function percentualDoSim(performance: PlayerPerformance): number | null {
  const dano = performance.dps;
  const sim = performance.simTarget;
  if (typeof dano !== "number" || typeof sim !== "number" || sim <= 0) return null;

  return Math.round((dano / sim) * 1000) / 10;
}

function valorDeDefender(
  performance: PlayerPerformance,
  funcao: FuncaoDoJogador
): number | null {
  const cooldowns = performance.defense?.score ?? null;
  if (funcao !== "tank") return cooldowns;

  const mitigacao = performance.defense?.mitigation;
  if (mitigacao === undefined) return cooldowns;

  const notaDaMitigacao = Math.min(100, (mitigacao / MITIGACAO_DO_TANQUE) * 100);
  if (cooldowns === null) return Math.round(notaDaMitigacao * 10) / 10;

  return Math.round(((cooldowns + notaDaMitigacao) / 2) * 10) / 10;
}

export function calculateOverallScore(
  performance: PlayerPerformance,
  targets: CorePerformanceTargets,
  funcaoDoRoster?: FuncaoDoJogador
): OverallPerformanceScore {
  const funcao = funcaoEfetiva(performance, funcaoDoRoster);
  const pesos = PESOS_POR_FUNCAO[funcao];

  /** A meta de cada dimensão já resolvida pra função desta noite. */
  const alvo = (chave: keyof CorePerformanceTargets) => metaDaFuncao(targets[chave], funcao);

  const dimensions: ScoreDimension[] = [
    {
      key: "parse",
      ...DIMENSION_META.parse,
      weight: pesos.parse,
      target: alvo("parse"),
      value: performance.parse ?? null,
      score: progress(performance.parse, alvo("parse")),
    },
    {
      key: "mechanics",
      ...DIMENSION_META.mechanics,
      weight: pesos.mechanics,
      target: alvo("mechanics"),
      value: performance.mechanics?.errors ?? null,
      score: progress(performance.mechanics?.errors, alvo("mechanics")),
    },
    {
      key: "attack",
      ...DIMENSION_META.attack,
      weight: pesos.attack,
      target: alvo("attack"),
      value: performance.attack?.score ?? null,
      score: progress(performance.attack?.score, alvo("attack")),
    },
    {
      key: "defense",
      ...DIMENSION_META.defense,
      weight: pesos.defense,
      target: alvo("defense"),
      value: valorDeDefender(performance, funcao),
      score: progress(valorDeDefender(performance, funcao) ?? undefined, alvo("defense")),
    },
    {
      key: "healing",
      ...DIMENSION_META.healing,
      weight: pesos.healing,
      target: alvo("healing"),
      value: performance.healing?.score ?? null,
      score: progress(performance.healing?.score, alvo("healing")),
    },
    {
      key: "survival",
      ...DIMENSION_META.survival,
      weight: pesos.survival,
      target: alvo("survival"),
      value: performance.deathCost?.share ?? null,
      score: progress(performance.deathCost?.share, alvo("survival")),
    },
    {
      key: "help",
      ...DIMENSION_META.help,
      weight: pesos.help,
      target: alvo("help"),
      value: notaDeAjudar(performance.helpDetail, performance.utility, performance.tries),
      score: progress(
        notaDeAjudar(performance.helpDetail, performance.utility, performance.tries) ?? undefined,
        alvo("help")
      ),
    },
    {
      key: "deliver",
      ...DIMENSION_META.deliver,
      weight: pesos.deliver,
      target: alvo("deliver"),
      value: percentualDoSim(performance),
      score: progress(percentualDoSim(performance) ?? undefined, alvo("deliver")),
    },
    {
      key: "preparation",
      ...DIMENSION_META.preparation,
      weight: pesos.preparation,
      target: alvo("preparation"),
      value: performance.preparation ?? null,
      score: progress(performance.preparation, alvo("preparation")),
    },
  ];

  const available = dimensions.filter(
    (dimension): dimension is ScoreDimension & { score: number } => dimension.score !== null
  );

  if (available.length === 0) {
    return { overall: null, beforeSurvival: null, survivalFactor: null, dimensions };
  }

  const totalWeight = available.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weightedSum = available.reduce((sum, dimension) => sum + dimension.weight * dimension.score, 0);
  // A sub-nota pode passar de 100 (ver TETO_DA_SUB_NOTA), a nota final não.
  // É o que deixa a excelência numa dimensão compensar uma fraca sem que o
  // Score deixe de ser uma escala de 0 a 100.
  const beforeSurvival = Math.min(100, Math.round(weightedSum / totalWeight));

  const share = performance.deathCost?.share;
  const survivalFactor =
    share === undefined ? null : fatorDeSobrevivencia(share, targets.survival.target);

  /**
   * O 100 é reservado pra quem cumpriu TODAS as metas da função.
   *
   * Sem isto ele era comprável: a folga acima de 100 numa dimensão pagava a
   * falha em outra, e 17 das 19 notas 100 da temporada tinham pelo menos uma
   * meta não cumprida. A Cowsadeer tirava 100 tendo falhado em Atacar E
   * Defender; o Voidsurge tirava 100 tendo falhado em Curar, que é o ofício
   * dele e pesa 55. Um Score que diz "perfeito" pra quem não cumpriu o
   * próprio ofício é exatamente o tipo de número que ninguém acredita.
   *
   * O corte é em 99 e não em algo menor de propósito: a folga continua
   * premiando quem vai além da meta em toda a faixa, e o que se perde é só a
   * capacidade de comprar o TETO. Medido: 14 noites mudam, todas caindo
   * exatamente um ponto, e a distribuição inteira — mediana, quartis, quantas
   * noites passam de 90 — fica idêntica.
   */
  /**
   * Só as dimensões que PONTUAM entram nessa conta.
   *
   * `available` filtra por ter nota, não por ter peso, então carrega junto
   * Parse, Ajudar, Preparação e Sobreviver — as quatro que saíram do Score de
   * propósito. Exigi-las aqui gatilhava o teto por fora da nota: Preparação
   * sozinha reprova 69% das noites, e o 100 simplesmente deixava de existir.
   * Cobrar no teto o que não se cobra na nota é a mesma incoerência, do
   * avesso.
   */
  const cumpriuTudo = available
    .filter((dimension) => dimension.weight > 0)
    .every((dimension) =>
      dimension.target.direction === "lower"
        ? dimension.value! <= dimension.target.target
        : dimension.value! >= dimension.target.target
    );

  const comSobrevivencia = Math.round(beforeSurvival * (survivalFactor ?? 1));

  return {
    overall: cumpriuTudo ? comSobrevivencia : Math.min(99, comSobrevivencia),
    beforeSurvival,
    survivalFactor,
    dimensions,
  };
}
