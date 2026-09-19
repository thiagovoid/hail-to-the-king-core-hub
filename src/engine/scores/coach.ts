/**
 * O coach: o que treinar antes da próxima terça.
 *
 * Ficou escondido na tela por um motivo: a primeira versão apontava a
 * dimensão mais fraca e mandava "revise sua rotação". Isso não é coach, é
 * constatação — a pessoa já sabe que o parse está baixo, o que ela não sabe
 * é O QUE fazer na terça que vem.
 *
 * Seis regras, todas verificadas em teste:
 *
 * 1. **Abre com o que mudou.** Ninguém lê conselho de quem não viu o
 *    esforço. Se a preparação subiu de 57 pra 71, isso vem primeiro.
 * 2. **Aponta a causa, não o sintoma.** "Parse baixo" é sintoma. A causa é
 *    o cooldown que ficou na mão, ou a poção que não foi tomada.
 * 3. **Uma coisa de cada vez, com nome próprio.** "Peçonha Sanguínea",
 *    "Stormkeeper", "Poção" — não "Mecânicas".
 * 4. **Diz quanto vale.** Os pontos vêm de recalcular o Score com aquela
 *    dimensão na meta. É a conta de verdade, não um número inventado.
 * 5. **Nunca compara com outro jogador.** A entrada é o histórico da
 *    própria pessoa e as metas do core. Mais nada.
 * 6. **Registra o que foi bem.** Sempre. Mesmo quando nada mudou, alguma
 *    coisa está acima da meta — e é ela que abre o cartão.
 */

import type { CorePerformanceTargets } from "../../types/index";
import type { PlayerPerformance } from "../../types/performance";
import {
  calculateOverallScore,
  type FuncaoDoJogador,
  type OverallPerformanceScore,
  type ScoreDimension,
  type ScoreDimensionKey,
} from "./index";

/** O que o coach lê da noite. Só o histórico da própria pessoa (regra 5). */
export type NoiteDoCoach = PlayerPerformance;

export interface PontoPositivo {
  /** Mudou desde a última noite, ou é um ponto forte que se mantém? */
  tipo: "avanco" | "destaque";
  dimensao: ScoreDimensionKey;
  texto: string;
}

export interface FocoDoCoach {
  dimensao: ScoreDimensionKey;
  rotulo: string;
  /** O nome próprio da coisa (regra 3): "Peçonha Sanguínea", "Poção". */
  nome: string;
  /** A causa, com número (regra 2). */
  causa: string;
  /** O que fazer na próxima terça. */
  acao: string;
  /** Quantos pontos do Score isso vale (regra 4). 0 = não dá pra estimar. */
  ganho: number;
  /** Explicação visual da mecânica, quando a Wipefest tem uma. */
  tipEmbedUrl?: string;
}

export interface RecomendacaoDoCoach {
  /** Regras 1 e 6: sempre abre por aqui quando existe algo. */
  positivo: PontoPositivo | null;
  /** Regras 2, 3 e 4. Null quando não há nada abaixo da meta. */
  foco: FocoDoCoach | null;
  /** Nenhuma dimensão tem dado — a lacuna é nossa, e a tela diz isso. */
  semDados: boolean;
}

/**
 * Acima disto a dimensão é reconhecimento, não cobrança.
 *
 * Mesmo corte do verde no PerformanceScoreCard: duas réguas diferentes pra
 * "está bom?" fariam o cartão elogiar o que o card acusa.
 */
const FORTE = 80;

/** Abaixo disto a variação é ruído de uma noite, não avanço. */
const AVANCO_MINIMO = 4;

/** "1,8" em vez de "1.8". */
const numero = (valor: number): string =>
  String(Math.round(valor * 10) / 10).replace(".", ",");

/**
 * "1 erro por try", não "1 erros por try".
 *
 * A unidade da dimensão é escrita no plural porque quase sempre é plural.
 * O caso de 1 é raro e é justamente o do jogador que foi bem — deixar um
 * errinho de português na única frase que elogia alguém seria uma pena.
 */
function unidade(valor: number, unit: string): string {
  return Math.round(valor * 10) === 10 ? unit.replace("erros", "erro") : unit;
}

function dimensaoDe(
  score: OverallPerformanceScore,
  chave: ScoreDimensionKey
): ScoreDimension | undefined {
  return score.dimensions.find((d) => d.key === chave);
}

/**
 * A mesma noite, com UMA dimensão na meta do core.
 *
 * É assim que o ganho sai honesto: em vez de chutar "vale uns 5 pontos", o
 * Score é recalculado com aquela peça arrumada e a diferença é o que a
 * pessoa ganha. Vale zero quando a dimensão não tem dado.
 */
