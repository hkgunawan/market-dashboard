import raw from "../data/universe.json";

export type AssetClass = "equity" | "metal" | "crypto";

export interface UniverseEntry {
  symbol: string;
  name: string;
  class: AssetClass;
  /** Delisted or permanently unavailable. Kept for the record, skipped by the
   *  scanner, and excluded from the success-rate floor so index churn cannot
   *  slowly starve the error budget. */
  knownDead?: boolean;
}

export const UNIVERSE: UniverseEntry[] = raw as UniverseEntry[];

export function liveUniverse(): UniverseEntry[] {
  return UNIVERSE.filter((e) => !e.knownDead);
}
