/**
 * Quando é a próxima noite de raide.
 *
 * A data vinha escrita na mão em `config.nextRaid.date` e ninguém a
 * atualizava: o cabeçalho anunciou "Próxima Raid: 01/09/2026" até meados de
 * outubro. Data futura escrita à mão só continua certa enquanto alguém se
 * lembra dela, e ninguém se lembra.
 *
 * O core raida **terça e quinta**. Isso é regra, e regra o código sabe
 * calcular. Quarta acontece, mas é exceção — e exceção se declara: uma data
 * futura em `config.nextRaid.date` vence o cálculo.
 *
 * Calcular no build é suficiente porque o site reconstrói todo dia, pelo
 * cron da coleta. A conta corre no fuso de Brasília: o build roda em UTC, e
 * depois das 21h de lá já é o dia seguinte aqui — era assim que as datas de
 * kill saíam um dia à frente.
 */

const FUSO_DO_CORE = "America/Sao_Paulo";

/** Domingo = 0. Terça e quinta. */
const DIAS_DE_RAIDE = new Set([2, 4]);

/** "2026-10-15" no fuso do core, independente de onde o build roda. */
export function hojeNoCore(agora: Date): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO_DO_CORE });
}

/**
 * A próxima noite, em YYYY-MM-DD.
 *
 * Dia de raide devolve ele mesmo: a raide começa 21:30, então durante quase
 * toda a terça a resposta certa pra "quando é a próxima?" é "hoje".
 *
 * `excecao` é a data escrita à mão. Vale quando aponta pra hoje ou pro
 * futuro; data passada é lembrança de uma raide que já aconteceu e é
 * ignorada, que é o que resolve o campo esquecido.
 */
export function proximaNoiteDeRaide(agora: Date, excecao?: string | null): string {
  const hoje = hojeNoCore(agora);

  if (excecao && /^\d{4}-\d{2}-\d{2}$/.test(excecao) && excecao >= hoje) {
    return excecao;
  }

  // Aritmética em UTC ao meio-dia: só interessam dia-da-semana e soma de
  // dias, e o meio-dia fica longe de qualquer virada de horário de verão.
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia, 12);

  for (let adiante = 0; adiante < 7; adiante += 1) {
    const candidato = new Date(base + adiante * 24 * 60 * 60 * 1000);
    if (DIAS_DE_RAIDE.has(candidato.getUTCDay())) {
      return candidato.toISOString().slice(0, 10);
    }
  }

  // Inalcançável: sete dias sempre contêm uma terça e uma quinta.
  return hoje;
}

const DIAS_POR_EXTENSO = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** "terça" a partir de "2026-10-20". Nomeia o dia pra data se explicar. */
export function diaDaSemanaPorExtenso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return DIAS_POR_EXTENSO[new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()];
}
