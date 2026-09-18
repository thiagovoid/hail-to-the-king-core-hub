/**
 * Quem é quem: de personagem pra PESSOA.
 *
 * O roster cadastra personagens, mas metade das conquistas mede gente. Quem
 * trocou de cadeira numa noite pra compor o raide — foi de Metallicä porque
 * faltava dps, de Voidwar porque faltava tank — não tirou folga: continuou
 * lá. Contar isso como ausência do main faria a troca de personagem sair
 * mais cara que não aparecer, que é exatamente o contrário do que o core
 * quer premiar.
 *
 * A régua: número que descreve o PERSONAGEM (dano, parse, cura) fica no
 * personagem, porque comparar o parse de um Frost DK com o de um Paladino
 * Retribuição não quer dizer nada. Número que descreve a PESSOA (presença,
 * sequência, recorde, medalha) sobe pro main.
 */

export interface PersonagemDoRoster {
  id: string;
  type: "main" | "alt" | "replace";
  /** `id` do main, quando este personagem é alt de alguém. */
  pertenceA?: string | null;
}

/**
 * Personagem -> `id` da pessoa (que é o `id` do main dela).
 *
 * Personagem sem vínculo é pessoa própria: é o caso de todo main, e também
 * o de um alt que ninguém cadastrou ainda. Na dúvida, cada um por si — o
 * erro de separar duas contas da mesma pessoa é bem menos grave que o de
 * juntar duas pessoas diferentes numa medalha só.
 */
export function mapearPessoas(roster: PersonagemDoRoster[]): Map<string, string> {
  const porId = new Map(roster.map((personagem) => [personagem.id, personagem]));
  const pessoas = new Map<string, string>();

  for (const personagem of roster) {
    // Sobe a corrente até o main. O teto de passos é o tamanho do roster:
    // um ciclo (A aponta pra B, B aponta pra A) pararia aqui em vez de
    // travar o build, e o personagem vira pessoa própria.
    let atual = personagem;
    let passos = 0;

    while (atual.pertenceA && passos < roster.length) {
      const acima = porId.get(atual.pertenceA);
      if (!acima || acima.id === atual.id) break;
      atual = acima;
      passos += 1;
    }

    pessoas.set(personagem.id, atual.id);
  }

  return pessoas;
}

/** Pessoa -> todos os personagens dela, o main primeiro. */
export function personagensPorPessoa(roster: PersonagemDoRoster[]): Map<string, string[]> {
  const pessoas = mapearPessoas(roster);
  const porPessoa = new Map<string, string[]>();

  for (const personagem of roster) {
    const pessoa = pessoas.get(personagem.id)!;
    const lista = porPessoa.get(pessoa) ?? [];
    if (personagem.id === pessoa) lista.unshift(personagem.id);
    else lista.push(personagem.id);
    porPessoa.set(pessoa, lista);
  }

  return porPessoa;
}

/** Os OUTROS personagens da mesma pessoa — o que o jogador também joga. */
export function alterEgosDe(roster: PersonagemDoRoster[], personagemId: string): string[] {
  const pessoas = mapearPessoas(roster);
  const pessoa = pessoas.get(personagemId);
  if (!pessoa) return [];

  return roster
    .filter((outro) => outro.id !== personagemId && pessoas.get(outro.id) === pessoa)
    .map((outro) => outro.id);
}
