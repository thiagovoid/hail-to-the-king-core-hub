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
