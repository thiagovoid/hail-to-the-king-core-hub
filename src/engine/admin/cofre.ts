/**
 * O cofre da área de administração.
 *
 * O site é estático: não existe servidor pra checar senha. Uma verificação
 * em JavaScript seria burlada abrindo o DevTools e pulando o `if`, e um hash
 * no arquivo só entregaria o hash — pior ainda em MD5, que é reversível por
 * tabela pra senha comum.
 *
 * Então a senha não VERIFICA nada: ela DECIFRA. A página publicada carrega
 * um blob cifrado e mais nada. Sem a senha não há o que burlar, porque não
 * existe conteúdo em claro pra ler — nem no HTML, nem no bundle, nem no
 * "ver código-fonte".
 *
 * Os parâmetros ficam aqui, num lugar só, porque quem cifra (Node, no build)
 * e quem decifra (navegador, no clique) precisam concordar exatamente. Um
 * número diferente de um lado e o cofre não abre, sem mensagem útil.
 */

/** PBKDF2-SHA256. 600 mil é a recomendação da OWASP pra 2023 em diante. */
export const ITERACOES = 600_000;

/** AES-GCM de 256 bits: o padrão do `crypto.subtle`, autenticado. */
export const TAMANHO_DA_CHAVE = 256;

/** 16 bytes de sal, aleatório a cada build. */
export const BYTES_DE_SAL = 16;

/** 12 bytes de IV — o tamanho que o AES-GCM espera. */
export const BYTES_DE_IV = 12;

/**
 * O que vai publicado. Tudo em base64 porque atravessa HTML como texto.
 *
 * `verificacao` é um segundo bloco cifrado com a MESMA chave, contendo uma
 * frase conhecida. Serve pra dizer "senha errada" em vez de despejar lixo na
 * tela: sem ele, a única forma de saber que a senha estava errada seria o
 * AES-GCM falhar a autenticação, que é o mesmo erro de blob corrompido.
 */
export interface CofreCifrado {
  sal: string;
  iv: string;
  conteudo: string;
  verificacao: string;
}

/** A frase que prova que a chave está certa. Qualquer texto fixo serve. */
export const FRASE_DE_VERIFICACAO = "hail-to-the-king";

/**
 * `Uint8Array<ArrayBuffer>` e não `Uint8Array` pelado: a partir do TS 5.7 o
 * tipo carrega o buffer, e o genérico solto (`ArrayBufferLike`) não é aceito
 * onde a Web Crypto pede `BufferSource`.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const novoBuffer = (tamanho: number): Bytes => new Uint8Array(new ArrayBuffer(tamanho));

export const base64 = {
  de(bytes: Bytes): string {
    let texto = "";
    for (const byte of bytes) texto += String.fromCharCode(byte);
    return btoa(texto);
  },
  para(texto: string): Bytes {
    const bruto = atob(texto);
    const bytes = novoBuffer(bruto.length);
    for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i);
    return bytes;
  },
};

/**
 * A chave derivada da senha.
 *
 * Usada pelos dois lados: no build pra cifrar, no navegador pra decifrar.
 * `crypto.subtle` existe nos dois — no Node desde a 16, no navegador desde
 * sempre em HTTPS (e em localhost, que é o caso do `npm run dev`).
 */
export async function derivarChave(senha: string, sal: Bytes): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: sal, iterations: ITERACOES, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: TAMANHO_DA_CHAVE },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function cifrar(senha: string, conteudo: string): Promise<CofreCifrado> {
  const sal = crypto.getRandomValues(novoBuffer(BYTES_DE_SAL));
  const iv = crypto.getRandomValues(novoBuffer(BYTES_DE_IV));
  const chave = await derivarChave(senha, sal);

  const selar = async (texto: string) =>
    base64.de(
      new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(texto))
      ) as Bytes
    );

  return {
    sal: base64.de(sal),
    iv: base64.de(iv),
    conteudo: await selar(conteudo),
    verificacao: await selar(FRASE_DE_VERIFICACAO),
  };
}

/**
 * Abre o cofre, ou devolve null quando a senha está errada.
 *
 * Null e não exceção: senha errada é o caminho ESPERADO desta função, não
 * uma falha. Quem chama só precisa saber que não abriu.
 */
export async function abrir(senha: string, cofre: CofreCifrado): Promise<string | null> {
  try {
    const iv = base64.para(cofre.iv);
    const chave = await derivarChave(senha, base64.para(cofre.sal));

    const abrirBloco = async (bloco: string) =>
      new TextDecoder().decode(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, base64.para(bloco))
      );

    // A verificação abre primeiro: é barata e diz se a chave presta antes de
    // gastar tempo com o conteúdo inteiro.
    if ((await abrirBloco(cofre.verificacao)) !== FRASE_DE_VERIFICACAO) return null;

    return await abrirBloco(cofre.conteudo);
  } catch {
    return null;
  }
}
