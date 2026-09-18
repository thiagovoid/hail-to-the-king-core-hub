/**
 * Conquistas do jogador ao longo da temporada.
 *
 * Cada conquista é apurada POR NOITE e acumulada: quem foi MVP quatro vezes
 * carrega a medalha com um 4. Conquista que ninguém tem ainda aparece
 * travada, com o texto de como se consegue — é o que a transforma em
 * objetivo em vez de placar.
 *
 * Metade delas é zoeira, e isso é de propósito: o ambiente leve é um valor
 * do core, e uma lista só de mérito viraria cobrança. As de zoeira riem de
 * um descuido que todo mundo comete — esquecer a poção, levar o mesmo tapa a
 * noite toda —, nunca de ter custado o wipe.
 *
 * Os cortes daqui (parse 95, Score 90, cinco peças sem encanto) não são
 * redondos por acaso: cada um foi medido contra as 114 noites-jogador da
 * temporada, procurando a faixa em que a conquista ainda é difícil mas
 * alguém alcança. As de mérito impossíveis hoje — Tríplice coroa, Zero a
 * zero — ficam impossíveis de propósito: é o que dá pra perseguir.
 */

import type { PerformanceRun, PlayerPerformance, WeeklyPerformance } from "../../types/performance";
import type { CorePerformanceTargets } from "../../types/index";
import { calculateOverallScore, funcaoEfetiva, type FuncaoDoJogador } from "../scores";

export type SimboloDeConquista =
  | "coroa"
  | "espada"
  | "calice"
  | "escudo"
  | "pluma"
  | "engrenagem"
  | "estrela"
  | "frasco"
  | "bota"
  | "alvo"
  | "relogio"
  | "caveira"
  | "folha"
  | "louros"
  | "montanha"
  | "elo"
  | "diamante"
  | "chama"
  | "mascaras"
  | "tijolos"
  | "gota"
  | "calendario"
  | "bandeira"
  | "teia"
  | "cofre"
  | "bigorna"
  | "moldura"
  | "maca"
  | "vela"
  | "coracao"
  | "ampulheta"
  | "tridente"
  | "bifurcacao"
  | "coringa"
  | "pomba"
  | "garfo"
  | "porta"
  | "raio"
  | "camera"
  | "fantasma"
  | "ciclo";

export interface DefinicaoDeConquista {
  id: string;
  nome: string;
  /** O que a pessoa precisa fazer. Aparece também na medalha travada. */
  como: string;
  simbolo: SimboloDeConquista;
  /** Zoeira muda a cor e vai pra outra prateleira na tela. */
  tipo: "boa" | "zoeira";
  /** Disputada = só quem lidera leva. Cumprida = todo mundo que atingir. */
  disputada: boolean;
}

