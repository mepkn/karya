/**
 * Calibrate tab math (brief §8). Pure functions over completed tickets, shared
 * by the Convex queries and the tests. Percentages are whole numbers.
 */

export const FUDGE_WINDOW = 10;
export const MIN_SAMPLES = 3;
export const SUGGEST_MIN_PCT = -30;
export const SUGGEST_MAX_PCT = 100;

export type CompletedTicket = {
  completedAt: number;
  actualHrs: number;
  /** PERT E_base, before any risk. */
  baseHrs: number;
  /** E_final, the target after pain points and AI factors. */
  targetHrs: number;
  /** M, the gut guess. */
  mostLikelyHrs: number;
  /** Pain-point weights as they were at estimate time. */
  weights: Record<string, number>;
  /** Sum of accepted AI factors' impact, kept out of the pain-point tuning. */
  aiPct: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---- Fudge factor ----

/**
 * actual / E_final and actual / M per ticket, oldest first, plus their means
 * over the last FUDGE_WINDOW tickets. 1.0 is spot on; 1.3 means 30 % over.
 */
export function fudgeFactor(tickets: CompletedTicket[]) {
  const trend = [...tickets]
    .sort((a, b) => a.completedAt - b.completedAt)
    .map((t) => ({ completedAt: t.completedAt, vsTarget: t.actualHrs / t.targetHrs, vsGut: t.actualHrs / t.mostLikelyHrs }));
  const recent = trend.slice(-FUDGE_WINDOW);
  return {
    trend,
    vsTarget: recent.length ? mean(recent.map((r) => r.vsTarget)) : null,
    vsGut: recent.length ? mean(recent.map((r) => r.vsGut)) : null,
  };
}

// ---- Pain-point auto-tuner ----

/** How far the actual landed above (or below) the plain PERT estimate, in %. */
export function realizedFrictionPct(t: Pick<CompletedTicket, "actualHrs" | "baseHrs">): number {
  return ((t.actualHrs - t.baseHrs) / t.baseHrs) * 100;
}

export type Suggestion = { key: string; historyPct: number; suggestedPct: number; sampleCount: number };

/**
 * Personal impact of each pain point, learned from completed tickets.
 *
 * 1. Each ticket's realized friction is (actual − E_base) / E_base.
 * 2. Tickets with no pain point ticked show the friction you have anyway; their
 *    mean is the baseline, subtracted from every other ticket first (0 when
 *    there are none).
 * 3. The ticket's accepted AI factors claimed some of that friction up front,
 *    so their impact is subtracted too: AI factors are one-off notes, not
 *    pain points, and must not tune the weights.
 * 4. What remains is split across the ticked pain points in proportion to the
 *    size of their weights at estimate time (|w| / Σ|w|): the factor you
 *    thought mattered more takes more of the blame (or credit).
 * 5. A pain point's history is the mean of its shares. Suggestions need
 *    MIN_SAMPLES tickets and are clamped to [SUGGEST_MIN_PCT, SUGGEST_MAX_PCT].
 *
 * So a pain point weighted +20 % on a ticket that overran its PERT by 20 %
 * (with no baseline, no AI factors) gets +20 %: the weight was right.
 */
export function tunePainPoints(tickets: CompletedTicket[]): Suggestion[] {
  const clean = tickets.filter((t) => Object.keys(t.weights).length === 0);
  const baseline = mean(clean.map((t) => realizedFrictionPct(t) - t.aiPct));

  const shares = new Map<string, number[]>();
  for (const t of tickets) {
    const keys = Object.keys(t.weights);
    if (keys.length === 0) continue;
    const excess = realizedFrictionPct(t) - baseline - t.aiPct;
    const total = keys.reduce((s, k) => s + Math.abs(t.weights[k]), 0);
    for (const k of keys) {
      const share = total > 0 ? Math.abs(t.weights[k]) / total : 1 / keys.length;
      shares.set(k, [...(shares.get(k) ?? []), excess * share]);
    }
  }

  return [...shares.entries()].map(([key, xs]) => {
    const historyPct = mean(xs);
    return {
      key,
      historyPct,
      suggestedPct: Math.round(Math.min(SUGGEST_MAX_PCT, Math.max(SUGGEST_MIN_PCT, historyPct))),
      sampleCount: xs.length,
    };
  });
}

// ---- Slice overrun heatmap ----

export type DoneSlice = { phase: string; plannedSeconds: number; elapsedSeconds: number; bufferDraws: number };

/**
 * Per phase: mean overrun of the slices against their planned allocation
 * (before any +15m draws), and how many buffer draws the phase needed.
 */
export function phaseOverruns(slices: DoneSlice[], phases: readonly string[]) {
  return phases.map((phase) => {
    const ps = slices.filter((s) => s.phase === phase && s.plannedSeconds > 0);
    return {
      phase,
      slices: ps.length,
      overrunPct: ps.length ? mean(ps.map((s) => ((s.elapsedSeconds - s.plannedSeconds) / s.plannedSeconds) * 100)) : null,
      bufferDraws: ps.reduce((n, s) => n + s.bufferDraws, 0),
    };
  });
}

// ---- Scope creep stats ----

export function scopeStats(items: { category: string; resolution: string }[], ticketCount: number, categories: readonly string[]) {
  const n = items.length;
  const pct = (r: string) => (n ? (items.filter((i) => i.resolution === r).length / n) * 100 : 0);
  return {
    total: n,
    perTicket: ticketCount ? n / ticketCount : 0,
    promotedPct: pct("promoted_to_slice"),
    deferredPct: pct("deferred_to_backlog"),
    dismissedPct: pct("dismissed"),
    byCategory: categories.map((c) => ({ category: c, count: items.filter((i) => i.category === c).length })),
  };
}
