import type { Doc, Id } from "@convex/_generated/dataModel";
import { colorState, describeArc, formatFocusDays, formatMinutes, liveElapsed, pacing, sliceAngles, type ColorState } from "@shared/execute";
import { useDailyFocusHours } from "@/lib/focus";
import { cn } from "@/lib/utils";

const SIZE = 340;
const C = SIZE / 2;
const INNER_R = 128;
const OUTER_R = 156;

const STROKE: Record<ColorState | "done" | "idle", string> = {
  calm: "var(--calm)",
  wrap: "var(--wrap)",
  over: "var(--over)",
  done: "var(--done)",
  idle: "var(--calm)",
};

/**
 * brief §7b: inner ring of slices sized by allocation, outer pacing ring of
 * target time spent vs planned work done. The hub is rendered by the caller
 * over the middle.
 */
export function RadialDial({
  slices,
  targetSecs,
  now,
  selectedId,
  onSelect,
  children,
}: {
  slices: Doc<"slices">[];
  targetSecs: number;
  now: number;
  selectedId: Id<"slices"> | null;
  onSelect: (id: Id<"slices">) => void;
  children: React.ReactNode;
}) {
  const focusHours = useDailyFocusHours();
  const angles = sliceAngles(slices.map((s) => s.allocatedSeconds));
  const pace = pacing(slices, targetSecs, now);
  const spentDeg = pace.spentPct * 360;
  const doneDeg = pace.donePct * 360;
  const ahead = pace.aheadSeconds >= 0;
  const paceLabel = Math.abs(pace.aheadSeconds) < 60 ? "On pace" : `${ahead ? "Ahead" : "Behind"} by ${formatMinutes(pace.aheadSeconds)}`;

  const summary = [
    `${slices.filter((s) => s.status === "completed").length} of ${slices.length} slices done.`,
    `${formatMinutes(pace.spentSeconds)} spent of ${formatMinutes(targetSecs)} target.`,
    `${paceLabel}.`,
  ].join(" ");

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={summary}>
          {/* Outer pacing ring */}
          <circle cx={C} cy={C} r={OUTER_R} fill="none" stroke="var(--muted)" strokeWidth={6} />
          {Math.abs(spentDeg - doneDeg) > 0.5 && (
            <path
              d={describeArc(C, C, OUTER_R, Math.min(spentDeg, doneDeg), Math.max(spentDeg, doneDeg))}
              fill="none"
              stroke={ahead ? "var(--done)" : "var(--wrap)"}
              strokeWidth={6}
              strokeLinecap="round"
            />
          )}
          <Marker deg={spentDeg} color="var(--foreground)" label="Time spent" />
          <Marker deg={doneDeg} color="var(--done)" label="Work done" />

          {/* Inner slice ring */}
          {slices.map((s, i) => {
            const { start, end } = angles[i];
            if (end <= start) return null;
            const elapsed = liveElapsed(s, now);
            const progress = s.status === "completed" ? 1 : Math.min(1, elapsed / Math.max(1, s.allocatedSeconds));
            const tone = s.status === "completed" ? "done" : s.status === "active" ? colorState(elapsed, s.allocatedSeconds) : "idle";
            const selected = s._id === selectedId;
            return (
              <g
                key={s._id}
                className="cursor-pointer"
                onClick={() => onSelect(s._id)}
                aria-hidden
              >
                <title>{s.title}</title>
                <path
                  d={describeArc(C, C, INNER_R, start, end)}
                  fill="none"
                  stroke={s.status === "completed" ? "var(--done)" : "var(--muted)"}
                  strokeWidth={selected ? 24 : 18}
                  opacity={s.status === "completed" ? 0.9 : 1}
                />
                {s.status !== "completed" && progress > 0 && (
                  <path
                    d={describeArc(C, C, INNER_R, start, start + (end - start) * progress)}
                    fill="none"
                    stroke={STROKE[tone]}
                    strokeWidth={selected ? 24 : 18}
                    opacity={s.status === "active" ? 1 : 0.55}
                    className={cn(tone === "over" && "animate-pulse")}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex w-52 flex-col items-center text-center">{children}</div>
        </div>
      </div>
      <p className={cn("text-sm font-medium", Math.abs(pace.aheadSeconds) < 60 ? "text-muted-foreground" : ahead ? "text-done" : "text-wrap")}>
        {paceLabel}
      </p>
      {focusHours !== undefined && (
        <p className="text-xs text-muted-foreground">
          {formatMinutes(Math.max(0, targetSecs - pace.spentSeconds))} of target left, {formatFocusDays(targetSecs - pace.spentSeconds, focusHours)}
        </p>
      )}
      <p className="sr-only" aria-live="off">
        {summary}
      </p>
    </div>
  );
}

function Marker({ deg, color, label }: { deg: number; color: string; label: string }) {
  const rad = ((deg - 90) * Math.PI) / 180;
  const x1 = C + (OUTER_R - 7) * Math.cos(rad);
  const y1 = C + (OUTER_R - 7) * Math.sin(rad);
  const x2 = C + (OUTER_R + 7) * Math.cos(rad);
  const y2 = C + (OUTER_R + 7) * Math.sin(rad);
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round">
      <title>{label}</title>
    </line>
  );
}
