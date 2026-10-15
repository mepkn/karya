import { describe, expect, it } from "vitest";
import { computePert, validateOMP } from "./pert";

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