export const CONQUISTAS: DefinicaoDeConquista[] = [
  // ----- mérito -----
  {
    id: "mvp",
    nome: "MVP da noite",
    como: "Ter o maior Score Geral entre quem jogou a noite.",
    simbolo: "coroa",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "triplice-coroa",
    nome: "Tríplice coroa",
    como: "Ser o MVP, ser o maior dano e fechar sem erro mecânico — tudo na mesma noite.",
    simbolo: "louros",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-dano",
    nome: "Maior dano",
    como: "Ser o maior dano por segundo da noite.",
    simbolo: "espada",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-cura",
    nome: "Maior cura",
    como: "Ser o healer que cobriu mais do dano que o raide tomou na noite.",
    simbolo: "calice",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "maior-defesa",
    nome: "Maior defesa",
    como: "Ter a melhor nota de Defender da noite.",
    simbolo: "escudo",
    tipo: "boa",
    disputada: true,
  },
  {
    id: "nota-maxima",
    nome: "Nota máxima",
    como: "Fechar uma noite com Score Geral 100.",
    simbolo: "estrela",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "lenda",
    nome: "Lenda",
    como: "Tirar parse 95 ou mais numa noite.",
    simbolo: "chama",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "superacao",
    nome: "Superação",
    como: "Bater o seu próprio recorde de Score Geral. A única que não compete com ninguém.",
    simbolo: "montanha",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "constante",
    nome: "Constante",
    como: "Três noites seguidas com Score Geral 90 ou mais.",
    simbolo: "elo",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "zero-a-zero",
    nome: "Zero a zero",
    como: "Uma noite inteira sem morrer nenhuma vez E sem errar nenhuma mecânica.",
    simbolo: "diamante",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "relojoeiro",
    nome: "Relojoeiro",
    como: "Manter um cooldown acima de 95% do tempo em recarga numa noite.",
    simbolo: "relogio",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "escoteiro",
    nome: "Escoteiro",
    como: "Chegar numa noite com 100% de preparação. Sempre alerta.",
    simbolo: "pluma",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "mecanicas-impecaveis",
    nome: "Mecânicas impecáveis",
    como: "Fechar a noite sem errar nenhuma mecânica.",
    simbolo: "engrenagem",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "noite-limpa",
    nome: "Noite limpa",
    como: "Atravessar uma noite inteira sem morrer nenhuma vez.",
    simbolo: "folha",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "polivalente",
    nome: "Polivalente",
    como: "Tank ou healer que ainda fez metade do dano do dps mediano da noite.",
    simbolo: "mascaras",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "muralha",
    nome: "Muralha",
    como: "Tank que fechou a noite com nota 50 ou mais em Defender.",
    simbolo: "tijolos",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "sem-sobra",
    nome: "Sem sobra",
    como: "Healer que terminou a noite com menos de 25% da cura caindo em quem já estava cheio.",
    simbolo: "gota",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "fundador",
    nome: "Fundador",
    como: "Estar presente na primeira vez que o core derrubou um boss.",
    simbolo: "bandeira",
    tipo: "boa",
    disputada: false,
  },
  {
    id: "inabalavel",
    nome: "Inabalável",
    como: "Estar presente em TODAS as noites da temporada.",
    simbolo: "calendario",
    tipo: "boa",
    disputada: false,
  },

  // ----- zoeira -----
  {
    id: "pocao-que-pocao",
    nome: "Poção? Que poção?",
    como: "Passar a noite inteira sem tomar uma poção sequer.",
    simbolo: "frasco",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "dieta",
    nome: "Dieta",
    como: "Chegar sem flask, sem comida e sem poção. Jejum de raide.",
    simbolo: "maca",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "descalco",
    nome: "Descalço",
    como: "Ir pro raide sem encanto na bota.",
    simbolo: "bota",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "museu-de-encantos",
    nome: "Museu de encantos",
    como: "Vir com cinco ou mais peças sem encanto. Acervo permanente.",
    simbolo: "moldura",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "colecionador",
    nome: "Colecionador",
    como: "Levar a MESMA mecânica na cara em pelo menos 70% das trys da noite.",
    simbolo: "alvo",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "pagando-promessa",
    nome: "Pagando promessa",
    como: "Errar a MESMA mecânica em cinco noites diferentes. Fé é isso.",
    simbolo: "vela",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "chao-e-lava",
    nome: "Chão é lava",
    como: "Ser quem mais morreu na noite. Acontece com todo mundo.",
    simbolo: "caveira",
    tipo: "zoeira",
    disputada: true,
  },
  {
    id: "tanque-nao-oficial",
    nome: "Tanque não oficial",
    como: "Ser o dps que mais tomou dano na noite. Ninguém pediu, mas você foi.",
    simbolo: "bigorna",
    tipo: "zoeira",
    disputada: true,
  },
  {
    id: "guardando-pro-inverno",
    nome: "Guardando pro inverno",
    como: "Atravessar a noite praticamente sem apertar defensivo nenhum.",
    simbolo: "cofre",
    tipo: "zoeira",
    disputada: false,
  },
  {
    id: "cooldown-de-estimacao",
    nome: "Cooldown de estimação",
    como: "Usar o resto do kit defensivo e deixar UMA habilidade parada a noite toda.",
    simbolo: "teia",
    tipo: "zoeira",
    disputada: false,
  },
];

