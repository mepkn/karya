/** Friction factors offered on the Estimate tab, with their default weights. */
export type PainPointDefault = {
  key: string;
  label: string;
  category: "code" | "spec" | "dependency" | "data" | "people" | "environment" | "booster";
  defaultWeightPct: number;
  isBooster: boolean;
};

export const DEFAULT_PAIN_POINTS: readonly PainPointDefault[] = [
  { key: "legacy_code", label: "Legacy / untested module", category: "code", defaultWeightPct: 25, isBooster: false },
  { key: "unclear_specs", label: "Unclear specs / missing designs", category: "spec", defaultWeightPct: 20, isBooster: false },
  { key: "third_party_api", label: "Third-party API / webhook dependency", category: "dependency", defaultWeightPct: 20, isBooster: false },
  { key: "schema_migration", label: "DB schema migration / backfill", category: "data", defaultWeightPct: 15, isBooster: false },
  { key: "cross_team", label: "Blocked by / syncing with another dev", category: "people", defaultWeightPct: 15, isBooster: false },
  { key: "complex_testing", label: "Complex env / device / hardware testing", category: "environment", defaultWeightPct: 15, isBooster: false },
  { key: "unfamiliar_stack", label: "First time in this repo / stack", category: "code", defaultWeightPct: 20, isBooster: false },
  { key: "reusable_pattern", label: "Reusable pattern / boilerplate exists", category: "booster", defaultWeightPct: -15, isBooster: true },
];
