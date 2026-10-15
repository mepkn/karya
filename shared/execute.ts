/** Pure Execute-tab logic (brief §7): slice normalization, timer math, pacing, the dial's arcs. */

export const PHASES = ["setup", "core", "ui", "testing", "other"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = { setup: "Setup", core: "Core", ui: "UI", testing: "Testing", other: "Other" };

export const MIN_SLICES = 3;
export const MAX_SLICES = 8;
export const MAX_TITLE_CHARS = 60;
const ROUND_SECONDS = 300;

export type SliceDraft = { title: string; phase: Phase; allocatedSeconds: number };

/**
 * The AI's slices rescaled to sum exactly to the target (brief §7a): each is
 * rounded to the nearest 5 minutes and the remainder goes onto the largest.
 * Keeps the first MAX_SLICES; fewer than MIN_SLICES is an error for the caller.
 */
export function normalizeSlices(
  raw: { title: string; phase: string; allocatedHours: number }[],
  targetHours: number,
): SliceDraft[] {
  const usable = raw
    .map((s) => ({
      title: s.title.trim().slice(0, MAX_TITLE_CHARS),
      phase: (PHASES as readonly string[]).includes(s.phase) ? (s.phase as Phase) : "other",
      hours: Number.isFinite(s.allocatedHours) && s.allocatedHours > 0 ? s.allocatedHours : 0,
    }))
    .filter((s) => s.title.length > 0)
    .slice(0, MAX_SLICES);
  if (usable.length < MIN_SLICES) return [];

  const target = targetSeconds(targetHours);
  const total = usable.reduce((sum, s) => sum + s.hours, 0);
  // All-zero allocations from the model: split evenly.
  const shares = usable.map((s) => (total > 0 ? s.hours / total : 1 / usable.length));
  const slices = usable.map((s, i) => ({
    title: s.title,
    phase: s.phase,
    allocatedSeconds: Math.max(ROUND_SECONDS, Math.round((shares[i] * target) / ROUND_SECONDS) * ROUND_SECONDS),
  }));
  let largest = 0;
  slices.forEach((s, i) => {
    if (s.allocatedSeconds > slices[largest].allocatedSeconds) largest = i;
  });
  const sum = slices.reduce((acc, s) => acc + s.allocatedSeconds, 0);
  slices[largest].allocatedSeconds += target - sum;
  return slices;
}

/** The target in whole minutes, so a plan edited in minutes can match it exactly. */
export function targetSeconds(targetHours: number): number {
  return Math.round(targetHours * 60) * 60;
}

/** Problem with a plan before it can be locked, or null. */
export function validatePlan(slices: SliceDraft[], targetHours: number): string | null {
  if (slices.length === 0) return "Add at least one slice.";
  if (slices.length > MAX_SLICES) return `Keep the plan to ${MAX_SLICES} slices or fewer.`;
  if (slices.some((s) => !s.title.trim())) return "Every slice needs a title.";
  if (slices.some((s) => !Number.isFinite(s.allocatedSeconds) || s.allocatedSeconds < 60)) return "Every slice needs at least a minute.";
  const sum = slices.reduce((acc, s) => acc + s.allocatedSeconds, 0);
  if (sum !== targetSeconds(targetHours)) return "Allocated time must match the target.";
  return null;
}

// ---- Timer (brief §7c) ----

export type TimerSlice = { elapsedSeconds: number; lastStartedAt?: number };

/** Seconds worked on a slice, counting the running stretch if it is active. */
export function liveElapsed(s: TimerSlice, now: number): number {
  return s.elapsedSeconds + (s.lastStartedAt === undefined ? 0 : Math.max(0, now - s.lastStartedAt) / 1000);
}

export const IDLE_GUARD_SECONDS = 3 * 3600;

export type ColorState = "calm" | "wrap" | "over";

/** brief §7d: teal below 75 %, amber to 90 %, rose from 90 %. */
export function colorState(elapsed: number, allocated: number): ColorState {
  const ratio = allocated > 0 ? elapsed / allocated : 1;
  if (ratio < 0.75) return "calm";
  if (ratio < 0.9) return "wrap";
  return "over";
}

/** `42:10`, `1:05:00`, or `-3:20` for overtime. */
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.floor(Math.abs(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${m}:${pad(s)}`;
}

/** `45m`, `1h 20m`. */
export function formatMinutes(seconds: number): string {
  const total = Math.round(Math.abs(seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---- Pacing ring (brief §7b) ----

export type PacingSlice = TimerSlice & { allocatedSeconds: number; status: string };

/**
 * Share of the target spent vs share of the planned work done. Work done is the
 * completed slices' allocations plus the active slice's progress, capped at
 * its allocation. `aheadSeconds` > 0 means ahead of pace.
 */
export function pacing(slices: PacingSlice[], targetSecs: number, now: number) {
  let spent = 0;
  let done = 0;
  for (const s of slices) {
    const elapsed = liveElapsed(s, now);
    spent += elapsed;
    done += s.status === "completed" ? s.allocatedSeconds : Math.min(elapsed, s.allocatedSeconds);
  }
  const target = Math.max(1, targetSecs);
  return {
    spentSeconds: spent,
    doneSeconds: done,
    spentPct: Math.min(1, spent / target),
    donePct: Math.min(1, done / target),
    aheadSeconds: done - spent,
  };
}

// ---- SVG arcs ----

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * SVG path for an arc of radius r, clockwise from startDeg to endDeg, with 0°
 * at 12 o'clock. A sweep of 360° or more is drawn as two half circles, since a
 * single arc command cannot start and end on the same point.
 */
export function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg;
  if (sweep <= 0) return "";
  if (sweep >= 360) {
    const top = polar(cx, cy, r, startDeg);
    const bottom = polar(cx, cy, r, startDeg + 180);
    return `M ${fmt(top.x)} ${fmt(top.y)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(bottom.x)} ${fmt(bottom.y)} A ${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(top.x)} ${fmt(top.y)}`;
  }
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${fmt(start.x)} ${fmt(start.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} 1 ${fmt(end.x)} ${fmt(end.y)}`;
}

/** Start/end angles of each slice on the inner ring, proportional to allocation, with gaps. */
export function sliceAngles(allocations: number[], gapDeg = 2): { start: number; end: number }[] {
  const total = allocations.reduce((a, b) => a + b, 0);
  if (total <= 0) return allocations.map(() => ({ start: 0, end: 0 }));
  const gap = allocations.length > 1 ? gapDeg : 0;
  let at = 0;
  return allocations.map((a) => {
    const span = (a / total) * 360;
    const seg = { start: at + gap / 2, end: Math.max(at + gap / 2, at + span - gap / 2) };
    at += span;
    return seg;
  });
}

// ---- Focus days ----

/** `≈ 1.5 focus days`: seconds of work over the user's daily focus hours, to one decimal. */
export function formatFocusDays(seconds: number, dailyFocusHours: number): string {
  if (!(dailyFocusHours > 0)) return "";
  const days = Math.max(0, seconds) / 3600 / dailyFocusHours;
  const shown = days > 0 && days < 0.1 ? 0.1 : Math.round(days * 10) / 10;
  return `≈ ${shown} focus ${shown === 1 ? "day" : "days"}`;
}