function comMetaEm(
  noite: NoiteDoCoach,
  chave: ScoreDimensionKey,
  targets: CorePerformanceTargets
): NoiteDoCoach {
  switch (chave) {
    case "parse":
      return { ...noite, parse: targets.parse.target };
    case "mechanics":
      return noite.mechanics
        ? { ...noite, mechanics: { ...noite.mechanics, errors: targets.mechanics.target } }
        : noite;
    case "attack":
      return noite.attack
        ? { ...noite, attack: { ...noite.attack, score: targets.attack.target } }
        : noite;
    case "defense":
      return noite.defense
        ? { ...noite, defense: { ...noite.defense, score: targets.defense.target } }
        : noite;
    case "healing":
      return noite.healing
        ? { ...noite, healing: { ...noite.healing, score: targets.healing.target } }
        : noite;
    case "survival":
      return noite.deathCost
        ? { ...noite, deathCost: { ...noite.deathCost, share: targets.survival.target } }
        : noite;
    case "preparation":
      return { ...noite, preparation: targets.preparation.target };
  }
}

function ganhoDe(
  noite: NoiteDoCoach,
  chave: ScoreDimensionKey,
  targets: CorePerformanceTargets,
  funcao: FuncaoDoJogador | undefined,
  atual: number
): number {
  const comMeta = calculateOverallScore(comMetaEm(noite, chave, targets), targets, funcao).overall;
  return comMeta === null ? 0 : Math.max(0, comMeta - atual);
}

/**
 * O que melhorou desde a noite anterior (regra 1).
 *
 * Compara o VALOR medido, não a sub-nota: "subiu de 57 pra 71 de preparação"
 * é a frase que a pessoa reconhece; "sua sub-nota foi de 81 pra 94" não diz
 * nada pra ninguém.
 */
function acharAvanco(
  agora: OverallPerformanceScore,
  antes: OverallPerformanceScore
): PontoPositivo | null {
  let melhor: { dimensao: ScoreDimension; anterior: number; delta: number } | null = null;

  for (const dimensao of agora.dimensions) {
    const anterior = dimensaoDe(antes, dimensao.key);
    if (dimensao.score === null || anterior?.score == null) continue;
    if (dimensao.value === null || anterior.value === null) continue;

    const delta = dimensao.score - anterior.score;
    if (delta < AVANCO_MINIMO) continue;
    if (melhor === null || delta > melhor.delta) {
      melhor = { dimensao, anterior: anterior.value, delta };
    }
  }

  if (melhor === null) return null;

  const { dimensao, anterior } = melhor;
  const subiu = (dimensao.value as number) > anterior;

  return {
    tipo: "avanco",
    dimensao: dimensao.key,
    texto: `${dimensao.label} ${subiu ? "subiu" : "caiu"} de ${numero(anterior)} para ${numero(
      dimensao.value as number
    )} ${unidade(dimensao.value as number, dimensao.unit)} desde a noite anterior.`,
  };
}

/** O ponto mais forte da noite, pra quando nada mudou (regra 6). */
function acharDestaque(score: OverallPerformanceScore): PontoPositivo | null {
  const comNota = score.dimensions.filter(
    (d): d is ScoreDimension & { score: number; value: number } =>
      d.score !== null && d.value !== null
  );

  if (comNota.length === 0) return null;

  // Empate no topo é comum: várias dimensões batem em 100 no mesmo dia. Aí
  // vale a de maior peso na função da pessoa — entre duas coisas igualmente
  // boas, a que importa pro ofício dela. É também o que tira "Sobreviver"
  // do lugar de destaque: peso zero, porque ela é multiplicador.
  const melhor = comNota.reduce((topo, d) =>
    d.score > topo.score || (d.score === topo.score && d.weight > topo.weight) ? d : topo
  );

  if (melhor.score < FORTE) return null;

  return {
    tipo: "destaque",
    dimensao: melhor.key,
    texto: `${melhor.label} em ${numero(melhor.value)} ${unidade(melhor.value, melhor.unit)} — a meta do core é ${numero(
      melhor.target.target
    )}.`,
  };
}

/**
 * A causa por trás de cada dimensão (regras 2 e 3).
 *
 * Cada uma procura o nome próprio no detalhe da noite. Quando o detalhe não
 * existe, devolve null e o coach passa pra próxima dimensão mais fraca —
 * conselho sem nome próprio é o que a primeira versão fazia, e é justamente
 * o que não ajuda ninguém.
 */
