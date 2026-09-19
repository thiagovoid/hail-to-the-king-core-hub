import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { DataCollector } from "./DataCollector";
import { loadRaw, saveRaw } from "./RawStorage";
import type { DataProvider } from "../providers/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PROVIDER = "_teste";

/** Provider de mentira que conta quantas vezes foi à "rede". */
function providerFalso(raw: unknown = { valor: 1 }) {
  let chamadas = 0;
  const provider: DataProvider<{ id: string }, unknown> = {
    name: PROVIDER,
    fetch: async () => {
      chamadas += 1;
      return { provider: PROVIDER, fetchedAt: new Date().toISOString(), raw };
    },
  };
  return { provider, chamadas: () => chamadas };
}

afterEach(async () => {
  await rm(path.join(ROOT, "data/raw", PROVIDER), { recursive: true, force: true });
});

describe("DataCollector", () => {
  it("arquiva o bruto de toda tarefa bem-sucedida", async () => {
    const { provider } = providerFalso({ valor: 42 });

    await new DataCollector().run({ provider, context: { id: "a" }, rawKey: "chave-a" });

    expect(await loadRaw<{ valor: number }>(PROVIDER, "chave-a")).toEqual({ valor: 42 });
  });

  // O ponto da arquitetura: uma regra nova sobre dado antigo não pode custar
  // uma ida à API. O relatório de uma noite não muda depois que ela acaba.
  it("reaproveita o arquivo em vez de ir à rede", async () => {
    await saveRaw(PROVIDER, "chave-b", { valor: "do arquivo" });
    const { provider, chamadas } = providerFalso({ valor: "da rede" });

    const [resultado] = await new DataCollector({ reuseArchived: true }).run({
      provider,
      context: { id: "b" },
      rawKey: "chave-b",
    });

    expect(chamadas()).toBe(0);
    expect(resultado.status === "ok" && resultado.fromArchive).toBe(true);
    expect(resultado.status === "ok" && resultado.result.raw).toEqual({ valor: "do arquivo" });
  });

  it("vai à rede quando o arquivo não existe, mesmo reaproveitando", async () => {
    const { provider, chamadas } = providerFalso({ valor: "da rede" });

    const [resultado] = await new DataCollector({ reuseArchived: true }).run({
      provider,
      context: { id: "c" },
      rawKey: "nunca-arquivado",
    });

    expect(chamadas()).toBe(1);
    expect(resultado.status === "ok" && resultado.fromArchive).toBeUndefined();
    // E o que veio da rede fica arquivado pra próxima.
    expect(await loadRaw(PROVIDER, "nunca-arquivado")).toEqual({ valor: "da rede" });
  });

  // Coleta continua sendo coleta: quem quer o dado de novo roda sem a flag.
  it("ignora o arquivo quando o reaproveitamento está desligado", async () => {
    await saveRaw(PROVIDER, "chave-d", { valor: "velho" });
    const { provider, chamadas } = providerFalso({ valor: "novo" });

    await new DataCollector().run({ provider, context: { id: "d" }, rawKey: "chave-d" });

    expect(chamadas()).toBe(1);
    expect(await loadRaw(PROVIDER, "chave-d")).toEqual({ valor: "novo" });
  });

  it("não deixa uma tarefa quebrada derrubar o lote", async () => {
    const quebrado: DataProvider<{ id: string }, unknown> = {
      name: PROVIDER,
      fetch: async () => {
        throw new Error("a API caiu");
      },
    };
    const { provider } = providerFalso({ valor: "ok" });

    const [ruim, bom] = await new DataCollector().run(
      { provider: quebrado, context: { id: "x" }, rawKey: "quebrado" },
      { provider, context: { id: "y" }, rawKey: "inteiro" }
    );

    expect(ruim.status).toBe("error");
    expect(ruim.status === "error" && ruim.error).toContain("a API caiu");
    expect(bom.status).toBe("ok");
  });
});

describe("loadRaw", () => {
  it("devolve null pro que nunca foi arquivado", async () => {
    expect(await loadRaw(PROVIDER, "nao-existe")).toBeNull();
  });

  // Arquivo ilegível deve levar a buscar de novo, não a parar a coleta.
  it("devolve null em vez de estourar com arquivo corrompido", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const dir = path.join(ROOT, "data/raw", PROVIDER);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "corrompido.json"), "{ isto não é json");

    expect(await loadRaw(PROVIDER, "corrompido")).toBeNull();
  });
});
