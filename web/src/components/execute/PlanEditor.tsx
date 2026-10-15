import { useState } from "react";
import { Link } from "react-router";
import { useAction, useMutation } from "convex/react";
import { ArrowDown, ArrowUp, GripVertical, Lock, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { MAX_SLICES, PHASE_LABEL, MAX_TITLE_CHARS, PHASES, formatMinutes, targetSeconds, validatePlan, type Phase } from "@shared/execute";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Row = { key: string; title: string; phase: Phase; minutes: string };

const toRow = (s: { title: string; phase: Phase; allocatedSeconds: number }): Row => ({
  key: crypto.randomUUID(),
  title: s.title,
  phase: s.phase,
  minutes: String(Math.round(s.allocatedSeconds / 60)),
});

const seconds = (r: Row) => {
  const m = Number(r.minutes);
  return Number.isFinite(m) ? Math.round(m) * 60 : NaN;
};

/** brief §7a: slice with AI or by hand, edit, then lock when the total matches the target. */
export function PlanEditor({ ticket, slices }: { ticket: Doc<"tickets">; slices: Doc<"slices">[] }) {
  const sliceAi = useAction(api.ai.sliceTicket);
  const savePlan = useMutation(api.slices.savePlan);
  const [rows, setRows] = useState<Row[]>(() => slices.map(toRow));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"ai" | "save" | "lock" | null>(null);
  const [aiError, setAiError] = useState<{ text: string; needsKey?: boolean } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const target = targetSeconds(ticket.targetHours ?? 0);
  const allocated = rows.reduce((sum, r) => sum + (seconds(r) || 0), 0);
  const drafts = rows.map((r) => ({ title: r.title, phase: r.phase, allocatedSeconds: seconds(r) }));
  const problem = validatePlan(drafts, ticket.targetHours ?? 0);
  const titles = new Set(rows.map((r) => r.title.trim().toLowerCase()));
  const suggestions = [...new Set((ticket.aiFactors ?? []).flatMap((f) => f.suggestedSubtasks))].filter((s) => !titles.has(s.toLowerCase()));

  function update(next: Row[]) {
    setRows(next);
    setDirty(true);
  }
  const edit = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    update(next);
  }
  const add = (title = "") => update([...rows, { key: crypto.randomUUID(), title, phase: "other", minutes: "30" }]);

  async function runAi() {
    setBusy("ai");
    setAiError(null);
    try {
      const res = await sliceAi({ ticketId: ticket._id });
      if (!res.ok) setAiError({ text: res.error, needsKey: res.needsKey });
      else {
        setRows(res.result.map(toRow));
        setDirty(false);
        toast.success(`Sliced via ${res.provider === "groq" ? "Groq" : "Gemini"}`);
      }
    } catch (err) {
      setAiError({ text: errorMessage(err, "Slicing failed. Try again.") });
    } finally {
      setBusy(null);
    }
  }

  async function save(lock: boolean) {
    setBusy(lock ? "lock" : "save");
    try {
      await savePlan({ ticketId: ticket._id, slices: drafts, lock });
      setDirty(false);
      toast.success(lock ? "Plan locked, timer started" : "Plan saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the plan."));
    } finally {
      setBusy(null);
    }
  }

  const diff = target - allocated;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runAi} disabled={busy !== null}>
          {busy === "ai" ? <Spinner /> : <Sparkles />} {rows.length ? "Re-slice with AI" : "Slice with AI"}
        </Button>
        <Button variant="outline" onClick={() => add()} disabled={busy !== null || rows.length >= MAX_SLICES}>
          <Plus /> Add slice
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">Target {formatMinutes(target)}</span>
      </div>

      {aiError && (
        <Alert variant="destructive">
          <AlertDescription>
            {aiError.text}{" "}
            {aiError.needsKey && (
              <Link to="/settings" className="underline">
                Open Settings
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Suggested by AI factors:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={rows.length >= MAX_SLICES}
              onClick={() => add(s.slice(0, MAX_TITLE_CHARS))}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Plus className="size-3" /> {s}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No slices yet. Slice with AI, or add slices by hand.
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.key}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) move(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={cn("flex items-center gap-2 rounded-lg border bg-card p-2", dragging === i && "opacity-50")}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
              <span className="w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <Input
                aria-label={`Slice ${i + 1} title`}
                value={r.title}
                maxLength={MAX_TITLE_CHARS}
                placeholder="What gets done"
                onChange={(e) => edit(i, { title: e.target.value })}
                className="min-w-0 flex-1"
              />
              <select
                aria-label={`Slice ${i + 1} phase`}
                value={r.phase}
                onChange={(e) => edit(i, { phase: e.target.value as Phase })}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p} className="bg-popover">
                    {PHASE_LABEL[p]}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <Input
                  aria-label={`Slice ${i + 1} minutes`}
                  type="number"
                  min="1"
                  step="5"
                  value={r.minutes}
                  onChange={(e) => edit(i, { minutes: e.target.value })}
                  className="w-20 text-right"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Remove slice" onClick={() => update(rows.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="text-sm" aria-live="polite">
          Allocated <strong className={cn(diff === 0 ? "text-done" : "text-wrap")}>{formatMinutes(allocated)}</strong> / Target{" "}
          <strong>{formatMinutes(target)}</strong>
          {diff !== 0 && rows.length > 0 && (
            <span className="ml-2 text-muted-foreground">
              ({formatMinutes(diff)} {diff > 0 ? "left to allocate" : "over"})
            </span>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={busy !== null || !dirty || rows.some((r) => !r.title.trim())}>
            {busy === "save" ? <Spinner /> : <Save />} {dirty ? "Save draft" : "Saved"}
          </Button>
          <Button onClick={() => save(true)} disabled={busy !== null || problem !== null} title={problem ?? undefined}>
            {busy === "lock" ? <Spinner /> : <Lock />} Lock plan & start
          </Button>
        </div>
      </div>
      {problem && rows.length > 0 && <p className="text-right text-xs text-muted-foreground">{problem}</p>}
    </div>
  );
}