/** Uma conquista levada, com o texto que explica aquela vez específica. */
export interface ConquistaGanha {
  vezes: number;
  /** Ex.: "Peçonha Sanguínea, em 11 de 12 trys". Só algumas preenchem. */
  detalhe?: string;
}

export type ConquistasPorJogador = Map<string, Map<string, ConquistaGanha>>;

/** O que a apuração precisa saber além dos números da noite. */
export interface ContextoDasConquistas {
  /** Função do jogador no roster — o log manda quando discorda. */
  funcaoDe?: (playerId: string) => FuncaoDoJogador | undefined;
  /** Nome do boss, pro detalhe de "Fundador" dizer qual caiu. */
  nomeDoBoss?: (encounterID: number) => string | undefined;
  /**
   * Personagem -> pessoa (ver `pessoas.ts`). É o que faz o que alguém fez de
   * alt contar pro main. Sem isso, cada personagem é uma pessoa.
   */
  pessoaDe?: (playerId: string) => string;
}

interface Vitoria {
  playerId: string;
  detalhe?: string;
}

/**
 * Consumível não é peça de equipamento.
 *
 * `preparationMissing` mistura os dois numa lista só, e "Museu de encantos"
 * conta acervo — poção esquecida já tem medalha própria.
 */
const CONSUMIVEIS = new Set(["Poção", "Flask/comida", "Pedra de vida"]);

const pecasSemEncanto = (player: PlayerPerformance): string[] =>
  (player.preparationMissing ?? []).filter((item) => !CONSUMIVEIS.has(item));

/** Nome curto da mecânica — é o rótulo em português quando a Wipefest deu um. */
const nomeDaMecanica = (detalhe: { mechanic: string; label?: string }): string =>
  detalhe.label ?? detalhe.mechanic.replace("Damage from ", "");

/**
 * A mecânica que mais bateu no jogador na noite, se pegou em 70% ou mais das
 * trys.
 *
 * É o que dá nome próprio à zoeira: "Colecionador — Peçonha Sanguínea, em 11
 * de 12 trys" conta uma história que "12 erros mecânicos" não conta.
 */
function mecanicaMaisRepetida(player: PlayerPerformance): { nome: string; tries: number } | null {
  const trysDaNoite = player.mechanics?.tries ?? 0;
  if (trysDaNoite === 0) return null;

  const pior = [...(player.mechanicsDetail ?? [])].sort((a, b) => b.tries - a.tries)[0];
  if (!pior || pior.tries / trysDaNoite < 0.7) return null;

  return { nome: nomeDaMecanica(pior), tries: pior.tries };
}

