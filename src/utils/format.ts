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
 * Formata um número como percentual, ex: 73 → "73%".
 * Retorna "—" para null.
 */
export function formatPercent(n: number | null): string {
  if (n === null || n === undefined) {
    return "—";
  }
  return `${n}%`;
}
