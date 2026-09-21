/**
 * A tela de vínculo de alts.
 *
 * Quem é alt de quem é o único dado do roster que nenhuma coleta descobre:
 * a WCL vê dois personagens e não vê que atrás dos dois tem a mesma pessoa.
 * Até aqui isso era abrir o JSON e editar na unha, contando as vírgulas.
 *
 * A tela não grava nada — site estático não tem onde gravar. Ela baixa um
 * `vinculos.json` de duas linhas que o `npm run roster:alts` aplica no
 * roster do disco. Os nomes vão dentro do blob cifrado, como o resto.
 *
 * O HTML sai daqui; o comportamento mora no script do admin.astro, porque
 * script injetado por `innerHTML` não executa. O roster que esse script usa
 * é remontado dos próprios `<select>` — nome, tipo e o vínculo de origem
 * (a opção `selected`, que o DOM guarda mesmo depois de escolherem outra).
 * Repetir o roster num `data-` seria uma segunda cópia pra desencontrar.
 */
import { esc } from "./html";
import type { PersonagemParaVincular } from "./vinculos";

/** Só o que a tela precisa — o resto do roster não tem por que ir junto. */
interface PersonagemDaTela {
  id: string;
  name: string;
  type: string;
  pertenceA: string | null;
}

/**
 * Só o nome embaixo de cada linha, sem spec nem classe.
 *
 * Não por falta de espaço: o `spec` do roster está metade em português
 * ("Proteção") e metade em inglês ("Protection"), e a linha saía "Protection
 * paladin". Maquiar isso aqui esconderia o defeito do dado num painel só. E
 * pra decidir de quem um personagem é alt, o que se lê é o nome mesmo.
 */
export function montarPainelDeAlts(roster: PersonagemParaVincular[]): string {
  const personagens: PersonagemDaTela[] = [...roster]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      pertenceA: p.pertenceA ?? null,
    }));

  const linhas = personagens
    .map((p) => {
      const opcoes = [
        `<option value="">É main</option>`,
        ...personagens
          .filter((outro) => outro.id !== p.id)
          .map(
            (outro) =>
              `<option value="${esc(outro.id)}"${outro.id === p.pertenceA ? " selected" : ""}>${esc(outro.name)}</option>`
          ),
      ].join("");

      return `<tr class="border-t border-slate-800/60">
        <td class="px-3 py-2">
          <span class="text-slate-200">${esc(p.name)}</span>
        </td>
        <td class="px-3 py-2">
          <select data-vinculo="${esc(p.id)}" data-nome="${esc(p.name)}" data-tipo="${esc(p.type)}" class="w-full max-w-[14rem] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-[#f0a500]">${opcoes}</select>
        </td>
        <td class="px-3 py-2 text-xs text-slate-500" data-vinculo-estado="${esc(p.id)}"></td>
      </tr>`;
    })
    .join("");

  return `<section class="mt-12">
  <div class="mb-4">
    <h2 class="text-lg font-bold text-white">Vínculo de alts</h2>
    <p class="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
      Quem é alt de quem não vem de coleta nenhuma: a WCL vê dois personagens, não vê que atrás
      dos dois tem a mesma pessoa. É aqui que se diz. O vínculo faz presença, sequência e medalha
      subirem pro main — trocar de personagem pelo grupo deixa de sair mais caro que faltar.
    </p>
  </div>

  <div data-alts class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 text-xs">
            <th class="px-3 py-2 font-medium">Personagem</th>
            <th class="px-3 py-2 font-medium">É alt de</th>
            <th class="px-3 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>

    <div class="mt-4 hidden rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2" data-alts-problemas>
      <p class="text-xs font-semibold text-red-400">Não dá pra gravar assim:</p>
      <ul class="mt-1 space-y-1 text-xs text-red-300/90" data-alts-lista-problemas></ul>
    </div>

    <div class="mt-4 rounded-lg border border-slate-800 bg-black/20 px-3 py-2">
      <p class="text-xs font-semibold text-slate-400">O que vai mudar</p>
      <ul class="mt-1 space-y-1 text-xs text-slate-300" data-alts-mudancas>
        <li class="text-slate-600">Nada ainda.</li>
      </ul>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        data-alts-baixar
        disabled
        class="rounded-lg bg-[#f0a500] px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >Baixar vinculos.json</button>
      <button
        type="button"
        data-alts-desfazer
        class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-slate-500 transition"
      >Voltar ao que está gravado</button>
    </div>

    <p class="mt-3 text-xs text-slate-500 leading-relaxed">
      O arquivo baixado não é o roster: são só os vínculos. Quem grava é o comando abaixo, que lê o
      <code class="text-slate-400">roster.json</code> do disco na hora — assim a coleta que rodou no
      meio do caminho não é desfeita.
    </p>
    <code class="mt-2 block rounded bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-300">npm run roster:alts -- caminho/do/vinculos.json</code>
  </div>
</section>`;
}