function vencedoresDaRun(
  run: PerformanceRun,
  targets: CorePerformanceTargets,
  funcaoDe?: (playerId: string) => FuncaoDoJogador | undefined
): Map<string, Vitoria[]> {
  const porConquista = new Map<string, Vitoria[]>();
  const simples = (ids: string[]): Vitoria[] => ids.map((playerId) => ({ playerId }));

  /**
   * Empate entrega a todos os empatados. Desempatar por ordem de array daria
   * a medalha a quem por acaso aparece primeiro no arquivo — e essa ordem
   * muda sozinha quando a coleta roda de novo.
   */
  const melhores = (valorDe: (p: PlayerPerformance) => number | null | undefined): string[] => {
    const comValor = run.players
      .map((player) => ({ id: player.playerId, valor: valorDe(player) }))
      .filter((item): item is { id: string; valor: number } => typeof item.valor === "number");

    if (comValor.length === 0) return [];

    const teto = Math.max(...comValor.map((item) => item.valor));
    return comValor.filter((item) => item.valor === teto).map((item) => item.id);
  };

  const cumpriram = (condicao: (p: PlayerPerformance) => boolean): string[] =>
    run.players.filter(condicao).map((player) => player.playerId);

  const score = (player: PlayerPerformance) =>
    calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall;

  /**
   * A função do log manda sobre a do roster: quem curou a noite inteira é
   * healer naquela noite, mesmo cadastrado como dps.
   */
  const funcao = (player: PlayerPerformance): FuncaoDoJogador =>
    funcaoEfetiva(player, funcaoDe?.(player.playerId));

  const comDetalhe = (
    condicao: (p: PlayerPerformance) => string | null
  ): Vitoria[] =>
    run.players
      .map((player): Vitoria | null => {
        const detalhe = condicao(player);
        return detalhe === null ? null : { playerId: player.playerId, detalhe };
      })
      .filter((item): item is Vitoria => item !== null);

  const campeoesDoScore = melhores(score);
  const campeoesDoDano = melhores((p) => p.dps);

  porConquista.set("mvp", simples(campeoesDoScore));
  porConquista.set("maior-dano", simples(campeoesDoDano));
  porConquista.set("maior-cura", simples(melhores((p) => p.healing?.coverage)));
  porConquista.set("maior-defesa", simples(melhores((p) => p.defense?.score)));
  porConquista.set("chao-e-lava", simples(melhores((p) => p.deaths)));

  // Os três de uma vez. Separadas cada uma já tem dono quase toda noite; é a
  // interseção que ninguém alcançou ainda.
  porConquista.set(
    "triplice-coroa",
    simples(
      campeoesDoScore.filter(
        (id) =>
          campeoesDoDano.includes(id) &&
          run.players.find((p) => p.playerId === id)?.mechanics?.errors === 0
      )
    )
  );

  porConquista.set("nota-maxima", simples(cumpriram((p) => score(p) === 100)));
  porConquista.set("noite-limpa", simples(cumpriram((p) => p.deaths === 0)));
  porConquista.set("escoteiro", simples(cumpriram((p) => p.preparation === 100)));
  porConquista.set(
    "mecanicas-impecaveis",
    simples(cumpriram((p) => p.mechanics !== undefined && p.mechanics.errors === 0))
  );
  porConquista.set(
    "zero-a-zero",
    simples(cumpriram((p) => p.deaths === 0 && p.mechanics?.errors === 0))
  );
  porConquista.set(
    "pocao-que-pocao",
    simples(cumpriram((p) => (p.preparationMissing ?? []).includes("Poção")))
  );
  porConquista.set(
    "descalco",
    simples(cumpriram((p) => (p.preparationMissing ?? []).includes("Botas")))
  );
  porConquista.set(
    "dieta",
    simples(
      cumpriram((p) => {
        const faltando = new Set(p.preparationMissing ?? []);
        return [...CONSUMIVEIS].every((item) => faltando.has(item));
      })
    )
  );
  porConquista.set(
    "relojoeiro",
    simples(cumpriram((p) => (p.attackDetail ?? []).some((item) => item.efficiency >= 95)))
  );

  porConquista.set(
    "lenda",
    comDetalhe((p) => (p.parse !== undefined && p.parse >= 95 ? `parse ${p.parse}` : null))
  );

  porConquista.set(
    "muralha",
    comDetalhe((p) =>
      funcao(p) === "tank" && (p.defense?.score ?? 0) >= 50
        ? `nota ${p.defense!.score} em Defender`
        : null
    )
  );

  porConquista.set(
    "sem-sobra",
    comDetalhe((p) =>
      p.healing !== undefined && p.healing.overheal < 25
        ? `${p.healing.overheal}% de desperdício`
        : null
    )
  );

  /**
   * Tank e healer não têm meta de dano — o que se mede aqui é sobra de
   * atenção, não obrigação. Meia mediana é o corte porque a mediana cheia
   * ninguém alcançou em oito noites: a comparação justa é com metade do
   * trabalho de quem faz disso o trabalho inteiro.
   */
  const danoDosDps = run.players
    .filter((p) => funcao(p) === "dps" && typeof p.dps === "number")
    .map((p) => p.dps!)
    .sort((a, b) => a - b);
  const meiaMediana =
    danoDosDps.length > 0 ? danoDosDps[Math.floor(danoDosDps.length / 2)] / 2 : Infinity;

  porConquista.set(
    "polivalente",
    comDetalhe((p) =>
      funcao(p) !== "dps" && (p.offRole?.dps ?? 0) >= meiaMediana
        ? `${Math.round(p.offRole!.dps! / 1000)}k de dano fora da função`
        : null
    )
  );

  /**
   * Nenhum dps jamais tomou mais dano que o tank mais leve da noite — a
   * primeira versão disso comparava com os tanks e nunca disparava. O que
   * sobra, e é o que tem graça, é quem lidera entre os dps.
   */
  const maiorDtpsEntreDps = Math.max(
    ...run.players.filter((p) => funcao(p) === "dps").map((p) => p.defense?.dtps ?? 0),
    0
  );

  porConquista.set(
    "tanque-nao-oficial",
    comDetalhe((p) =>
      funcao(p) === "dps" && maiorDtpsEntreDps > 0 && p.defense?.dtps === maiorDtpsEntreDps
        ? `${Math.round(maiorDtpsEntreDps / 1000)}k de dano tomado por segundo`
        : null
    )
  );

  porConquista.set(
    "guardando-pro-inverno",
    comDetalhe((p) =>
      p.defense?.score != null && p.defense.score < 8
        ? `kit defensivo em ${p.defense.score}% da noite`
        : null
    )
  );

  /**
   * Diferente de "Guardando pro inverno": aqui a pessoa usa o kit (nota 25+)
   * e ainda assim tem UMA habilidade encostada. É o esquecimento pontual, não
   * o estilo de jogo.
   */
  porConquista.set(
    "cooldown-de-estimacao",
    comDetalhe((p) => {
      if ((p.defense?.score ?? 0) < 25) return null;
      const parado = [...(p.defenseDetail ?? [])].sort((a, b) => a.efficiency - b.efficiency)[0];
      return parado && parado.efficiency < 5
        ? `${parado.name}, ${parado.efficiency}% da noite`
        : null;
    })
  );

  porConquista.set(
    "museu-de-encantos",
    comDetalhe((p) => {
      const pecas = pecasSemEncanto(p);
      return pecas.length >= 5 ? `${pecas.length} peças: ${pecas.join(", ")}` : null;
    })
  );

  porConquista.set(
    "colecionador",
    comDetalhe((p) => {
      const pior = mecanicaMaisRepetida(p);
      return pior === null ? null : `${pior.nome}, em ${pior.tries} de ${p.mechanics!.tries} trys`;
    })
  );

  return porConquista;
}

