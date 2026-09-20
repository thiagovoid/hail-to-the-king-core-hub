/**
 * Funções utilitárias de formatação de valores para exibição na interface.
 */

/**
 * Formata um valor genérico para exibição.
 * Retorna "—" para null, undefined, string vazia ou NaN.
 * Caso contrário, retorna String(v), desde que o resultado não seja
 * uma string vazia (ex: String([]) === "") ou os literais reservados
 * "null", "undefined", "NaN".
 */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") {
    return "—";
  }
  // NaN (typeof number e NaN !== NaN)
  if (typeof v === "number" && isNaN(v)) {
    return "—";
  }
  let str: string;
  try {
    str = String(v);
  } catch {
    // Objects with non-callable toString/valueOf (e.g., {toString: 0}) throw
    return "—";
  }
  if (str === "" || str === "null" || str === "undefined" || str === "NaN") {
    return "—";
  }
  return str;
}

/**
 * Converte uma data ISO 8601 para o formato DD/MM/YYYY.
 * Retorna "—" para null ou data inválida.
 */
export function formatDate(iso: string | null): string {
  if (iso === null || iso === undefined) {
    return "—";
  }

  // Parse manual para evitar problemas de timezone com new Date(string)
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return "—";
  }

  const [, year, month, day] = match;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);

  if (
    isNaN(y) || isNaN(m) || isNaN(d) ||
    m < 1 || m > 12 ||
    d < 1 || d > 31
  ) {
    return "—";
  }

  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Formata um número grande em milhares com casas decimais fixas,
 * ex: 100340 → "100.34k" (2 casas). Abaixo de 1000 devolve o número inteiro.
 */
/**
 * Decimal como se escreve em português: vírgula, uma casa, e sem casa
 * nenhuma quando o número é inteiro ("2" e não "2,0").
 */
export function formatDecimalBr(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace(".", ",");
}

/**
 * O número como a tela mostra: "400.43k" a partir de mil, o valor exato
 * abaixo disso.
 *
 * Existia em três lugares com casas decimais diferentes — o gráfico e a
 * tabela usavam uma casa ("120.3k"), o painel do core usava duas. Aqui vira
 * um só.
 *
 * O corte em mil não é enfeite: abaixo dele ficam grandezas que NÃO podem
 * ser arredondadas, como "1,4 erros por try". Delegar tudo pro
 * formatThousands transformaria esse 1,4 em "1".
 */
export function formatCompact(value: number): string {
  return Math.abs(value) >= 1000 ? formatThousands(value) : String(value);
}

export function formatThousands(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) < 1000) {
    return String(Math.round(value));
  }
  return `${(value / 1000).toFixed(decimals)}k`;
}

/**
 * Formata um número como percentual, ex: 73 → "73%".
 * Retorna "—" para null.
 */
export function formatPercent(n: number | null): string {
  if (n === null || n === undefined) {
    return "—";
  }
  return `${n}%`;
}

/**
 * Segundos viram "4min 12s" — ou "42s" quando não chega a um minuto.
 *
 * Existe porque porcentagem sozinha não se entende: "21,5% do tempo de luta"
 * não diz nada até virar "o raide lutou 12 minutos sem você". A régua do
 * jogador é o relógio, não o denominador.
 */
export function formatDuracao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  if (total < 60) return `${total}s`;

  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0 ? `${minutos}min` : `${minutos}min ${resto}s`;
}
