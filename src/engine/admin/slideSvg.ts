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
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );

/**
 * Quebra o texto em linhas que cabem na largura.
 *
 * SVG não quebra linha sozinho — `<text>` que não cabe simplesmente vaza pra
 * fora do quadro. A medida é por largura média de caractere, que é
 * aproximada e suficiente: os textos aqui são curtos e o erro de um
 * caractere não estoura o quadro.
 */
function quebrar(
  texto: string,
  tamanhoDaFonte: number,
  larguraMaxima: number,
): string[] {
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

/**
 * Onde fica a linha de base dentro da caixa da linha.
 *
 * Em SVG o `y` de um `<text>` é a LINHA DE BASE, não o topo. Empilhar blocos
 * usando `y` como se fosse topo fazia o ascendente de um texto de 280px
 * subir duzentos e poucos pixels e cobrir a linha de cima — foi exatamente o
 * que aconteceu com "Você encarou" atrás do "74".
 */
const ALTURA_DO_ASCENDENTE = 0.78;

interface Bloco {
  conteudo: string;
  tamanho: number;
  cor: string;
  peso?: string;
  entrelinha?: number;
  /** Respiro acima deste bloco. Zero no primeiro. */
  espaco?: number;
}

/** Quantas linhas o bloco ocupa depois da quebra. */
const linhasDo = (bloco: Bloco) =>
  quebrar(bloco.conteudo, bloco.tamanho, LARGURA - 160);

const alturaDo = (bloco: Bloco) =>
  linhasDo(bloco).length * bloco.tamanho * (bloco.entrelinha ?? 1.2);

/**
 * Empilha os blocos centrados na vertical.
 *
 * Centrar em vez de começar num `y` fixo: os slides têm de dois a quatro
 * blocos e tamanhos de destaque que variam de 72 a 280, então uma posição
 * fixa deixava uns colados no topo e outros escorrendo pro rodapé.
 */
function empilhar(blocos: Bloco[]): string {
  const alturaTotal = blocos.reduce(
    (soma, bloco, i) =>
      soma + alturaDo(bloco) + (i === 0 ? 0 : (bloco.espaco ?? 0)),
    0,
  );

  let topo = (ALTURA - alturaTotal) / 2;
  const partes: string[] = [];

  for (const [i, bloco] of blocos.entries()) {
    if (i > 0) topo += bloco.espaco ?? 0;

    const entrelinha = bloco.entrelinha ?? 1.2;
    for (const [j, linha] of linhasDo(bloco).entries()) {
      const base =
        topo +
        bloco.tamanho * ALTURA_DO_ASCENDENTE +
        j * bloco.tamanho * entrelinha;
      partes.push(
        `<text x="${LARGURA / 2}" y="${base}" text-anchor="middle" font-size="${bloco.tamanho}" font-weight="${bloco.peso ?? "400"}" fill="${bloco.cor}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${esc(linha)}</text>`,
      );
    }

    topo += alturaDo(bloco);
  }

  return partes.join("");
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
  resumo: DOURADO,
  fechamento: DOURADO,
};

/**
 * O resumo: a temporada inteira numa imagem, em forma de lista.
 *
 * Layout próprio porque a gramática é outra — os outros slides têm UM número
 * gigante, este tem dez pares rótulo/valor. Rótulo à esquerda, valor à
 * direita, cada linha com um filete: é tabela, e tabela se lê alinhada.
 */
function resumoParaSvg(slide: Slide, cor: string): string {
  const itens = slide.itens ?? [];
  const partes: string[] = [];

  const MARGEM = 96;
  const ALTURA_DA_LINHA = 108;
  const alturaDaLista = itens.length * ALTURA_DA_LINHA;

  // O bloco inteiro — título, lista e rodapé — centrado na vertical.
  let y = (ALTURA - (alturaDaLista + 300)) / 2;

  partes.push(
    `<text x="${MARGEM}" y="${y}" font-size="40" font-weight="500" fill="#94a3b8" font-family="system-ui, sans-serif">${esc(slide.chapeu)}</text>`,
    `<text x="${MARGEM}" y="${y + 104}" font-size="88" font-weight="800" fill="${cor}" font-family="system-ui, sans-serif">${esc(slide.destaque)}</text>`,
  );

  y += 200;

  for (const item of itens) {
    partes.push(
      `<line x1="${MARGEM}" y1="${y}" x2="${LARGURA - MARGEM}" y2="${y}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>`,
      `<text x="${MARGEM}" y="${y + 68}" font-size="38" fill="#94a3b8" font-family="system-ui, sans-serif">${esc(item.rotulo)}</text>`,
      // O valor à direita, e menor quando é texto longo: "O Altar Espiralado"
      // e "74 trys" dividem a mesma coluna.
      `<text x="${LARGURA - MARGEM}" y="${y + 68}" text-anchor="end" font-size="${item.valor.length > 18 ? 34 : 44}" font-weight="700" fill="#ffffff" font-family="system-ui, sans-serif">${esc(item.valor)}</text>`,
    );
    y += ALTURA_DA_LINHA;
  }

  partes.push(
    `<line x1="${MARGEM}" y1="${y}" x2="${LARGURA - MARGEM}" y2="${y}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>`,
  );

  if (slide.rodape) {
    partes.push(
      `<text x="${MARGEM}" y="${y + 76}" font-size="34" fill="#475569" font-family="system-ui, sans-serif">${esc(slide.rodape)}</text>`,
    );
  }

  return partes.join("");
}

export function slideParaSvg(
  slide: Slide,
  indice: number,
  total: number,
): string {
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

  if (slide.tipo === "resumo") {
    partes.push(resumoParaSvg(slide, cor));
  } else {
    partes.push(
      empilhar([
        {
          conteudo: slide.chapeu,
          tamanho: 46,
          cor: "#94a3b8",
          peso: "500",
          entrelinha: 1.25,
        },
        {
          conteudo: slide.destaque,
          tamanho,
          cor,
          peso: "800",
          entrelinha: 1.05,
          // O respiro cresce com o destaque: 40px sob um "107%" de 280px seria
          // aperto, e sob um nome de 72px seria buraco.
          espaco: Math.round(tamanho * 0.22),
        },
        ...(slide.unidade
          ? [
              {
                conteudo: slide.unidade,
                tamanho: 56,
                cor: "#cbd5e1",
                peso: "500",
                espaco: 28,
              },
            ]
          : []),
        ...(slide.rodape
          ? [
              {
                conteudo: slide.rodape,
                tamanho: 42,
                cor: "#94a3b8",
                entrelinha: 1.35,
                espaco: 64,
              },
            ]
          : []),
      ]),
    );
  }

  // Assinatura e posição, no rodapé do quadro: quem compartilha leva a marca
  // junto, e quem vê sabe onde está na sequência.
  partes.push(
    `<text x="${LARGURA / 2}" y="${ALTURA - 130}" text-anchor="middle" font-size="34" font-weight="600" fill="${DOURADO}" font-family="system-ui, sans-serif" opacity="0.85">HAIL TO THE KING</text>`,
    `<text x="${LARGURA / 2}" y="${ALTURA - 80}" text-anchor="middle" font-size="28" fill="#475569" font-family="system-ui, sans-serif">${indice + 1} / ${total}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}" height="${ALTURA}">${partes.join("")}</svg>`;
}
