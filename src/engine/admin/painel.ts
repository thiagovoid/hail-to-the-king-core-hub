/**
 * O HTML do painel, montado como string.
 *
 * String e não componente Astro porque este conteúdo é CIFRADO antes de ir
 * pro HTML: ele precisa existir como texto no build pra virar blob. Componente
 * Astro renderiza no lugar onde está escrito, e aí sairia em claro.
 *
 * O preço é escrever HTML na mão. Em troca, nada do que está aqui aparece no
 * "ver código-fonte" de quem não tem a senha.
 */
import type { LinhaDoMacro } from "./visaoMacro";

/**
 * Escapa o que vai pro HTML.
 *
 * Nome de personagem vem do roster, que é nosso — mas o painel monta string
 * crua e é injetado com `innerHTML`. Escapar é o hábito que impede que um
 * apóstrofo em "Apocalïpse" ou um nome com `<` quebre a página calado.
 */
const esc = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

const corDaNota = (nota: number | null): string =>
  nota === null
    ? "text-slate-600"
    : nota >= 90
      ? "text-emerald-400"
      : nota >= 70
        ? "text-amber-400"
        : "text-red-400";

const ROTULO_DA_FUNCAO: Record<string, string> = {
  tank: "Tank",
  healer: "Healer",
  dps: "DPS",
};

/** As dimensões que aparecem como coluna, na ordem em que se lê. */
const COLUNAS = [
  { chave: "mechanics", rotulo: "Mec" },
  { chave: "deliver", rotulo: "Entr" },
  { chave: "defense", rotulo: "Def" },
  { chave: "healing", rotulo: "Cura" },
  { chave: "attack", rotulo: "Atac" },
];

function tabelaDoMacro(linhas: LinhaDoMacro[]): string {
  const cabecalho = COLUNAS.map(
    (c) => `<th class="px-2 py-3 text-right font-medium">${c.rotulo}</th>`
  ).join("");

  const corpo = linhas
    .map((l) => {
      const celulas = COLUNAS.map((coluna) => {
        const d = l.dimensoes.find((x) => x.chave === coluna.chave);
        if (!d || d.nota === null) return '<td class="px-2 py-3 text-right text-slate-700">—</td>';

        // A bolinha diz se CUMPRIU a meta; o número diz o quanto. São coisas
        // diferentes: 99 sem cumprir e 100 cumprindo ficam quase iguais sem ela.
        const marca =
          d.cumpriu === null
            ? ""
            : d.cumpriu
              ? '<span class="text-emerald-500/70">•</span> '
              : '<span class="text-red-500/70">•</span> ';

        return `<td class="px-2 py-3 text-right tabular-nums ${corDaNota(d.nota)}">${marca}${Math.round(d.nota)}</td>`;
      }).join("");

      const alts =
        l.alts.length > 0
          ? `<span class="block text-[10px] text-slate-600">+ ${l.alts.map(esc).join(", ")}</span>`
          : "";

      const faltando =
        l.faltando.length > 0
          ? `<span class="text-[10px] text-slate-500">${l.faltando.map(esc).join(", ")}</span>`
          : '<span class="text-[10px] text-emerald-500/70">cumpriu tudo</span>';

      return `<tr class="border-b border-slate-800/50 hover:bg-white/[0.02]">
  <td class="px-3 py-3">
    <a href="/core/membros/${esc(l.id)}/" class="text-white hover:text-[#f0a500]">${esc(l.nome)}</a>
    <a href="/retrospectiva/${esc(l.id)}/" class="ml-2 text-[10px] text-slate-500 hover:text-[#f0a500]" title="Retrospectiva da temporada, em formato de story">retrô</a>
    ${alts}
  </td>
  <td class="px-2 py-3 text-slate-500 text-xs">${ROTULO_DA_FUNCAO[l.funcao] ?? l.funcao}</td>
  <td class="px-2 py-3 text-right tabular-nums text-xl font-bold ${corDaNota(l.score)}">${l.score ?? "—"}</td>
  <td class="px-2 py-3 text-right tabular-nums text-slate-500">${l.scoreMedio ?? "—"}</td>
  ${celulas}
  <td class="px-2 py-3 text-right tabular-nums text-slate-400">${l.presenca}%</td>
  <td class="px-2 py-3 text-right tabular-nums text-slate-500">${l.noites}</td>
  <td class="px-3 py-3">${faltando}</td>
</tr>`;
    })
    .join("\n");

  return `<section class="mb-10">
  <div class="mb-4">
    <h2 class="text-xl font-bold text-white">Visão macro</h2>
    <p class="text-sm text-slate-400 mt-1 leading-relaxed">
      Uma linha por PESSOA, não por personagem — alt soma na mesma linha.
      Ordenado do pior Score pro melhor: esta tela existe pra achar quem precisa de conversa.
      A bolinha ao lado da nota diz se a meta daquela dimensão foi cumprida.
    </p>
  </div>

  <div class="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="border-b border-slate-800">
        <tr class="text-left text-slate-500 text-xs">
          <th class="px-3 py-3 font-medium">Jogador</th>
          <th class="px-2 py-3 font-medium">Função</th>
          <th class="px-2 py-3 font-medium text-right">Score</th>
          <th class="px-2 py-3 font-medium text-right">Média</th>
          ${cabecalho}
          <th class="px-2 py-3 font-medium text-right">Pres.</th>
          <th class="px-2 py-3 font-medium text-right">Noites</th>
          <th class="px-3 py-3 font-medium">Metas não cumpridas</th>
        </tr>
      </thead>
      <tbody>${corpo}</tbody>
    </table>
  </div>
</section>`;
}

export function montarPainel(dados: {
  linhas: LinhaDoMacro[];
  roster: Array<{ id: string; name: string }>;
}): string {
  return `<div class="space-y-2">
  <header class="mb-8">
    <h1 class="text-3xl font-bold text-white">Administração</h1>
    <p class="text-sm text-slate-400 mt-1">
      ${dados.linhas.length} pessoas com dado na temporada.
      Esta tela compara gente lado a lado, que é justamente o que as regras do core proíbem na
      página pública — por isso ela mora aqui.
    </p>
  </header>

  ${tabelaDoMacro(dados.linhas)}
</div>`;
}
