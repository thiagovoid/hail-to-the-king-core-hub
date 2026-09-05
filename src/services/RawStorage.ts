import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const RAW_ROOT = path.join(ROOT, "data/raw");

/**
 * Archives a provider's raw payload under data/raw/<provider>/<key>.json.
 *
 * This is the Raw Storage Layer: exactly what the tool returned, never
 * altered afterwards. `key` may include subdirectories (e.g. "report/AbC123"
 * or "_discovery/week-03") to group related snapshots.
 */
export async function saveRaw(
  provider: string,
  key: string,
  data: unknown
): Promise<string> {
  const filePath = path.join(RAW_ROOT, provider, `${key}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  return filePath;
}
