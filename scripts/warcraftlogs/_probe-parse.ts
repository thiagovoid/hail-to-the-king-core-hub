import { wclGraphql } from "../../src/providers/warcraftlogs/client";

const code = "JCvk27bDL6Zdm18j";

// A WCL expõe rankings do PRÓPRIO relatório, além do ranking global do
// personagem. Se este vier preenchido, dá parse por noite mesmo sem o log
// estar rankeado globalmente.
const data = await wclGraphql<{ reportData: { report: { rankings?: unknown } | null } }>(
  `query($code: String!) {
    reportData {
      report(code: $code) {
        rankings
      }
    }
  }`,
  { code }
);

const r = data.reportData.report?.rankings as { data?: unknown[] } | undefined;
console.log("report.rankings existe?", r !== undefined && r !== null);
console.log("chaves:", r ? Object.keys(r).join(", ") : "(nenhuma)");
console.log("entradas:", Array.isArray(r?.data) ? r.data.length : "(sem data)");
console.log("\namostra:", JSON.stringify(r?.data?.[0] ?? r).slice(0, 900));
