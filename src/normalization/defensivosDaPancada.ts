/**
 * A lista de "defensivos na mão", consertada em dois pontos.
 *
 * A linha da pancada diz "levou 954k, 100% da sua vida, com X na mão". Ela
 * nasceu pra dar laudo a Defender, que media só que o botão foi apertado e
 * nunca se havia o que mitigar. Só que ela tinha dois defeitos próprios.
 *
 * **1. Citava cura como se fosse mitigação.** O Healing Stream Totem está
 * catalogado como `defensive` — e para Defender ele conta mesmo, apertar é
 * execução. Mas ele é um totem de cura por tempo com 30s de recarga: não
 * teria amortecido nada de um golpe do tamanho da vida inteira, e com 30s
 * ele está pronto quase sempre. Aparecia em 13 das 21 pancadas do jrxamã.
 * A linha é uma acusação; acusação com ruído não se lê.
 *
 * **2. Só enxergava magia que a pessoa apertou NAQUELA noite.** A lista era
 * montada dos casts do relatório, então quem nunca apertou o Astral Shift a
 * noite toda aparecia como "nada na mão", que se lê como inocência. Quem usa
 * os defensivos era mais acusado que quem não usa — o incentivo invertido.
 *
 * O conserto do 2 é barato e não precisa de coleta: magia do kit da pessoa
 * que ela NÃO apertou na noite esteve pronta o tempo inteiro, por definição.
 * O kit sai do que ela já apertou em qualquer noite da temporada.
 */
import type { WeeklyPerformance } from "../types/performance";

/**
 * O que não amortece a pancada, e por isso sai da linha.
 *
 * O critério é estreito de propósito: **muda o tamanho do golpe?** Redução,
 * absorção e imunidade mudam. Cura não muda o golpe, muda o que vem depois —
 * é resposta legítima, mas é outra frase, e misturar as duas foi o que
 * transformou a linha em ruído.
 *
 * Continua fora de Defender esta lista: lá apertar cura no cooldown é
 * execução e conta. Isto vale só pra linha da pancada.
 *
 * Na dúvida, a magia FICA na linha. Trinket de tier e habilidade nova
 * continuam aparecendo até alguém dizer o contrário — esconder mitigação de
 * verdade seria pior que o ruído que se está tirando.
 */
export const NAO_AMORTECE = new Set([
  // Cura pura: não diminui o golpe, socorre depois dele.
  "Ascendance", // a de Restauração; a de dano não é defensiva
  "Crimson Vial",
  "Death Pact",
  "Desperate Prayer",
  "Divine Hymn",
  "Exhilaration",
  "Healing Stream Totem",
  "Holy Word: Serenity",
  "Lay on Hands",
  "Mortal Coil",
  // Nem cura nem mitigação: mobilidade e quebra de controle.
  "Berserker Rage",
  "Death Charge",
  "Death's Advance",
]);

/**
 * O que protege OUTRA pessoa, e por isso não conta no golpe que você levou.
 *
 * Apareceu quando o kit da temporada entrou: a Blessing of Sacrifice saltou
 * pra 25% das pancadas. Ela transfere o dano PARA o paladino — ter ela pronta
 * não teria salvado ele, teria salvado outro. Acusar alguém de não ter usado
 * em si mesmo um botão que não funciona em si mesmo é pior que não acusar.
 *
 * Continuam contando em Defender: usá-las no cooldown é execução, e é o
 * grupo que ganha.
 */
export const PROTEGE_OUTRA_PESSOA = new Set([
  "Blessing of Sacrifice",
  "Guardian Spirit",
  "Pain Suppression",
]);

/** O que cada pessoa já apertou em qualquer noite da temporada. */
export function kitDaTemporada(semanas: WeeklyPerformance[]): Map<string, Set<string>> {
  const kit = new Map<string, Set<string>>();

  for (const semana of semanas) {
    for (const noite of semana.runs) {
      for (const jogador of noite.players ?? []) {
        for (const defensivo of jogador.defenseDetail ?? []) {
          const dela = kit.get(jogador.playerId) ?? new Set<string>();
          dela.add(defensivo.name);
          kit.set(jogador.playerId, dela);
        }
      }
    }
  }

  return kit;
}

/**
 * A lista final: o que estava pronto naquele instante, sem o que não amortece.
 *
 * `prontosNoInstante` é o que a coleta apurou cruzando o timestamp do golpe
 * com os casts da noite. `ociososNaNoite` é o que a pessoa tem no kit e não
 * apertou nenhuma vez — esteve pronto do começo ao fim, inclusive ali.
 */
function juntar(prontosNoInstante: string[], ociososNaNoite: Set<string>): string[] {
  const todos = new Set([...prontosNoInstante, ...ociososNaNoite]);
  return [...todos]
    .filter((nome) => !NAO_AMORTECE.has(nome) && !PROTEGE_OUTRA_PESSOA.has(nome))
    .sort();
}

/**
 * A semana com a lista de defensivos corrigida nas pancadas e nas mortes.
 *
 * Deriva do que já está arquivado: vale pras noites antigas sem recoletar.
 */
export function comDefensivosCompletos(
  semana: WeeklyPerformance,
  kit: Map<string, Set<string>>
): WeeklyPerformance {
  return {
    ...semana,
    runs: semana.runs.map((noite) => ({
      ...noite,
      players: (noite.players ?? []).map((jogador) => {
        const doJogador = kit.get(jogador.playerId);
        if (!doJogador) return jogador;

        const usadosNaNoite = new Set((jogador.defenseDetail ?? []).map((d) => d.name));
        const ociosos = new Set([...doJogador].filter((nome) => !usadosNaNoite.has(nome)));

        return {
          ...jogador,
          ...(jogador.pancadas && {
            pancadas: jogador.pancadas.map((pancada) => ({
              ...pancada,
              defensivosProntos: juntar(pancada.defensivosProntos, ociosos),
            })),
          }),
          ...(jogador.deathDetail && {
            deathDetail: jogador.deathDetail.map((morte) =>
              "defensivosProntos" in morte
                ? {
                    ...morte,
                    defensivosProntos: juntar(
                      (morte as { defensivosProntos: string[] }).defensivosProntos,
                      ociosos
                    ),
                  }
                : morte
            ),
          }),
        };
      }),
    })),
  };
}
