import { describe, expect, it } from "vitest";

import { abrir, cifrar, type CofreCifrado } from "./cofre";

/**
 * PBKDF2 com 600 mil iterações custa algumas centenas de milissegundos por
 * derivação, e cada caso aqui deriva duas vezes. Poucos testes de propósito,
 * e o `timeout` largo pra não falhar em máquina lenta ou no CI.
 */
const LENTO = 30_000;

describe("cofre da administração", () => {
  it(
    "abre com a senha certa e devolve o conteúdo intacto",
    async () => {
      const conteudo = '<table><tr><td>Voidsurge</td><td>Score 99</td></tr></table>';
      const cofre = await cifrar("senha-do-core", conteudo);

      expect(await abrir("senha-do-core", cofre)).toBe(conteudo);
    },
    LENTO
  );

  it(
    "devolve null com a senha errada, em vez de lixo ou exceção",
    async () => {
      /**
       * Senha errada é o caminho ESPERADO desta função. Sem o bloco de
       * verificação, o AES-GCM falharia a autenticação e o erro seria
       * indistinguível de blob corrompido.
       */
      const cofre = await cifrar("certa", "segredo");

      expect(await abrir("errada", cofre)).toBeNull();
    },
    LENTO
  );

  it(
    "não deixa o conteúdo legível no que vai publicado",
    async () => {
      // O teste que importa: o blob é o que fica no HTML do GitHub Pages.
      const segredo = "COMP por conteudo do core";
      const cofre = await cifrar("senha", segredo);

      const publicado = JSON.stringify(cofre);
      expect(publicado).not.toContain(segredo);
      expect(publicado).not.toContain("senha");
    },
    LENTO
  );

  it(
    "gera sal e IV novos a cada build",
    async () => {
      // Sal repetido deixaria dois builds com o mesmo texto cifrado, o que
      // entrega que o conteúdo não mudou entre um e outro.
      const um = await cifrar("senha", "mesmo conteudo");
      const dois = await cifrar("senha", "mesmo conteudo");

      expect(um.sal).not.toBe(dois.sal);
      expect(um.iv).not.toBe(dois.iv);
      expect(um.conteudo).not.toBe(dois.conteudo);
    },
    LENTO
  );

  it(
    "não abre com blob adulterado",
    async () => {
      // AES-GCM é autenticado: mexer num byte invalida o bloco inteiro.
      const cofre = await cifrar("senha", "conteudo");
      const adulterado: CofreCifrado = {
        ...cofre,
        conteudo: `${cofre.conteudo.slice(0, -4)}AAAA`,
      };

      expect(await abrir("senha", adulterado)).toBeNull();
    },
    LENTO
  );
});
