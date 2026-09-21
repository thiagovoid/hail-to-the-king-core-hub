/**
 * Cada slide como SVG, no formato 9:16 de story.
 *
 * SVG e não HTML por um motivo prático: o mesmo elemento que aparece na tela
 * é o que vira PNG no download. Serializa, desenha num canvas, exporta. Sem
 * biblioteca de captura de tela — o projeto tem três dependências de runtime
 * e não vale gastar a quarta com algo que o navegador já faz.
 *
 * Tudo é desenhado em coordenadas de 1080x1920, que é a resolução que
 * Instagram e afins esperam. Na tela o SVG escala sozinho.
 */
import type { Slide } from "./retrospectiva";

export const LARGURA = 1080;
export const ALTURA = 1920;

/** O dourado da casa, o mesmo do resto do site. */
const DOURADO = "#f0a500";

const esc = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );

/**
 * Quebra o texto em linhas que cabem na largura.
 *
 * SVG não quebra linha sozinho — `<text>` que não cabe simplesmente vaza pra
 * fora do quadro. A medida é por largura média de caractere, que é
 * aproximada e suficiente: os textos aqui são curtos e o erro de um
 * caractere não estoura o quadro.
 */
function quebrar(texto: string, tamanhoDaFonte: number, larguraMaxima: number): string[] {
  const porCaractere = tamanhoDaFonte * 0.52;
  const cabe = Math.max(1, Math.floor(larguraMaxima / porCaractere));

  const linhas: string[] = [];
  let atual = "";

  for (const palavra of texto.split(" ")) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= cabe) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra;
  }
  if (atual) linhas.push(atual);

  return linhas;
}

/** Um bloco de texto centrado, com quebra automática. */
function texto(
  conteudo: string,
  y: number,
  tamanho: number,
  cor: string,
  peso = "400",
  entrelinha = 1.2
): { svg: string; altura: number } {
  const linhas = quebrar(conteudo, tamanho, LARGURA - 160);
  const svg = linhas
    .map(
      (linha, i) =>
        `<text x="${LARGURA / 2}" y="${y + i * tamanho * entrelinha}" text-anchor="middle" font-size="${tamanho}" font-weight="${peso}" fill="${cor}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${esc(linha)}</text>`
    )
    .join("");

  return { svg, altura: linhas.length * tamanho * entrelinha };
}

/**
 * O tamanho do destaque encolhe conforme o texto cresce.
 *
 * "107%" e "O Altar Espiralado" ocupam o mesmo lugar no layout, e um tamanho
 * fixo faria o primeiro parecer tímido ou o segundo vazar do quadro.
 */
function tamanhoDoDestaque(conteudo: string): number {
  if (conteudo.length <= 4) return 280;
  if (conteudo.length <= 8) return 200;
  if (conteudo.length <= 14) return 140;
  if (conteudo.length <= 24) return 96;
  return 72;
}

/** A cor do destaque, por tipo de slide. */
const COR_DO_TIPO: Record<Slide["tipo"], string> = {
  abertura: DOURADO,
  numero: "#ffffff",
  nemesis: "#f87171",
  pancada: "#fb923c",
  ranking: "#34d399",
  evolucao: "#34d399",
  fechamento: DOURADO,
};

export function slideParaSvg(slide: Slide, indice: number, total: number): string {
  const cor = COR_DO_TIPO[slide.tipo];
  const tamanho = tamanhoDoDestaque(slide.destaque);

  const partes: string[] = [];

  // Fundo: o mesmo azul-noite do site, com um halo na cor do slide pra cada
  // tela ter identidade sem precisar de arte.
  partes.push(`<defs>
    <radialGradient id="halo" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${cor}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${LARGURA}" height="${ALTURA}" fill="#0b1020"/>
  <rect width="${LARGURA}" height="${ALTURA}" fill="url(#halo)"/>`);

  let y = 700;

  const chapeu = texto(slide.chapeu, y, 46, "#94a3b8", "500");
  partes.push(chapeu.svg);
  y += chapeu.altura + 70;

  const destaque = texto(slide.destaque, y, tamanho, cor, "800", 1.05);
  partes.push(destaque.svg);
  y += destaque.altura + 24;

  if (slide.unidade) {
    const unidade = texto(slide.unidade, y, 56, "#cbd5e1", "500");
    partes.push(unidade.svg);
    y += unidade.altura + 40;
  }

  if (slide.rodape) {
    const rodape = texto(slide.rodape, y + 40, 42, "#94a3b8", "400", 1.35);
    partes.push(rodape.svg);
  }

  // Assinatura e posição, no rodapé do quadro: quem compartilha leva a marca
  // junto, e quem vê sabe onde está na sequência.
  partes.push(
    `<text x="${LARGURA / 2}" y="${ALTURA - 130}" text-anchor="middle" font-size="34" font-weight="600" fill="${DOURADO}" font-family="system-ui, sans-serif" opacity="0.85">HAIL TO THE KING</text>`,
    `<text x="${LARGURA / 2}" y="${ALTURA - 80}" text-anchor="middle" font-size="28" fill="#475569" font-family="system-ui, sans-serif">${indice + 1} / ${total}</text>`
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}" height="${ALTURA}">${partes.join("")}</svg>`;
}
