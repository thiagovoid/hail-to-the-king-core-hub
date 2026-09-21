import { describe, expect, it } from "vitest";

import { slideParaSvg, LARGURA, ALTURA } from "./slideSvg";
import type { Slide } from "./retrospectiva";

/**
 * A caixa que cada linha de texto ocupa, deduzida do SVG.
 *
 * Em SVG o `y` é a LINHA DE BASE. A caixa vai de `y - tamanho*0.78` (o topo
 * do ascendente) até `y + tamanho*0.22` (o pé do descendente) — os mesmos
 * números que o layout usa pra empilhar.
 */
function caixas(svg: string): Array<{ texto: string; topo: number; base: number; tamanho: number }> {
  const achados: Array<{ texto: string; topo: number; base: number; tamanho: number }> = [];
  const re = /<text[^>]*y="([\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const y = Number(m[1]);
    const tamanho = Number(m[2]);
    achados.push({ texto: m[3], topo: y - tamanho * 0.78, base: y + tamanho * 0.22, tamanho });
  }

  return achados;
}

const slideDe = (p: Partial<Slide>): Slide => ({
  tipo: "numero",
  chapeu: "Você encarou",
  destaque: "74",
  ...p,
});

describe("slideParaSvg", () => {
  /**
   * O defeito que gerou este teste: o destaque de 280px era posicionado
   * logo abaixo do chapéu usando `y` como se fosse o topo, e o ascendente
   * dele subia duzentos e poucos pixels por cima. Na tela, "Você encarou"
   * aparecia ATRÁS do "74".
   */
  it("não sobrepõe linhas de texto, com destaque grande ou pequeno", () => {
    const casos: Slide[] = [
      slideDe({ destaque: "74", unidade: "trys", rodape: "e derrubou 26 bosses" }),
      slideDe({ tipo: "fechamento", chapeu: "Até a próxima temporada", destaque: "Nerlock", rodape: "Item level 258 → 304. Nos vemos terça." }),
      slideDe({ tipo: "pancada", chapeu: "A maior porrada que você levou", destaque: "107%", unidade: "da sua vida", rodape: "Gravebound, de uma vez só. Nem deu tempo de pensar." }),
      slideDe({ chapeu: "O boss que não te deixava em paz", destaque: "O Altar Espiralado", rodape: "26 trys. Sonhou com ele, admita." }),
      slideDe({ chapeu: "Seu botão favorito", destaque: "Healing Stream Totem", rodape: "757 vezes. Seu dedo merece férias." }),
    ];

    for (const slide of casos) {
      const linhas = caixas(slideParaSvg(slide, 0, 13));

      for (let i = 1; i < linhas.length; i += 1) {
        const anterior = linhas[i - 1];
        const atual = linhas[i];
        expect(
          atual.topo,
          `"${atual.texto}" começa em ${Math.round(atual.topo)} e "${anterior.texto}" termina em ${Math.round(anterior.base)}`
        ).toBeGreaterThanOrEqual(anterior.base);
      }
    }
  });

  it("mantém tudo dentro do quadro de 1080x1920", () => {
    // Texto que vaza do viewBox some no PNG sem aviso nenhum.
    const svg = slideParaSvg(
      slideDe({
        chapeu: "O raide seguiu lutando sem você por",
        destaque: "60 minutos",
        rodape: "Deu tempo de tomar um café. Vários.",
      }),
      0,
      13
    );

    for (const linha of caixas(svg)) {
      expect(linha.topo, linha.texto).toBeGreaterThanOrEqual(0);
      expect(linha.base, linha.texto).toBeLessThanOrEqual(ALTURA);
    }
  });

  it("declara o tamanho que o export espera", () => {
    // Sem width/height o `<img>` que alimenta o canvas assume 300x150.
    const svg = slideParaSvg(slideDe({}), 0, 13);

    expect(svg).toContain(`width="${LARGURA}"`);
    expect(svg).toContain(`height="${ALTURA}"`);
    expect(svg).toContain(`viewBox="0 0 ${LARGURA} ${ALTURA}"`);
  });

  it("escapa o que vai pro XML", () => {
    // Nome com & ou < quebraria o SVG inteiro, e o PNG sairia em branco.
    const svg = slideParaSvg(slideDe({ destaque: "Fulano & <script>" }), 0, 1);

    expect(svg).toContain("Fulano &amp; &lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});
