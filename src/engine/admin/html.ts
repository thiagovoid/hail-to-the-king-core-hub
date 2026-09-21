/**
 * O escape compartilhado pelos painéis do /admin.
 *
 * Os painéis montam HTML como string (precisa existir como texto pra ser
 * cifrado) e entram no DOM por `innerHTML`. Nome de personagem vem do roster,
 * que é nosso — mas escapar é o hábito que impede que um apóstrofo em
 * "Apocalïpse" ou um nome com `<` quebre a página calado.
 */
export const esc = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
