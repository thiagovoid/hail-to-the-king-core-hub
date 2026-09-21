# Coleta — como e em que ordem

> Este arquivo existe porque a ordem errada já publicou o site com dados
> errados **três vezes**. Não é documentação de referência: é checklist.
> Leia antes de rodar qualquer coisa que toque a rede.

---

## A regra que quebra tudo quando é esquecida

**`wcl:fetch-performance` reescreve o arquivo da semana INTEIRO, e ele só
conhece os campos da WCL.**

Tudo que outro coletor escreveu naquele arquivo — em especial `mechanics`, do
Wipefest, e os consumíveis — é **apagado em silêncio**. Sem erro, sem aviso do
Node, sem teste vermelho. O site sobe bonito e com a nota errada.

Mecânicas pesa **25 a 30** no Score. Perdê-la não degrada um detalhe: erra
todas as notas da semana.

```
SEMPRE, sem exceção:
   1º  wcl:fetch-performance   (ou wcl:collect / wcl:build)
   2º  wipefest:build          ← NUNCA pule, NUNCA inverta
```

O workflow `update-data.yml` já faz nessa ordem. **Rodando à mão, a ordem é
sua responsabilidade.**

### Como saber se você errou

```bash
node -e "const fs=require('fs');for(const a of fs.readdirSync('data/weekly/performance').filter(f=>f.endsWith('.json'))){const w=JSON.parse(fs.readFileSync('data/weekly/performance/'+a,'utf8'));const t=w.runs.flatMap(r=>r.players);console.log(a,'mechanics em',t.filter(p=>p.mechanics!==undefined).length,'de',t.length)}"
```

Qualquer linha onde os dois números não batem = arquivo quebrado. Rode
`npm run wipefest:build` e confira de novo **antes de commitar**.

---

## Recalcular ≠ recoletar

Esta é a distinção que economiza tempo e dinheiro. Antes de rodar, responda:
**o que mudou?**

| O que mudou | O que rodar | Vai à rede? |
|---|---|---|
| Uma regra, um peso, uma fórmula, um texto | `npm run wcl:build` (é `--reuse`) | **Não** |
| A FORMA da coleta (campo novo, query nova) | `npm run wcl:collect` (sem `--reuse`) | **Sim** |
| Chegou uma noite nova | `npm run wcl:collect` | Só o report novo |

### Duas armadilhas que já fizeram uma verificação inteira mentir

**1. `--reuse` sozinho não reconstrói nada.** A descoberta só enxerga a janela
de datas (`--days=7` por padrão, a partir de HOJE). Sem `--reports` ou
`--start`/`--end`, ela acha zero relatórios, o script preserva as runs que já
estavam no arquivo e imprime `Gerado ... (0 atualizada(s)/nova(s))`. Isso
parece sucesso e não recalculou uma linha. Uma comparação "antes x depois"
feita assim dá zero divergências porque nada foi recalculado.

Para reconstruir de verdade, passe os códigos:

```bash
npm run wcl:build -- --week=3 --reports=83A2nJ4NHBFCD9xW,6BcGTrAN7HaPx431
```

**2. `wipefest:build` só faz a semana ATUAL.** Ele calcula a semana pelo
`raidWeekAnchor`, igual ao coletor. Reconstruiu cinco semanas? Rode
`wipefest:build -- --week=N` para cada uma, ou quatro delas ficam sem
`mechanics` — e o teste vai acusar.

**3. Regra que aprende do log precisa de DUAS passadas.** A lista de magias
interrompíveis cresce enquanto os relatórios são processados (6 → 8 → 10 →
11). A semana 1, processada primeiro, foi calculada com 6. Depois que o
arquivo tem as 11, rode tudo de novo para que toda semana use o conjunto
completo.

`--reuse` reconstrói do bruto arquivado em `data/raw/warcraftlogs/`. O
relatório de uma noite não muda depois que a noite acabou, então **regra nova
sobre noite antiga não precisa de uma única chamada externa.**

> **Lembrete:** antes de ir à rede, pergunte se `--reuse` não resolve.
> Na dúvida, rode `--reuse` primeiro — ele nunca gasta orçamento e o
> resultado te diz se faltava dado de verdade.

### Conferindo que o `--reuse` não mudou nada que não devia

Copie `data/weekly/performance/*.json` pro scratchpad antes, rode, e compare
campo a campo. Zero divergência é o esperado quando só a apresentação mudou.

---

## Orçamento da WCL

**3600 pontos por hora.** O client **não tem tratamento de rate limit** — se
estourar, a execução morre no meio, com metade dos relatórios recoletados e
metade não. É o estado mais chato de diagnosticar.

Desde `bc59ecb`, toda execução que vai à rede termina imprimindo quanto
gastou, e avisa quando sobra menos de um quarto.

**Custos medidos** (não estimados), por noite de ~12 trys:

| Chamada | Volume | Custo |
|---|---|---|
| `castEvents` | ~53 mil eventos | ~14 pontos |
| `biggestHits` (DamageTaken) | reduzido a 20/pessoa/try | a medir |
| `enemyCastCounts` | contagem, não evento | baixo |

> **Lembrete:** numa recoleta de temporada, **rode uma semana, leia o
> orçamento impresso no fim, e só então solte a próxima.** Não dispare cinco
> semanas de uma vez para descobrir o custo no meio da terceira.

---

## Recoleta de temporada inteira

Cada execução escreve **um** arquivo de semana. Recoletar a temporada são
N disparos, um por semana, com `week` + `start`/`end` explícitos.

Semanas da Midnight S2:

