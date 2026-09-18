/**
 * Sonda: como pedir a lista COMPLETA de habilidades de dano de um jogador.
 *
 * A tabela agregada de DamageDone trunca em 5 habilidades por jogador — o
 * mesmo que acontece na tabela de Casts. Com só o top 5, o filtro de
 * relevância não enxerga as habilidades situacionais, que são justamente as
 * que ele existe pra descartar.
 */
import { wclGraphql } from "../../src/providers/warcraftlogs/client";
import type { WclFight } from "../../src/providers/warcraftlogs/normalize";

const code = process.env.PROBE_REPORT || "JCvk27bDL6Zdm18j";

const { reportData } = await wclGraphql<{ reportData: { report: { fights: WclFight[] } } }>(
  `query($code: String!) {
    reportData { report(code: $code) { fights { id encounterID } } }
  }`,
  { code }
);
const ids = reportData.report.fights.filter((f) => f.encounterID > 0).map((f) => f.id);

// Gunst (id 12): o jogador cujo único "cooldown ofensivo" detectado foi um
// gap closer. Se a lista completa dele aparecer, o filtro passa a funcionar.
const GUNST = 12;

async function tentar(rotulo: string, argsExtras: string, variaveis: Record<string, unknown>) {
  try {
    const data = await wclGraphql<{ reportData: { report: { table?: unknown } | null } }>(
      `query($code: String!, $fightIDs: [Int]!) {
        reportData { report(code: $code) {
          table(fightIDs: $fightIDs, dataType: DamageDone${argsExtras})
        } }
      }`,
      { code, fightIDs: ids, ...variaveis }
    );
    const tabela = (data.reportData.report?.table ?? {}) as { data?: { entries?: unknown[] } };
    const entries = (tabela.data?.entries ?? []) as Array<Record<string, unknown>>;
    const alvo = entries.find((e) => e.id === GUNST) ?? entries[0];
    const abilities = (alvo?.abilities ?? []) as Array<Record<string, unknown>>;
    console.log(`${rotulo}: ${entries.length} entrada(s), alvo "${alvo?.name}" com ${abilities.length} habilidade(s)`);
    if (abilities.length > 5) {
      console.log("   " + abilities.map((a) => a.name).slice(0, 25).join(", "));
    }
  } catch (erro) {
    console.log(`${rotulo}: FALHOU — ${erro instanceof Error ? erro.message.slice(0, 160) : erro}`);
  }
}

await tentar("agregada (como hoje)", "", {});
await tentar("com sourceID", ", sourceID: 12", {});
await tentar("viewBy Ability", ", viewBy: Ability", {});
await tentar("sourceID + viewBy Ability", ", sourceID: 12, viewBy: Ability", {});
