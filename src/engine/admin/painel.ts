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

/**
 * O "i" que abre a fórmula da coluna.
 *
 * Feito na mão e não com o InfoTooltip.astro porque este painel é HTML em
 * string — precisa existir como texto pra ser cifrado. As classes são as
 * mesmas do componente, e o Tailwind as encontra porque varre `.ts`.
 *
 * Abre pra BAIXO, ao contrário do componente. O container da tabela tem
 * `overflow-x-auto` pras 12 colunas rolarem, e basta um eixo deixar de ser
 * `visible` pro outro virar `auto`: abrindo pra cima, o tooltip saía do
 * container e era cortado. Pra baixo ele cai sobre as linhas, que estão
 * dentro da área rolável.
 */
function dica(titulo: string, linhas: string[], alinhamento: "esquerda" | "direita" = "esquerda") {
  return `<span class="relative group inline-flex align-middle ml-1">
  <button type="button" class="w-3.5 h-3.5 rounded-full border border-slate-700 text-slate-500 text-[9px] leading-none flex items-center justify-center hover:border-[#f0a500] hover:text-[#f0a500] transition-colors" aria-label="Como ${esc(titulo)} é calculado">i</button>
  <span role="tooltip" class="pointer-events-none absolute z-30 top-full mt-2 ${alinhamento === "direita" ? "right-0" : "left-0"} w-72 rounded-lg border border-white/10 bg-[#141b2d] p-3 text-left opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity shadow-xl normal-case font-normal">
    <span class="block text-slate-200 text-[11px] font-semibold">${esc(titulo)}</span>
    ${linhas.map((l) => `<span class="block text-[11px] text-slate-400 leading-relaxed mt-1.5">${l}</span>`).join("")}
  </span>
</span>`;
}

/** Monospace pra fórmula: ela se lê como código, não como frase. */
const formula = (texto: string) =>
  `<span class="block font-mono text-[10px] text-slate-300 bg-black/30 rounded px-2 py-1 mt-1.5">${esc(texto)}</span>`;

/** A meta vigente, em uma linha. */
const meta = (texto: string) =>
  `<span class="block text-[10px] text-slate-500 mt-1.5">Meta: <span class="text-slate-300">${esc(texto)}</span></span>`;

/** "1.4" é como o JSON guarda; "1,4" é como se lê em português. */
const numero = (valor: number) => String(valor).replace(".", ",");

/**
 * A meta, com as três funções quando ela varia.
 *
 * `sufixo` entra em CADA número e não só no último: "dps 75 · tank 57%" faz
 * parecer que só o do tank é percentual.
 */
const metaPorFuncao = (
  alvo: { target: number; porFuncao?: Record<string, number> },
  sufixo = ""
) => {
  const escrever = (v: number) => `${numero(v)}${sufixo}`;
  if (!alvo.porFuncao) return escrever(alvo.target);

  return `dps ${escrever(alvo.porFuncao.dps ?? alvo.target)} · healer ${escrever(
    alvo.porFuncao.healer ?? alvo.target
  )} · tank ${escrever(alvo.porFuncao.tank ?? alvo.target)}`;
};

/** A frase que diz o que o valor variável É, antes da fórmula. */
const oQueE = (texto: string) =>
  `<span class="block text-[11px] text-slate-400 leading-relaxed">${texto}</span>`;

/**
 * As dimensões que aparecem como coluna, na ordem em que se lê.
 *
 * A fórmula de cada uma é montada a partir das METAS REAIS do arquivo da
 * temporada. Escrever o número na mão faria o tooltip mentir no dia seguinte
 * a uma calibragem — e é justamente pra calibrar que ele existe.
 */