/** Uma conquista de temporada já vem contada — a apuração é o histórico inteiro. */
interface VitoriaDaTemporada extends Vitoria {
  vezes: number;
}

/**
 * As conquistas que só existem olhando várias noites: recorde pessoal,
 * sequência, presença, primeira kill, a mecânica que não larga do pé.
 *
 * Todas elas medem a PESSOA, não o personagem — são justamente as que
 * puniriam quem trocou de cadeira pra compor o raide. Quem foi de alt numa
 * noite continua com a temporada inteira. Ver `pessoas.ts`.
 *
 * Nenhuma dá pra apurar noite a noite, porque todas dependem do que veio
 * antes — é o que as torna as mais difíceis da lista.
 */
function vencedoresDaTemporada(
  runs: PerformanceRun[],
  targets: CorePerformanceTargets,
  contexto: ContextoDasConquistas
): Map<string, VitoriaDaTemporada[]> {
  const { funcaoDe, nomeDoBoss, pessoaDe } = contexto;
  const porConquista = new Map<string, VitoriaDaTemporada[]>();
  const pessoa = (playerId: string) => pessoaDe?.(playerId) ?? playerId;
  const score = (player: PlayerPerformance) =>
    calculateOverallScore(player, targets, funcaoDe?.(player.playerId)).overall;

  // --- Superação: quantas vezes bateu o próprio teto ---
  const recorde = new Map<string, number>();
  const superacoes = new Map<string, number>();

  // --- Constante: sequências de três noites acima de 90 ---
  const sequencia = new Map<string, number>();
  const maiorSequencia = new Map<string, number>();
  const constancias = new Map<string, number>();

  // --- Fundador: quem estava na primeira queda de cada boss ---
  const jaDerrubados = new Set<number>();
  const fundacoes = new Map<string, string[]>();

  // --- Inabalável: presença em todas as noites ---
  const noitesJogadas = new Map<string, number>();

  // --- Pagando promessa: a mesma mecânica, noite após noite ---
  const mecanicasPorJogador = new Map<string, Map<string, number>>();

  for (const run of runs) {
    const estreias = new Set<number>();
    for (const player of run.players) {
      for (const kill of player.bossKills ?? []) {
        if (!jaDerrubados.has(kill.encounterID)) estreias.add(kill.encounterID);
      }
    }

    /**
     * A noite vista por pessoa, não por personagem.
     *
     * Quase sempre é um personagem por pessoa. A exceção é quem trocou no
     * meio da noite — em 15/09 a mesma pessoa aparece como Voidsurge e como
     * Voidwar —, e aí a noite vale uma só, com o melhor dos dois.
     */
    const daNoite = new Map<string, PlayerPerformance[]>();
    for (const player of run.players) {
      const id = pessoa(player.playerId);
      daNoite.set(id, [...(daNoite.get(id) ?? []), player]);
    }

    for (const [id, personagens] of daNoite) {
      noitesJogadas.set(id, (noitesJogadas.get(id) ?? 0) + 1);

      // Noite sem dimensão nenhuma coletada não tem nota — e nota que não
      // existe não é nota ruim. Passa reto por recorde e por sequência, do
      // mesmo jeito que uma ausência passa.
      const notas = personagens
        .map(score)
        .filter((valor): valor is number => valor !== null);
      const nota = notas.length > 0 ? Math.max(...notas) : null;

      if (nota !== null) {
        const teto = recorde.get(id);
        if (teto !== undefined && nota > teto) superacoes.set(id, (superacoes.get(id) ?? 0) + 1);
        if (teto === undefined || nota > teto) recorde.set(id, nota);

        // Sequência quebra com nota baixa, não com falta: quem não jogou não
        // errou nada. Punir ausência aqui seria cobrar presença duas vezes —
        // "Inabalável" já é a medalha de presença.
        const seguidas = nota >= 90 ? (sequencia.get(id) ?? 0) + 1 : 0;
        maiorSequencia.set(id, Math.max(maiorSequencia.get(id) ?? 0, seguidas));
        if (seguidas >= 3) {
          constancias.set(id, (constancias.get(id) ?? 0) + 1);
          sequencia.set(id, 0);
        } else {
          sequencia.set(id, seguidas);
        }
      }

      for (const kill of personagens.flatMap((p) => p.bossKills ?? [])) {
        if (!estreias.has(kill.encounterID)) continue;
        const lista = fundacoes.get(id) ?? [];
        const nome = nomeDoBoss?.(kill.encounterID) ?? `boss ${kill.encounterID}`;
        if (!lista.includes(nome)) lista.push(nome);
        fundacoes.set(id, lista);
      }

      // Uma noite conta UMA vez por mecânica, mesmo que a pessoa tenha
      // levado o mesmo tapa com dois personagens diferentes.
      const doJogador = mecanicasPorJogador.get(id) ?? new Map<string, number>();
      const daNoiteDele = new Set(
        personagens.flatMap((p) => (p.mechanicsDetail ?? []).map(nomeDaMecanica))
      );
      for (const nome of daNoiteDele) doJogador.set(nome, (doJogador.get(nome) ?? 0) + 1);
      mecanicasPorJogador.set(id, doJogador);
    }

    for (const encounterID of estreias) jaDerrubados.add(encounterID);
  }

  porConquista.set(
    "superacao",
    [...superacoes].map(([playerId, vezes]) => ({
      playerId,
      vezes,
      detalhe: `seu recorde: Score ${recorde.get(playerId)}`,
    }))
  );

  porConquista.set(
    "constante",
    [...constancias].map(([playerId, vezes]) => ({
      playerId,
      vezes,
      detalhe: `melhor sequência: ${maiorSequencia.get(playerId)} noites`,
    }))
  );

  porConquista.set(
    "fundador",
    [...fundacoes].map(([playerId, bosses]) => ({
      playerId,
      vezes: bosses.length,
      detalhe: bosses.length <= 3 ? bosses.join(", ") : `${bosses.length} bosses, do primeiro dia`,
    }))
  );

  porConquista.set(
    "inabalavel",
    [...noitesJogadas]
      .filter(([, noites]) => noites === runs.length)
      .map(([playerId]) => ({
        playerId,
        vezes: 1,
        detalhe: `${runs.length} de ${runs.length} noites`,
      }))
  );

  const promessas: VitoriaDaTemporada[] = [];
  for (const [playerId, mecanicas] of mecanicasPorJogador) {
    const devotas = [...mecanicas].filter(([, noites]) => noites >= 5).sort((a, b) => b[1] - a[1]);
    if (devotas.length === 0) continue;
    promessas.push({
      playerId,
      vezes: devotas.length,
      detalhe: `"${devotas[0][0]}", em ${devotas[0][1]} noites`,
    });
  }
  porConquista.set("pagando-promessa", promessas);

  return porConquista;
}