| Semana | Noites |
|---|---|
| 1 | 2026-08-18 |
| 2 | 2026-08-25, 2026-08-27 |
| 3 | 2026-09-01, 2026-09-03 |
| 4 | 2026-09-09 |
| 5 | 2026-09-10, 2026-09-15 |

Pelo Action (é onde ficam as credenciais — **não existem `WCL_CLIENT_ID` /
`WCL_CLIENT_SECRET` na máquina local**):

```bash
gh workflow run update-data.yml -f week=1 -f start=2026-08-17 -f end=2026-08-19
```

Espere terminar, leia o orçamento no log, **depois** dispare a semana seguinte.

---

## O que é decisão de coleta e o que é decisão de análise

Erro caro: enfiar régua de análise dentro da coleta. Limiar de "pancada
grande", lista de magias interrompíveis, peso de dimensão — tudo isso **muda**,
e o que mudar exige ir à rede de novo se a coleta já tiver descartado o resto.

- **Pode estar na coleta:** teto de VOLUME (as 20 maiores), agregação que não
  perde a pergunta (contagem de cast por magia por try).
- **Não pode:** limiar de significado, filtro por lista curada, qualquer
  número que uma discussão futura possa mudar.

> **Lembrete:** antes de filtrar algo na coleta, pergunte "se eu mudar de
> ideia sobre esse número, vou precisar voltar à rede?". Se sim, não filtre.

---

## Ordem completa de uma atualização semanal

1. `wcl:fetch-performance` — WCL (nova noite vai à rede, resto do archive)
2. `wipefest:build` — **devolve `mechanics`** ao arquivo que o passo 1 reescreveu
3. `npm test` — 599 testes
4. `npm run build` — valida que o dado gerado não quebra o site
5. Conferir `mechanics` com o comando da seção acima
6. Commitar

Os passos 1 a 4 são o que o `update-data.yml` faz. O 5 é seu.

---

## Coletores que rodam em outro ritmo

Não entram na atualização semanal e não sofrem do problema de ordem acima,
porque escrevem em arquivos próprios:

| Script | Escreve em | Quando |
|---|---|---|
| `wowhead:fetch-preparation` | `preparation-reference.json` | por tier |
| `raidbots:update-goals` | metas de sim por jogador | cron semanal |
| `wcl:sync-roster-stats` | `roster.json` | cron |
| `wipefest:fetch-boss-insights` | `boss-insights.json` | por tier |

Os `wcl:inspect-*` são ferramentas de diagnóstico: leem, nunca escrevem.

## O dado que nenhuma coleta descobre: quem é alt de quem

A WCL vê dois personagens e não vê que atrás dos dois tem a mesma pessoa.
`type` e `pertenceA` no `roster.json` são os únicos campos escritos à mão — e
sobrevivem às coletas porque `wcl:sync-roster-stats` e `raidbots:update-goals`
espalham o personagem (`...player`) em vez de remontá-lo.

O caminho é pela tela, não pelo editor:

1. `/admin` → **Vínculo de alts** → escolher o main de cada personagem.
2. **Baixar vinculos.json** (só habilita quando há mudança válida).
3. `npm run roster:alts -- caminho/do/vinculos.json`
4. `git diff data/guild/roster.json` — tem que mexer **só** em `type` e
   `pertenceA`. Se mexeu em parse, io ou presença, algo saiu errado.

O arquivo baixado **não é o roster**: são só os vínculos. É de propósito. O
script lê o `roster.json` do disco na hora de gravar, então uma coleta que
rodou entre o download e o comando não é desfeita — o que aconteceria se a
tela mandasse de volta o roster inteiro da hora do build.

O que a tela recusa, e por quê:

- **alt de si mesmo** — não precisa de explicação.
- **corrente de alt** (A é alt de B, que é alt de C): `mapearPessoas` até
  resolveria subindo até o topo, mas a medalha iria pro C calada, e quem
  escolheu B na tela esperava o B.

## A meta de mecânicas não vem do arquivo da temporada

`performanceTargets.mechanics` continua no config, mas só como **reserva**. A
meta de verdade é derivada da noite: a mediana do grupo no mesmo boss, vezes
0,95, com piso de 0,6 erro por try (`src/normalization/metaDeMecanicas.ts`).

Por que não é fixa: o Wipefest mede **dano tomado**, não erro julgado — 1029
dos 1032 registros da temporada são literalmente "Damage from X". Tem
mecânica em que tomar dano é o jogo (soak que larga poça no pé, chão que se
PRECISA pisar pra limpar), e uma régua fixa cobra esse imposto de todo mundo.
A mediana real do grupo variou de 0,44 a 1,90 entre noites: a fixa de 1,4
punia progressão e dava 115 de graça em noite limpa.

**Não é coleta, é derivação.** Roda em `data/weekly/performance/index.ts`, que
é o único ponto por onde site, admin e testes leem as semanas. Vale pras
noites antigas sem recoletar nada, e não há passo novo na atualização semanal.

Duas armadilhas que já morderam:

- **Parte dos registros do Wipefest vem sem `insightId` na URL.** O boss é
  resolvido pelo NOME, com um mapa montado da temporada inteira. Montar o
  mapa por noite deixaria de fora justamente a noite em que o id faltou pra
  todo mundo — foi o caso do Ula'tek em 03/09 e 10/09, e o efeito era nota
  mais baixa por defeito de parsing.
- **Quem esteve no boss e não errou tem que entrar na mediana como zero.**
  Contando só quem errou, a referência sai alta e a meta afrouxa pra todos.
