/**
 * PERT + risk estimate (brief §6). Hours in, hours out; percentages as whole
 * numbers (25 means +25%).
 */
export const RISK_MIN_PCT = -40;
export const RISK_MAX_PCT = 150;

export type PertInput = {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  painPointPct: number;
  aiPct: number;
};

export type PertResult = {
  base: number;
  sd: number;
  riskPct: number;
  target: number;
  buffer: number;
  safeCommit: number;
  painPointHrs: number;
  aiHrs: number;
};

/** Returns an error message, or null when O ≤ M ≤ P and all are > 0. */
export function validateOMP(o: number, m: number, p: number): string | null {
  if (![o, m, p].every((n) => Number.isFinite(n) && n > 0)) return "All three estimates must be greater than 0.";
  if (!(o <= m && m <= p)) return "Estimates must satisfy optimistic ≤ most likely ≤ pessimistic.";
  return null;
}

export function computePert({ optimistic: o, mostLikely: m, pessimistic: p, painPointPct, aiPct }: PertInput): PertResult {
  const base = (o + 4 * m + p) / 6;
  const sd = (p - o) / 6;
  const riskPct = Math.min(RISK_MAX_PCT, Math.max(RISK_MIN_PCT, painPointPct + aiPct));
  const factor = 1 + riskPct / 100;
  const target = base * factor;
  const buffer = 2 * sd * factor;
  // Split the risk hours between pain points and AI in proportion to their
  // share of the (possibly clamped) total, so the receipt lines add up.
  const rawTotal = painPointPct + aiPct;
  const riskHrs = target - base;
  const painPointHrs = rawTotal === 0 ? 0 : riskHrs * (painPointPct / rawTotal);
  return { base, sd, riskPct, target, buffer, safeCommit: target + buffer, painPointHrs, aiHrs: riskHrs - painPointHrs };
}

/** Sum of the ticked pain points' weights; unknown keys count as 0. */
export function sumPainPointPct(ticked: readonly string[], weights: Readonly<Record<string, number>>): number {
  return ticked.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
}

/** Sum of the accepted AI factors' impact. */
export function sumAiFactorPct(factors: readonly { impactPct: number }[]): number {
  return factors.reduce((sum, f) => sum + f.impactPct, 0);
}

const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;

/** One line to paste into a standup or a ticket comment. */
export function estimateSummary(jiraKey: string, r: PertResult): string {
  const risk = r.riskPct === 0 ? "" : `, risk ${r.riskPct > 0 ? "+" : ""}${Math.round(r.riskPct)}%`;
  return `${jiraKey}: target ${hrs(r.target)}, safe commit ${hrs(r.safeCommit)} (PERT ${hrs(r.base)}${risk}, ~95% confidence)`;
}

export type RiskAnalysis = {
  isValidFactor: boolean;
  impactPercentage: number;
  reasoning: string;
  suggestedSubtasks: string[];
};

export const AI_IMPACT_MIN_PCT = -30;
export const AI_IMPACT_MAX_PCT = 50;

/** Enforces the analyzer's rules (brief §9) whatever the model returned. */
export function normalizeRiskAnalysis(raw: RiskAnalysis): RiskAnalysis {
  const impact = raw.isValidFactor
    ? Math.min(AI_IMPACT_MAX_PCT, Math.max(AI_IMPACT_MIN_PCT, Math.round(raw.impactPercentage)))
    : 0;
  const subtasks = impact > 20 ? raw.suggestedSubtasks.map((s) => s.trim()).filter(Boolean).slice(0, 2) : [];
  return { isValidFactor: raw.isValidFactor, impactPercentage: impact, reasoning: raw.reasoning.trim(), suggestedSubtasks: subtasks };
}
