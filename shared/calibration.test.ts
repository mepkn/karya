import { describe, expect, it } from "vitest";
import { fudgeFactor, phaseOverruns, realizedFrictionPct, scopeStats, tunePainPoints, type CompletedTicket } from "./calibration";

const t = (over: Partial<CompletedTicket>): CompletedTicket => ({
  completedAt: 0,
  actualHrs: 10,
  baseHrs: 10,
  targetHrs: 10,
  mostLikelyHrs: 10,
  weights: {},
  aiPct: 0,
  ...over,
});

describe("fudgeFactor", () => {
  it("is null with no tickets", () => {
    expect(fudgeFactor([])).toEqual({ trend: [], vsTarget: null, vsGut: null });
  });

  it("averages the last 10, oldest first", () => {
    const tickets = Array.from({ length: 12 }, (_, i) => t({ completedAt: 12 - i, actualHrs: i < 2 ? 100 : 12, mostLikelyHrs: 6 }));
    const f = fudgeFactor(tickets);
    expect(f.trend.map((r) => r.completedAt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // The two 100h tickets are the newest, so they are inside the window; the two oldest 12h ones are not.
    expect(f.vsTarget).toBeCloseTo((8 * 1.2 + 2 * 10) / 10);
    expect(f.vsGut).toBeCloseTo((8 * 2 + 2 * (100 / 6)) / 10);
  });
});

describe("realizedFrictionPct", () => {
  it("is the overrun against E_base", () => {
    expect(realizedFrictionPct({ actualHrs: 12, baseHrs: 10 })).toBeCloseTo(20);
    expect(realizedFrictionPct({ actualHrs: 8, baseHrs: 10 })).toBeCloseTo(-20);
  });
});

describe("tunePainPoints", () => {
  it("gives a single pain point the whole overrun", () => {
    const s = tunePainPoints([t({ actualHrs: 13.8, weights: { api: 20 } })]);
    expect(s).toEqual([{ key: "api", historyPct: expect.closeTo(38) as number, suggestedPct: 38, sampleCount: 1 }]);
  });

  it("subtracts the no-pain-point baseline first", () => {
    const s = tunePainPoints([t({ actualHrs: 11 }), t({ actualHrs: 13, weights: { api: 20 } })]);
    expect(s[0].historyPct).toBeCloseTo(20);
  });

  it("splits by the size of the weights, boosters included", () => {
    const s = tunePainPoints([t({ actualHrs: 14, weights: { legacy: 30, reuse: -10 } })]);
    const by = Object.fromEntries(s.map((x) => [x.key, x.historyPct]));
    expect(by.legacy).toBeCloseTo(30);
    expect(by.reuse).toBeCloseTo(10);
  });

  it("keeps AI factors out of the weights", () => {
    const s = tunePainPoints([t({ actualHrs: 15, aiPct: 30, weights: { api: 20 } })]);
    expect(s[0].historyPct).toBeCloseTo(20);
  });

  it("averages across tickets and clamps the suggestion", () => {
    const s = tunePainPoints([
      t({ actualHrs: 40, weights: { api: 20 } }),
      t({ actualHrs: 30, weights: { api: 20 } }),
      t({ actualHrs: 20, weights: { api: 20 } }),
    ]);
    expect(s[0]).toMatchObject({ historyPct: 200, suggestedPct: 100, sampleCount: 3 });
    expect(tunePainPoints([t({ actualHrs: 1, weights: { api: 20 } })])[0].suggestedPct).toBe(-30);
  });
});

describe("phaseOverruns", () => {
  it("averages overrun per phase against the planned time", () => {
    const rows = phaseOverruns(
      [
        { phase: "core", plannedSeconds: 3600, elapsedSeconds: 5400, bufferDraws: 2 },
        { phase: "core", plannedSeconds: 3600, elapsedSeconds: 3600, bufferDraws: 0 },
        { phase: "ui", plannedSeconds: 1800, elapsedSeconds: 900, bufferDraws: 0 },
      ],
      ["setup", "core", "ui"],
    );
    expect(rows).toEqual([
      { phase: "setup", slices: 0, overrunPct: null, bufferDraws: 0 },
      { phase: "core", slices: 2, overrunPct: 25, bufferDraws: 2 },
      { phase: "ui", slices: 1, overrunPct: -50, bufferDraws: 0 },
    ]);
  });
});

describe("scopeStats", () => {
  it("counts per ticket, by resolution and category", () => {
    const s = scopeStats(
      [
        { category: "bug", resolution: "promoted_to_slice" },
        { category: "bug", resolution: "deferred_to_backlog" },
        { category: "edge_case", resolution: "deferred_to_backlog" },
        { category: "refactor", resolution: "dismissed" },
      ],
      2,
      ["refactor", "edge_case", "bug"],
    );
    expect(s).toMatchObject({ total: 4, perTicket: 2, promotedPct: 25, deferredPct: 50, dismissedPct: 25 });
    expect(s.byCategory).toEqual([
      { category: "refactor", count: 1 },
      { category: "edge_case", count: 1 },
      { category: "bug", count: 2 },
    ]);
  });
});
