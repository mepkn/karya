import { describe, expect, it } from "vitest";
import { colorState, describeArc, formatClock, formatFocusDays, liveElapsed, normalizeSlices, pacing, sliceAngles, validatePlan } from "./execute";

const raw = (hours: number[]) => hours.map((h, i) => ({ title: `Slice ${i + 1}`, phase: "core", allocatedHours: h }));

describe("normalizeSlices", () => {
  it("rescales to the target exactly, in 5-minute steps, remainder on the largest", () => {
    const out = normalizeSlices(raw([1, 2, 1]), 5.13);
    expect(out.reduce((a, s) => a + s.allocatedSeconds, 0)).toBe(308 * 60);
    expect(out[0].allocatedSeconds % 300).toBe(0);
    expect(out[2].allocatedSeconds % 300).toBe(0);
    expect(out[1].allocatedSeconds).toBeGreaterThan(out[0].allocatedSeconds);
  });
  it("keeps at most 8 slices and refuses fewer than 3", () => {
    expect(normalizeSlices(raw([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 8)).toHaveLength(8);
    expect(normalizeSlices(raw([1, 1]), 2)).toEqual([]);
  });
  it("splits evenly when the model gives no hours, and fixes unknown phases and long titles", () => {
    const out = normalizeSlices([{ title: "x".repeat(80), phase: "deploy", allocatedHours: 0 }, ...raw([0, 0])], 3);
    expect(out.map((s) => s.allocatedSeconds)).toEqual([3600, 3600, 3600]);
    expect(out[0].phase).toBe("other");
    expect(out[0].title).toHaveLength(60);
  });
});

describe("validatePlan", () => {
  const s = (sec: number) => ({ title: "a", phase: "core" as const, allocatedSeconds: sec });
  it("needs the allocations to match the target", () => {
    expect(validatePlan([s(1800), s(1800)], 1)).toBeNull();
    expect(validatePlan([s(1800)], 1)).toMatch(/match/);
    expect(validatePlan([], 1)).toMatch(/at least/);
  });
});

describe("timer", () => {
  it("adds the running stretch to the stored elapsed time", () => {
    expect(liveElapsed({ elapsedSeconds: 100 }, 5000)).toBe(100);
    expect(liveElapsed({ elapsedSeconds: 100, lastStartedAt: 1000 }, 61_000)).toBe(160);
    // A clock behind lastStartedAt never subtracts time.
    expect(liveElapsed({ elapsedSeconds: 100, lastStartedAt: 9000 }, 5000)).toBe(100);
  });
  it("colours by share of the allocation", () => {
    expect(colorState(10, 100)).toBe("calm");
    expect(colorState(75, 100)).toBe("wrap");
    expect(colorState(90, 100)).toBe("over");
    expect(colorState(150, 100)).toBe("over");
  });
  it("formats clocks, including overtime", () => {
    expect(formatClock(2530)).toBe("42:10");
    expect(formatClock(3900)).toBe("1:05:00");
    expect(formatClock(-200)).toBe("-3:20");
  });
});

describe("pacing", () => {
  it("compares time spent with work done", () => {
    const p = pacing(
      [
        { status: "completed", allocatedSeconds: 3600, elapsedSeconds: 2400 },
        { status: "active", allocatedSeconds: 1800, elapsedSeconds: 600, lastStartedAt: 0 },
        { status: "pending", allocatedSeconds: 1800, elapsedSeconds: 0 },
      ],
      7200,
      600_000,
    );
    expect(p.spentSeconds).toBe(3600);
    expect(p.doneSeconds).toBe(3600 + 1200);
    expect(p.aheadSeconds).toBe(1200);
  });
  it("caps the active slice's progress at its allocation", () => {
    const p = pacing([{ status: "active", allocatedSeconds: 600, elapsedSeconds: 900 }], 1200, 0);
    expect(p.doneSeconds).toBe(600);
    expect(p.aheadSeconds).toBe(-300);
  });
});

describe("describeArc", () => {
  it("draws a quarter arc clockwise from 12 o'clock", () => {
    expect(describeArc(50, 50, 40, 0, 90)).toBe("M 50 10 A 40 40 0 0 1 90 50");
  });
  it("sets the large-arc flag past 180°", () => {
    expect(describeArc(50, 50, 40, 0, 270)).toBe("M 50 10 A 40 40 0 1 1 10 50");
  });
  it("draws a full circle as two halves", () => {
    expect(describeArc(50, 50, 40, 0, 360)).toBe("M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10");
  });
  it("draws nothing for an empty sweep", () => {
    expect(describeArc(50, 50, 40, 90, 90)).toBe("");
  });
});

describe("sliceAngles", () => {
  it("splits the ring by allocation with gaps", () => {
    expect(sliceAngles([1, 3])).toEqual([
      { start: 1, end: 89 },
      { start: 91, end: 359 },
    ]);
    expect(sliceAngles([5])).toEqual([{ start: 0, end: 360 }]);
  });
});

describe("formatFocusDays", () => {
  it("divides by the daily focus hours to one decimal", () => {
    expect(formatFocusDays(8 * 3600, 5.5)).toBe("≈ 1.5 focus days");
    expect(formatFocusDays(5.5 * 3600, 5.5)).toBe("≈ 1 focus day");
    expect(formatFocusDays(0, 5.5)).toBe("≈ 0 focus days");
    expect(formatFocusDays(60, 5.5)).toBe("≈ 0.1 focus days");
    expect(formatFocusDays(3600, 0)).toBe("");
  });
});
