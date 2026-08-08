/**
 * Funções utilitárias de progressão de raid.
 */

import type { Boss } from "@/types/index";

/**
 * Calcula a progressão com base na lista de bosses.
 * Retorna killed, total e percent (arredondado).
 * Retorna { killed: 0, total: 0, percent: 0 } para array vazio.
 */
export function computeProgression(
  bosses: Boss[]
): { killed: number; total: number; percent: number } {
  if (bosses.length === 0) {
    return { killed: 0, total: 0, percent: 0 };
  }

  const total = bosses.length;
  const killed = bosses.filter((b) => b.status === "killed").length;
  const percent = Math.round((killed / total) * 100);

  return { killed, total, percent };
}

/**
 * Retorna null para null, undefined ou string vazia; retorna a URL original caso contrário.
 */
export function safeUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url === "") {
    return null;
  }
  return url;
}
