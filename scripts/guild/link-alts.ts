/**
 * Aplica no roster os vínculos escolhidos na tela do /admin.
 *
 * A tela não grava arquivo — o site é estático, não tem servidor pra gravar
 * nada. Ela baixa um `vinculos.json` de duas linhas, e este script aplica no
 * `roster.json` que está no disco AGORA.
 *
 * Aplicar a partir do arquivo do disco, e não do roster que a tela tinha, é o
 * ponto todo: a coleta roda sozinha de hora em hora e mexe em parse, io e
 * presença. Se a tela mandasse o roster inteiro de volta, o download de terça
 * desfaria a coleta de quarta sem ninguém perceber.
 *
 *   npm run roster:alts -- C:/Users/voce/Downloads/vinculos.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aplicarVinculos,
  mudancasDe,
  validarVinculos,
  type PersonagemParaVincular,
  type Vinculos,
} from "../../src/engine/admin/vinculos";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ROSTER = path.join(ROOT, "data/guild/roster.json");

async function main() {
  const arquivo = process.argv.slice(2).find((arg) => !arg.startsWith("-"));

  if (!arquivo) {
    console.error(
      "Falta o caminho do vinculos.json baixado na tela do /admin.\n" +
        "  npm run roster:alts -- ~/Downloads/vinculos.json"
    );
    process.exitCode = 1;
    return;
  }

  const vinculos = JSON.parse(await readFile(arquivo, "utf-8")) as Vinculos;
  const roster = JSON.parse(await readFile(ROSTER, "utf-8")) as PersonagemParaVincular[];

  const problemas = validarVinculos(roster, vinculos);
  if (problemas.length > 0) {
    console.error("A proposta tem problema, e nada foi gravado:\n");
    for (const problema of problemas) console.error(`  - ${problema.motivo}`);
    process.exitCode = 1;
    return;
  }

  const mudancas = mudancasDe(roster, vinculos);
  if (mudancas.length === 0) {
    console.log("Nada a mudar: o roster já está assim.");
    return;
  }

  await writeFile(ROSTER, `${JSON.stringify(aplicarVinculos(roster, vinculos), null, 2)}\n`);

  console.log(`data/guild/roster.json atualizado — ${mudancas.length} personagem(ns):\n`);
  for (const mudanca of mudancas) {
    const de = mudanca.de ?? "main";
    const para = mudanca.para ?? "main";
    console.log(`  ${mudanca.name}: ${de} -> ${para}`);
  }
  console.log("\nConfira com `git diff data/guild/roster.json` antes de commitar.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