const COLUNAS = [
  {
    chave: "mechanics",
    rotulo: "Mec",
    titulo: "Mecânicas",
    explica: (alvo: never) => [
      oQueE(
        "Quantas mecânicas <strong>distintas</strong> você errou por try, na média da noite. Errar a mesma três vezes conta uma. Fonte: Wipefest."
      ),
      formula("meta ÷ erros × 100"),
      oQueE("A conta se inverte porque aqui menos é melhor."),
      meta(`no máximo ${metaPorFuncao(alvo)} por try`),
    ],
  },
  {
    chave: "deliver",
    rotulo: "Entr",
    titulo: "Entregar",
    explica: (alvo: never) => [
      oQueE(
        "Quanto do <strong>seu próprio sim</strong> do Raidbots você entregou. A régua é você, não o core — o sim é recalculado conforme você se equipa."
      ),
      formula("(dps ÷ sim) ÷ meta × 100"),
      oQueE(
        "A do tank é menor porque ele joga a mesma luta segurando ameaça e gastando GCD em defensivo."
      ),
      meta(`${metaPorFuncao(alvo, "%")} do sim`),
    ],
  },
  {
    chave: "defense",
    rotulo: "Def",
    titulo: "Defender",
    explica: (alvo: never) => [
      oQueE("Quanto do tempo de luta seus cooldowns defensivos passaram em recarga."),
      formula("valor ÷ meta × 100"),
      oQueE(
        "No <strong>tank</strong> o valor é a média disso com a mitigação normalizada — por isso a meta dele é bem maior: são escalas diferentes."
      ),
      meta(metaPorFuncao(alvo)),
    ],
  },
  {
    chave: "healing",
    rotulo: "Cura",
    titulo: "Curar",
    explica: (alvo: never) => [
      oQueE(
        "Duas metades: o <strong>quinhão</strong> do dano do raide que você cobriu, e quanto da sua cura <strong>não</strong> foi pro ralo."
      ),
      formula("valor = (quinhão + (100 − overheal)) ÷ 2"),
      formula("nota = valor ÷ meta × 100"),
      meta(metaPorFuncao(alvo)),
    ],
  },
  {
    chave: "attack",
    rotulo: "Atac",
    titulo: "Atacar",
    explica: (alvo: never) => [
      oQueE(
        "Duas metades: quanto da luta você passou <strong>atacando</strong>, e quanto do tempo seus cooldowns ofensivos ficaram em recarga."
      ),
      formula("valor = (uptime + cooldowns) ÷ 2"),
      formula("nota = valor ÷ meta × 100"),
      meta(metaPorFuncao(alvo)),
    ],
  },
] as const;

function tabelaDoMacro(
  linhas: LinhaDoMacro[],
  metas: Record<string, { target: number; porFuncao?: Record<string, number> }>
): string {
  const cabecalho = COLUNAS.map(
    (c) =>
      `<th class="px-2 py-3 text-right font-medium whitespace-nowrap">${c.rotulo}${dica(
        c.titulo,
        c.explica(metas[c.chave] as never)
      )}</th>`
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
          <th class="px-3 py-3 font-medium">Jogador${dica("Jogador", [
            oQueE("Uma linha por <strong>pessoa</strong>, não por personagem: o alt soma na mesma linha, e os personagens dele ficam sob o nome."),
          ])}</th>
          <th class="px-2 py-3 font-medium">Função${dica("Função", [
            oQueE("A função da <strong>última noite</strong>, não a do cadastro: quem tem nota de cura é medido como healer. É ela que escolhe o peso de cada dimensão."),
          ])}</th>
          <th class="px-2 py-3 font-medium text-right whitespace-nowrap">Score${dica("Score geral", [
            formula("Σ(peso × nota) ÷ Σ(pesos) × sobrevivência"),
            oQueE("Dimensão sem dado sai da conta e o peso se redistribui — nunca entra como zero. Sobreviver não é parcela, é multiplicador."),
            oQueE("O 100 exige <strong>todas</strong> as metas cumpridas; sem isso trava em 99, pra folga de uma dimensão não comprar o teto pagando a falha de outra."),
          ])}</th>
          <th class="px-2 py-3 font-medium text-right whitespace-nowrap">Média${dica("Média", [
            formula("média dos Scores de todas as noites"),
          ])}</th>
          ${cabecalho}
          <th class="px-2 py-3 font-medium text-right whitespace-nowrap">Pres.${dica(
            "Presença",
            [formula("noites com você ÷ noites do core"), oQueE("Somando todos os seus personagens: trocar de personagem pelo grupo não é falta.")],
            "direita"
          )}</th>
          <th class="px-2 py-3 font-medium text-right whitespace-nowrap">Noites${dica(
            "Noites",
            [formula("noites da temporada com registro seu")],
            "direita"
          )}</th>
          <th class="px-3 py-3 font-medium whitespace-nowrap">Metas não cumpridas${dica(
            "Metas não cumpridas",
            [
              formula("dimensões com peso > 0 aquém da meta"),
              oQueE("É o que trava o Score em 99, e o que orienta a conversa. Parse, Ajudar, Preparação e Sobreviver não entram: não pontuam."),
            ],
            "direita"
          )}</th>
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
  /** As metas da temporada, pra fórmula do tooltip não desatualizar. */
  metas: Record<string, { target: number; porFuncao?: Record<string, number> }>;
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

  ${tabelaDoMacro(dados.linhas, dados.metas)}
</div>`;
}
