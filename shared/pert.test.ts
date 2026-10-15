import { describe, expect, it } from "vitest";
import { computePert, estimateSummary, normalizeRiskAnalysis, sumPainPointPct, validateOMP } from "./pert";

describe("computePert", () => {
  it("computes base, SD, target, buffer and safe commit", () => {
    const r = computePert({ optimistic: 2, mostLikely: 4, pessimistic: 8, painPointPct: 25, aiPct: 0 });
    expect(r.base).toBeCloseTo(13 / 3);
    expect(r.sd).toBeCloseTo(1);
    expect(r.target).toBeCloseTo((13 / 3) * 1.25);
    expect(r.buffer).toBeCloseTo(2.5);
    expect(r.safeCommit).toBeCloseTo(r.target + r.buffer);
    expect(r.painPointHrs + r.aiHrs).toBeCloseTo(r.target - r.base);
  });

  it("clamps total risk to [-40%, +150%]", () => {
    expect(computePert({ optimistic: 1, mostLikely: 1, pessimistic: 1, painPointPct: 140, aiPct: 50 }).riskPct).toBe(150);
    expect(computePert({ optimistic: 1, mostLikely: 1, pessimistic: 1, painPointPct: -15, aiPct: -30 }).riskPct).toBe(-40);
  });

  it("splits risk hours between pain points and AI", () => {
    const r = computePert({ optimistic: 6, mostLikely: 6, pessimistic: 6, painPointPct: 20, aiPct: 10 });
    expect(r.painPointHrs).toBeCloseTo(1.2);
    expect(r.aiHrs).toBeCloseTo(0.6);
  });
});

describe("validateOMP", () => {
  it("accepts ordered positive values", () => expect(validateOMP(1, 2, 3)).toBeNull());
  it("rejects zero", () => expect(validateOMP(0, 2, 3)).not.toBeNull());
  it("rejects out of order", () => expect(validateOMP(3, 2, 4)).not.toBeNull());
});

describe("sumPainPointPct", () => {
  it("adds ticked weights, boosters subtract, unknown keys count 0", () => {
    expect(sumPainPointPct(["a", "b", "x"], { a: 25, b: -15 })).toBe(10);
    expect(sumPainPointPct([], { a: 25 })).toBe(0);
  });
});

describe("estimateSummary", () => {
  it("formats a one-line estimate", () => {
    const r = computePert({ optimistic: 2, mostLikely: 4, pessimistic: 8, painPointPct: 20, aiPct: 0 });
    expect(estimateSummary("ABC-1", r)).toBe("ABC-1: target 5.2h, safe commit 7.6h (PERT 4.3h, risk +20%, ~95% confidence)");
  });
});

describe("normalizeRiskAnalysis", () => {
  it("zeroes invalid factors and drops their subtasks", () => {
    const r = normalizeRiskAnalysis({ isValidFactor: false, impactPercentage: 30, reasoning: " vague ", suggestedSubtasks: ["x"] });
    expect(r).toEqual({ isValidFactor: false, impactPercentage: 0, reasoning: "vague", suggestedSubtasks: [] });
  });
  it("clamps impact to [-30, 50] and keeps at most 2 subtasks only above 20%", () => {
    expect(normalizeRiskAnalysis({ isValidFactor: true, impactPercentage: 80, reasoning: "r", suggestedSubtasks: ["a", "b", "c"] }))
      .toEqual({ isValidFactor: true, impactPercentage: 50, reasoning: "r", suggestedSubtasks: ["a", "b"] });
    expect(normalizeRiskAnalysis({ isValidFactor: true, impactPercentage: -45.4, reasoning: "r", suggestedSubtasks: ["a"] }).impactPercentage).toBe(-30);
    expect(normalizeRiskAnalysis({ isValidFactor: true, impactPercentage: 20, reasoning: "r", suggestedSubtasks: ["a"] }).suggestedSubtasks).toEqual([]);
  });
});
