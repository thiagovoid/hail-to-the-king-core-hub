/**
 * Refaz poção e pedra de vida das noites já arquivadas, a partir dos casts.
 *
 * Por que recalcular em vez de esperar a próxima coleta: a fonte antiga
 * (insight do Wipefest) acusou gente que usou. Em 01/10 foram 15 acusados e
 * 14 tinham usado poção. Deixar o passado como está seria manter medalha de
 * zoeira em cima de quem não fez nada de errado.
 *
 * Não gasta uma chamada de API: tudo sai de data/raw/warcraftlogs/, que já
 * está no repositório.
 *
 *   npm run wcl:rebuild-consumables
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { combinePreparation } from "../../src/providers/wipefest/normalizeMechanics";
import {
  armaPreparada,
  usoDaPedraPorAtor,
  usoPorAtor,
} from "../../src/normalization/consumiveisDaNoite";
import type { FamiliaDeConsumivel } from "../../src/providers/wowhead/familiaDoConsumivel";
import type { CooldownCatalogFile } from "../../src/providers/wowhead/cooldownCatalog";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SEMANAS = path.join(ROOT, "data/weekly/performance");
const BRUTO = path.join(ROOT, "data/raw/warcraftlogs");

/**
 * Nome sem acento, pra casar jogador com ator.
 *
 * O id do roster do `Apocalïpse` foi gravado sem o trema, e com casamento
 * exato ele ficava de fora em dez noites — sem consumível nenhum, que a tela
 * leria como "não usou". Perder dez noites de uma pessoa por causa de um
 * trema é pior que o risco remoto de dois nomes colidirem ao dobrar.
 */
const semAcento = (nome: string) =>
  nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Em quantas trys a pessoa precisa usar pra não entrar como pendência. */
const META_DE_USO = 60;

const ROTULOS: Record<FamiliaDeConsumivel, string> = {
  pocao: "Poção",
  pedra: "Pedra de vida",
  frasco: "Frasco",
  comida: "Comida",
  oleo: "Óleo de arma",
};

/** O que sai dos casts por try. Pedra não entra: ela se mede contra MORTE. */
const MEDIVEIS: FamiliaDeConsumivel[] = ["pocao"];
/**
 * Frasco fica como "não medido" até a coleta ler a tabela Buffs.
 *
 * O diagnóstico de 02/10 mostrou que ele existe lá (`Flask of the
 * Magisters`, `Well Fed`, oito runas), mas isso é coleta nova. Enquanto
 * não vem, não se acusa — foi o defeito que esta mudança corrige.
 */
/**
 * Estado da noite, não uso por try: ou a pessoa chegou com, ou não chegou.
 *
 * Sai das auras arquivadas por jogador. Frasco dura uma hora e comida se
 * come em casa — os dois já estão ativos quando o log começa, e por isso
 * só a tabela Buffs POR ALVO os enxerga.
 */
const DO_BUFF: FamiliaDeConsumivel[] = ["frasco", "comida"];

/** Nada fica sem medir: frasco e comida vêm das auras, óleo vem do gear. */
const NAO_MEDIVEIS: FamiliaDeConsumivel[] = [];

/**
 * Óleo sai do GEAR, não dos casts nem dos buffs.
 *
 * Óleo de arma é encantamento temporário, e a WCL entrega isso em
 * `temporaryEnchant` no item da mão principal — campo que já vinha no que
 * coletamos e ninguém lia. Zero óleos apareceram entre os 503 buffs do
 * relatório justamente por isso.
 *
 * Xamã usa imbue próprio (Flametongue, Windfury) no lugar de óleo, e isso
 * conta: a régua é "a arma está preparada?", não "usou o item do guia".
 */
const SLOT_DA_ARMA = 15;