function acharCausa(
  noite: NoiteDoCoach,
  dimensao: ScoreDimension
): Pick<FocoDoCoach, "nome" | "causa" | "acao" | "tipEmbedUrl"> | null {
  switch (dimensao.key) {
    case "mechanics":
    case "survival": {
      const pior = [...(noite.mechanicsDetail ?? [])].sort((a, b) => b.tries - a.tries)[0];
      if (!pior) return null;

      const trys = noite.mechanics?.tries;
      const nome = pior.label ?? pior.mechanic.replace("Damage from ", "");

      return {
        nome,
        causa:
          trys !== undefined
            ? `Pegou você em ${pior.tries} de ${trys} trys no ${pior.boss}.`
            : `Pegou você em ${pior.tries} trys no ${pior.boss}.`,
        acao:
          dimensao.key === "survival"
            ? `Essa é a mecânica que mais te alcançou — e tempo morto é o que apaga o resto da noite. Vale assistir como ela abre antes do próximo pull.`
            : `Uma mecânica, uma terça. Vale assistir como ela abre antes do próximo pull.`,
        tipEmbedUrl: pior.tipEmbedUrl,
      };
    }

    case "attack":
    case "defense": {
      const detalhe = dimensao.key === "attack" ? noite.attackDetail : noite.defenseDetail;
      const pior = [...(detalhe ?? [])].sort((a, b) => a.efficiency - b.efficiency)[0];
      if (!pior) return null;

      return {
        nome: pior.name,
        causa: `Ficou ${numero(pior.efficiency)}% do tempo em recarga — ${pior.casts} uso${
          pior.casts === 1 ? "" : "s"
        } na noite.`,
        acao:
          dimensao.key === "attack"
            ? `Combine antes do pull em que momento ele entra. Cooldown guardado pro final conta como não ter usado.`
            : `Escolha antes do pull qual mecânica ele cobre. Defensivo que volta inteiro pra casa é dano que você tomou à toa.`,
      };
    }

    case "preparation": {
      const faltando = noite.preparationMissing ?? [];

      return faltando.length > 0
        ? {
            nome: faltando[0],
            causa:
              faltando.length === 1
                ? `Foi o único item que faltou no ready check.`
                : `Faltou no ready check, junto de ${faltando.slice(1).join(", ")}.`,
            acao: `É o ponto mais barato da lista: não muda nada na sua execução.`,
          }
        : {
            nome: "Encantos e gemas",
            causa: `O equipamento da noite tinha espaço sobrando.`,
            acao: `É o ponto mais barato da lista: resolve fora da raide, de uma vez só.`,
          };
    }

    case "healing": {
      if (!noite.healing) return null;
      const desperdicio = noite.healing.overheal;
      const cobertura = noite.healing.coverage;

      return desperdicio >= 100 - cobertura
        ? {
            nome: "Cura desperdiçada",
            causa: `${numero(desperdicio)}% do que você lançou caiu em quem já estava cheio.`,
            acao: `Curar mais raramente é a resposta — o ganho aqui está em curar na hora, não em curar mais.`,
          }
        : {
            nome: "Cobertura",
            causa: `Você cobriu ${numero(cobertura)}% do dano que cabia a você.`,
            acao: `Olhe quais mecânicas machucam o raide em bloco: é onde a cobertura se ganha de uma vez.`,
          };
    }

    // Parse é SINTOMA, não causa (regra 2): ele é o resultado de atacar bem,
    // chegar preparado e ficar vivo. Apontar "melhore seu parse" é devolver a
    // pergunta pra pessoa. O coach pula pra dimensão que o produz.
    case "parse":
      return null;
  }
}

export function buildCoachRecommendation(
  noite: NoiteDoCoach,
  anterior: NoiteDoCoach | undefined,
  targets: CorePerformanceTargets,
  funcaoDoRoster?: FuncaoDoJogador
): RecomendacaoDoCoach {
  const score = calculateOverallScore(noite, targets, funcaoDoRoster);

  if (score.overall === null) {
    return { positivo: null, foco: null, semDados: true };
  }

  const positivo =
    (anterior
      ? acharAvanco(score, calculateOverallScore(anterior, targets, funcaoDoRoster))
      : null) ?? acharDestaque(score);

  // Da mais fraca pra mais forte, parando na primeira que tem nome próprio.
  // Uma dimensão sem detalhe coletado não vira conselho vago: vira silêncio,
  // e a próxima entra no lugar.
  const fracas = score.dimensions
    .filter((d): d is ScoreDimension & { score: number } => d.score !== null && d.score < FORTE)
    .sort((a, b) => a.score - b.score);

  for (const dimensao of fracas) {
    const causa = acharCausa(noite, dimensao);
    if (causa === null) continue;

    return {
      positivo,
      semDados: false,
      foco: {
        dimensao: dimensao.key,
        rotulo: dimensao.label,
        ganho: ganhoDe(noite, dimensao.key, targets, funcaoDoRoster, score.overall),
        ...causa,
      },
    };
  }

  return { positivo, foco: null, semDados: false };
}