/**
 * Quantas vezes cada PESSOA levou cada conquista na temporada.
 *
 * Recontado do histórico inteiro a cada build, e não incrementado: assim uma
 * recoleta que corrige uma noite antiga corrige o placar junto, em vez de
 * deixar um número que ninguém sabe de onde veio.
 *
 * A chave do resultado é a pessoa (o `id` do main), não o personagem: o que
 * alguém fez de alt aparece na ficha do main. Sem `pessoaDe`, cada
 * personagem é uma pessoa e nada muda.
 */
export function contarConquistas(
  weeks: WeeklyPerformance[],
  targets: CorePerformanceTargets,
  contexto: ContextoDasConquistas = {}
): ConquistasPorJogador {
  const total: ConquistasPorJogador = new Map();
  const pessoa = (playerId: string) => contexto.pessoaDe?.(playerId) ?? playerId;

  const registrar = (playerId: string, conquistaId: string, vezes: number, detalhe?: string) => {
    const doJogador = total.get(playerId) ?? new Map<string, ConquistaGanha>();
    const anterior = doJogador.get(conquistaId);

    doJogador.set(conquistaId, {
      vezes: (anterior?.vezes ?? 0) + vezes,
      // A mais recente manda: numa retrospectiva o que importa é a
      // mecânica que ainda está pegando, não a do primeiro mês.
      detalhe: detalhe ?? anterior?.detalhe,
    });

    total.set(playerId, doJogador);
  };

  // As de temporada dependem da ordem das noites, e o arquivo semanal não
  // garante ordem entre semanas — daí ordenar por data antes de percorrer.
  const runs = [...weeks]
    .sort((a, b) => a.week - b.week)
    .flatMap((week) => week.runs)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const run of runs) {
    for (const [conquistaId, vitorias] of vencedoresDaRun(run, targets, contexto.funcaoDe)) {
      // Quem jogou com dois personagens na mesma noite leva a medalha uma
      // vez só: ela é da pessoa, e a noite foi uma.
      const jaContados = new Set<string>();

      for (const vitoria of vitorias) {
        const dono = pessoa(vitoria.playerId);
        if (jaContados.has(dono)) continue;
        jaContados.add(dono);
        registrar(dono, conquistaId, 1, vitoria.detalhe);
      }
    }
  }

  for (const [conquistaId, vitorias] of vencedoresDaTemporada(runs, targets, contexto)) {
    for (const vitoria of vitorias) {
      registrar(vitoria.playerId, conquistaId, vitoria.vezes, vitoria.detalhe);
    }
  }

  return total;
}