async function main() {
  const roster = JSON.parse(
    await readFile(path.join(ROOT, "data/guild/roster.json"), "utf-8")
  ) as Array<{ name: string; class: string }>;
  const classePorNome = new Map(roster.map((j) => [semAcento(j.name), j.class]));

  const catalogoDeAuras = JSON.parse(
    await readFile(path.join(ROOT, "data/seasons/midnight-s2/aura-catalog.json"), "utf-8")
  ) as { consumiveis: Record<string, { name: string; familia: FamiliaDeConsumivel }> };

  const familiaDaAura = new Map<number, FamiliaDeConsumivel>();
  for (const [guid, dados] of Object.entries(catalogoDeAuras.consumiveis ?? {})) {
    familiaDaAura.set(Number(guid), dados.familia);
  }

  const catalogo = JSON.parse(
    await readFile(path.join(ROOT, "data/seasons/midnight-s2/cooldown-catalog.json"), "utf-8")
  ) as CooldownCatalogFile;

  const familiaPorMagia = new Map<number, FamiliaDeConsumivel>();
  for (const [chave, dados] of Object.entries(catalogo.cooldowns)) {
    if (dados.familia) familiaPorMagia.set(Number(chave), dados.familia);
  }
  console.log(`${familiaPorMagia.size} magias com família no catálogo.\n`);

  const arquivos = (await readdir(SEMANAS)).filter((f) => f.startsWith("week-") && f.endsWith(".json"));
  let noites = 0;
  let corrigidos = 0;
  const semCasamento: string[] = [];

  for (const arquivo of arquivos.sort()) {
    const caminho = path.join(SEMANAS, arquivo);
    const semana = JSON.parse(await readFile(caminho, "utf-8")) as {
      week: number;
      runs: Array<{ date: string; reportCode?: string; players?: Array<Record<string, unknown>> }>;
    };

    for (const noite of semana.runs) {
      if (!noite.reportCode) continue;

      let log: Record<string, unknown>;
      try {
        log = JSON.parse(await readFile(path.join(BRUTO, `${noite.reportCode}.json`), "utf-8"));
      } catch {
        console.log(`  ${noite.date}: sem arquivo bruto — mantida como está`);
        continue;
      }

      const atores = new Map(log.actorNames as Array<[number, string]>);
      const nomes = new Map(log.abilityNames as Array<[number, string]>);
      const raide = new Set((log.raidFights as Array<{ id: number }>).map((f) => f.id));

      const mortes = ((log as { deathEvents?: Array<{ targetID: number; fight: number }> })
        .deathEvents ?? []) as Array<{ targetID: number; fight: number }>;

      const pedraPorAtor = usoDaPedraPorAtor(
        (log.castEvents ?? []) as Array<{ sourceID: number; abilityGameID: number; fight: number }>,
        mortes,
        raide,
        (id) => familiaPorMagia.get(id) === "pedra"
      );

      const uso = usoPorAtor(
        (log.castEvents ?? []) as Array<{ sourceID: number; abilityGameID: number; fight: number }>,
        raide,
        (id) => familiaPorMagia.get(id),
        (id) => nomes.get(id),
        MEDIVEIS
      );

      type Linhas = ReturnType<typeof usoPorAtor> extends Map<number, infer V> ? V : never;
      const porNome = new Map<string, Linhas>();
      const porNomeSemAcento = new Map<string, Linhas>();
      for (const [ator, linhas] of uso) {
        const nome = atores.get(ator);
        if (!nome) continue;
        porNome.set(nome.toLowerCase(), linhas);
        porNomeSemAcento.set(semAcento(nome), linhas);
      }

      let auras: { porJogador: Array<[number, number[]]> } | null = null;
      try {
        auras = JSON.parse(
          await readFile(path.join(BRUTO, noite.reportCode + "-buffs.json"), "utf-8")
        );
      } catch {
        auras = null;
      }

      /** ator -> famílias que ele tinha ativas na noite. */
      const buffsPorAtor = new Map<number, Set<FamiliaDeConsumivel>>();
      for (const [ator, guids] of auras?.porJogador ?? []) {
        const familias = new Set<FamiliaDeConsumivel>();
        for (const guid of guids) {
          const familia = familiaDaAura.get(guid);
          if (familia) familias.add(familia);
        }
        buffsPorAtor.set(ator, familias);
      }

      const atorPorNome = new Map(
        ((log as { actorNames?: Array<[number, string]> }).actorNames ?? []).map(
          ([idDoAtor, nomeDoAtor]) => [semAcento(nomeDoAtor), idDoAtor] as [string, number]
        )
      );

      const detalhes = (log as { aggregateTables?: { summary?: { data?: { playerDetails?: Record<string, Array<{ name?: string; combatantInfo?: { gear?: Array<{ slot?: number; id?: number; temporaryEnchant?: number; temporaryEnchantName?: string; permanentEnchant?: number; permanentEnchantName?: string }> } }>> } } } })
        .aggregateTables?.summary?.data?.playerDetails;
      const armaPorNome = new Map<string, { temEnchant: boolean; nome?: string }>();
      for (const jogadorDoLog of Object.values(detalhes ?? {}).flat()) {
        if (!jogadorDoLog.name) continue;
        const arma = (jogadorDoLog.combatantInfo?.gear ?? []).find((g) => g.slot === SLOT_DA_ARMA && g.id);
        if (!arma) continue;
        const estado = armaPreparada(arma, classePorNome.get(semAcento(jogadorDoLog.name)));
        if (estado) {
          armaPorNome.set(semAcento(jogadorDoLog.name), {
            temEnchant: estado.preparada,
            nome: estado.nome,
          });
        }
      }

      for (const jogador of noite.players ?? []) {
        const id = String(jogador.playerId);
        const medido = porNome.get(id) ?? porNomeSemAcento.get(semAcento(id));

        if (!medido) {
          semCasamento.push(`${noite.date} ${id}`);
          continue;
        }

        const arma = armaPorNome.get(semAcento(id));
        const ator = atorPorNome.get(semAcento(id));
        const pedra = ator !== undefined ? pedraPorAtor.get(ator) : undefined;
        const familiasAtivas = ator !== undefined ? buffsPorAtor.get(ator) : undefined;

        jogador.consumiveis = [
          ...medido.map((u) => ({ ...u, rotulo: ROTULOS[u.familia] })),
          // Pedra: o denominador é a try em que a pessoa MORREU. Quem não
          // morreu sai com uso nulo — não se acusa quem não teve a situação.
          {
            familia: "pedra" as const,
            rotulo: ROTULOS.pedra,
            trysComUso: pedra?.trysComUso ?? null,
            trys: pedra?.trysComMorte ?? null,
            uso: pedra?.uso ?? null,
            quais: [] as string[],
          },
          // Óleo é estado da noite, não uso por try: 100 ou 0, sem meio termo.
          ...(arma
            ? [
                {
                  familia: "oleo" as const,
                  rotulo: ROTULOS.oleo,
                  trysComUso: null,
                  trys: null,
                  uso: arma.temEnchant ? 100 : 0,
                  quais: arma.nome ? [arma.nome] : [],
                },
              ]
            : []),
          // Frasco e comida: medidos quando há aura arquivada da noite, e
          // "não medido" quando não há — nunca "não usou" por lacuna nossa.
          ...DO_BUFF.map((familia) => ({
            familia,
            rotulo: ROTULOS[familia],
            trysComUso: null,
            trys: null,
            uso: familiasAtivas ? (familiasAtivas.has(familia) ? 100 : 0) : null,
            quais: [] as string[],
          })),
          ...NAO_MEDIVEIS.map((familia) => ({
            familia,
            rotulo: ROTULOS[familia],
            uso: null,
            trysComUso: null,
            trys: null,
            quais: [],
          })),
        ];

        // A lista de pendências perde o que o Wipefest dizia de poção e
        // pedra, e recebe o que o nosso log diz. Frasco sai: enquanto não se
        // mede, não se acusa.
        // Tira TODOS os rótulos de consumível, não alguns.
        //
        // Filtrando só uns, o script deixava de ser idempotente: cada
        // execução reempilhava "Frasco" e "Comida" por cima dos que já
        // estavam, e a contagem da temporada inflou de 29 pra 87 sem que
        // nada tivesse mudado no log. O "Flask/comida" do Wipefest também
        // some aqui — é o rótulo velho, da fonte que saiu.
        const rotulosDeConsumivel = new Set<string>([...Object.values(ROTULOS), "Flask/comida"]);
        const antigas = ((jogador.preparationMissing as string[]) ?? []).filter(
          (item) => !rotulosDeConsumivel.has(item)
        );
        const novas = [
          ...medido.filter((u) => u.uso < META_DE_USO).map((u) => ROTULOS[u.familia]),
          ...(arma && !arma.temEnchant ? [ROTULOS.oleo] : []),
          // Pedra entra como pendência só com ZERO, não abaixo da meta.
          //
          // Com o corte de 60% ela reprovava 143 das 178 noites, e isso é o
          // sintoma que estamos curando. Pedra é botão de emergência: muita
          // morte é instantânea e nenhuma pedra salvaria. O acusável é não
          // ter apertado NENHUMA vez tendo morrido — e isso aconteceu em 69
          // noites, com uma mediana de 7 mortes cada.
          ...(pedra?.uso === 0 ? [ROTULOS.pedra] : []),
          ...DO_BUFF.filter((f) => familiasAtivas && !familiasAtivas.has(f)).map(
            (f) => ROTULOS[f]
          ),
        ];

        // A nota de preparação junta o equipamento com os consumíveis, e os
        // consumíveis agora são NOSSOS. Antes essa metade vinha do Wipefest,
        // que não enxergava o que o core usa.
        const notas = (jogador.consumiveis as Array<{ uso: number | null }>)
          .map((c) => c.uso)
          .filter((u): u is number => u !== null);

        const gear = (jogador.preparationGear ?? jogador.preparation) as number | undefined;
        jogador.preparationGear = gear;

        const combinada = combinePreparation(
          { score: gear, checks: jogador.preparationChecks as number | undefined },
          notas.length > 0
            ? {
                score: Math.round(notas.reduce((t, n) => t + n, 0) / notas.length),
                itens: notas.length,
              }
            : undefined
        );
        if (combinada !== undefined) jogador.preparation = combinada;

        const antes = JSON.stringify(jogador.preparationMissing ?? []);
        jogador.preparationMissing = [...antigas, ...novas];
        if (JSON.stringify(jogador.preparationMissing) !== antes) corrigidos += 1;
      }

      noites += 1;
    }

    await writeFile(caminho, `${JSON.stringify(semana, null, 2)}\n`);
  }

  console.log(`${noites} noites refeitas; ${corrigidos} registros de jogador mudaram.`);
  if (semCasamento.length > 0) {
    console.log(`\n${semCasamento.length} jogador(es) sem casamento com o log (ficaram sem consumível):`);
    for (const linha of semCasamento.slice(0, 12)) console.log(`  ${linha}`);
  }
  console.log("\nConfira `git diff data/weekly/` antes de commitar.");
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
