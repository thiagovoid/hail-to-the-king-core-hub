/**
 * Common contract every external data source implements.
 *
 * `fetch` never normalizes — it returns exactly what the tool gave back,
 * ready to be archived under data/raw/<provider>/ before anything touches it.
 *
 * `TContext` is intentionally per-provider (a WCL fetch needs a report code,
 * a Raider.IO fetch needs a character profile) rather than forced into a
 * single `Player` shape — some providers fetch data for a whole raid report
 * covering every player in one call, not one player at a time.
 */
export interface DataProvider<TContext = unknown, TRaw = unknown> {
  /** Identifies this provider; used as the folder name under data/raw/. */
  readonly name: string;

  fetch(context: TContext): Promise<ProviderResult<TRaw>>;
}

export interface ProviderResult<TRaw = unknown> {
  /** Matches the owning provider's `name`. */
  provider: string;

  /** When this fetch happened, ISO 8601. */
  fetchedAt: string;

  /** Untouched payload from the external tool. */
  raw: TRaw;
}
