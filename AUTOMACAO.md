# Automação de dados — Core Hub

Este projeto tem 3 procedimentos de atualização de dados. **Nenhum deles roda sozinho** — todos são disparados manualmente, quando alguém do core decide que é hora de atualizar. Este documento explica o quê cada um faz, quando rodar, e como rodar.

Pré-requisito comum: `.env` na raiz do projeto preenchido (veja `.env.example`) com `WCL_CLIENT_ID` e `WCL_CLIENT_SECRET` (criados em warcraftlogs.com → Settings → API Clients).

## Setup (rodar uma vez, em qualquer máquina que for usar isso)

```bash
npm install
```

Isso já baixa o navegador Chromium que o item 3 (Raidbots) precisa — o `npm install` tem um passo (`postinstall`) que roda `playwright install chromium` sozinho. Se aparecer erro de navegador faltando ao rodar o item 3, rode manualmente:

```bash
npx playwright install chromium
```

Se isso reclamar de bibliotecas de sistema faltando (comum em Linux "limpo"), rode com dependências do sistema também (pede senha de admin/sudo):

```bash
npx playwright install chromium --with-deps
```

Isso baixa ~180MB na primeira vez. Só precisa rodar de novo se trocar de máquina ou limpar o `node_modules`.

---

## 1. Atualizar performance da semana (WarcraftLogs)

**O que faz:** busca os reports de raid do WarcraftLogs e gera/atualiza `data/performance/week-NN.json` com dps, hps, item level, mortes e parse de cada jogador, por run (noite de raid).

**Quando rodar:** depois de cada noite de raid (terça e quinta), assim que o log daquela noite estiver disponível no WCL.

**Como rodar:**

```bash
npm run wcl:fetch-performance -- --week=<numero> --reports=<codigo-do-report>
```

- `--week`: número da semana (1, 2, 3...). Se a semana já tiver um arquivo, a run nova é **somada** às que já existem — não sobrescreve.
- `--reports`: código do report do WarcraftLogs (o final da URL, ex: `https://www.warcraftlogs.com/reports/AbCdEfGh123` → código `AbCdEfGh123`). Pode passar mais de um separado por vírgula.
- Se o log for público e marcado pra guild, o script também acha sozinho via `--start`/`--end`/`--days` — mas hoje os logs são pessoais (unlisted), então `--reports` é obrigatório na prática (ver `scripts/warcraftlogs/fetch-performance.mjs` pra detalhes de por quê).

Esse comando também detecta jogadores que aparecem no log mas não estão em `data/roster.json` e cria um rascunho de cadastro automaticamente (class/spec/role da WCL, raça/avatar do Raider.io). **Revise esses rascunhos** — falta discord, hero spec, se é main/alt, e a spec vem em inglês.

---

## 2. Atualizar estatísticas de perfil (Raider.IO + WCL)

**O que faz:** preenche em `data/roster.json`, pra cada jogador: IO score, melhor key, rank no reino (Raider.IO), avg/best parse (WarcraftLogs), e presença na temporada (calculada localmente a partir de `data/performance/*.json`).

**Quando rodar:** periodicamente (ex: uma vez por semana, ou depois de uma noite de M+ pesada), pra manter os cards de `/membros/` atualizados.

**Como rodar:**

```bash
npm run wcl:sync-roster-stats
```

Roda pra todo o roster de uma vez. Não precisa de nenhum argumento.

---

## 3. Atualizar objetivos de performance (Raidbots — dps/hps alvo)

**O que faz:** roda o "Quick Sim" do Raidbots (via navegador automatizado, já que o Raidbots não tem API) pra cada jogador do roster, e usa o resultado como meta de **dps** em `data/roster.json` → `performanceGoals.dps`. O fight style usado é **Heavy Movement** (não o padrão "Patchwerk") — dá um dps mais baixo que o parado-sem-mover-se do Patchwerk, mais parecido com o que a galera realmente bate em boss, então a meta fica mais realista/alcançável. Isso está fixo em `FIGHT_STYLE` no topo de `scripts/raidbots/update-performance-goals.mjs`, caso queiram trocar no futuro.

**⚠️ Limitação real do Quick Sim: não simula healers.** Se o personagem estiver numa spec de cura no momento (Restoration, Holy, Discipline, Mistweaver, Preservation), o Raidbots mostra "Unsupported Spec" e não roda nada — o script detecta isso e **pula o jogador automaticamente** (aparece "pulado" no terminal, não conta como falha). Isso não é bug nosso, é o Quick Sim que não tem suporte a throughput de cura. Não existe hoje um jeito automatizado de gerar meta de hps pro roster — teria que ser uma simulação Advanced configurada na mão, boss a boss, o que foge do escopo desse script.

Se o personagem estiver numa spec de **dano** no momento mesmo sendo cadastrado como healer no roster (ex: alt de dps, ou trocou de spec temporariamente), o script roda normalmente e grava o resultado como meta de dps — com um aviso no terminal deixando claro que não é uma meta de cura.

**Quando rodar:** manualmente, quando o core decidir — normalmente depois de uma leva de upgrades de equipamento relevante (não faz sentido rodar toda semana, já que o dps-alvo só muda quando o gear muda). **Essa é a decisão do core, não do código** — por isso não tem cron nem trigger automático pra isso.

**Como rodar:**

```bash
npm run raidbots:update-goals
```

- Roda **um personagem de cada vez** (não em paralelo), demora uns 20-40s por pessoa — pra ~20 jogadores, espere uns 10-15 minutos rodando.
- Pra testar com um jogador só antes de rodar todo mundo: `npm run raidbots:update-goals -- --only=nerlock,kams`
- Pra ver o navegador rodando (debug): `npm run raidbots:update-goals -- --headed`

**⚠️ Cuidado antes de rodar:** o Raidbots simula a **spec atual equipada no jogo**, não a spec cadastrada no `roster.json`. Se alguém trocou de especialização recentemente (ex: foi de Retribution pra Holy), a simulação vai refletir a spec errada pro nosso propósito. O script imprime a classe/spec simulada de cada um no terminal — **confira essa lista antes de considerar os alvos válidos**, e avise quem estiver na spec errada pra trocar antes de rodar de novo.

Esse é um script mais pesado que os outros dois (abre um navegador Chromium de verdade) — evite rodar com muita frequência, é um serviço gratuito mantido pelo pessoal do Raidbots, não uma API nossa.

---

## Ordem recomendada

Se for atualizar tudo de uma vez (ex: início de uma nova season): **1 → 2 → 3**, nessa ordem — a etapa 3 usa a spec/gear atual do personagem, então faz mais sentido depois que os dados de performance/equipamento já estiverem frescos.
