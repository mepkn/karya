import { useState, type FormEvent } from "react";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { Ban, Check, CircleCheck, Flag, Hand, Pause, Play, Plus, RotateCcw, Scissors, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { IDLE_GUARD_SECONDS, colorState, formatClock, formatMinutes, liveElapsed, targetSeconds } from "@shared/execute";
import { useTicket } from "@/lib/ticket-tabs";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanEditor } from "./PlanEditor";
import { RadialDial } from "./RadialDial";
import { ScopeCatcher } from "./ScopeCatcher";

export function ExecuteTab() {
  const ticket = useTicket();
  const slices = useQuery(api.slices.list, { ticketId: ticket._id });

  if (slices === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (ticket.karyaStatus === "estimated" || ticket.karyaStatus === "sliced") {
    // Remount when the server plan changes (AI slicing), so the editor starts from it.
    return <PlanEditor key={`${ticket._id}:${slices.map((s) => s._id).join(",")}`} ticket={ticket} slices={slices} />;
  }
  return <Cockpit ticket={ticket} slices={slices} />;
}

const PHASE_LABEL: Record<Doc<"slices">["phase"], string> = { setup: "Setup", core: "Core", ui: "UI", testing: "Testing", other: "Other" };

const TONE_TEXT = { calm: "text-calm", wrap: "text-wrap", over: "text-over" } as const;

function optimisticStart(ticketId: Id<"tickets">) {
  return (store: OptimisticLocalStore, { sliceId }: { sliceId: Id<"slices"> }) => {
    const cur = store.getQuery(api.slices.list, { ticketId });
    if (!cur) return;
    const t = Date.now();
    store.setQuery(
      api.slices.list,
      { ticketId },
      cur.map((s) =>
        s._id === sliceId
          ? { ...s, status: "active" as const, lastStartedAt: t, blockedReason: undefined }
          : s.status === "active"
            ? { ...s, status: "paused" as const, elapsedSeconds: Math.round(liveElapsed(s, t)), lastStartedAt: undefined }
            : s,
      ),
    );
  };
}

function optimisticStop(ticketId: Id<"tickets">, status: "paused" | "completed") {
  return (store: OptimisticLocalStore, { sliceId }: { sliceId: Id<"slices"> }) => {
    const cur = store.getQuery(api.slices.list, { ticketId });
    if (!cur) return;
    const t = Date.now();
    store.setQuery(
      api.slices.list,
      { ticketId },
      cur.map((s) => (s._id === sliceId ? { ...s, status, elapsedSeconds: Math.round(liveElapsed(s, t)), lastStartedAt: undefined } : s)),
    );
  };
}

function Cockpit({ ticket, slices }: { ticket: Doc<"tickets">; slices: Doc<"slices">[] }) {
  const ticketId = ticket._id;
  const [selectedId, setSelectedId] = useState<Id<"slices"> | null>(null);
  const active = slices.find((s) => s.status === "active");
  const now = useNow(active !== undefined);

  // Optimistic timer buttons: the dial reacts before the server answers.
  const start = useMutation(api.slices.start).withOptimisticUpdate(optimisticStart(ticketId));
  const pause = useMutation(api.slices.pause).withOptimisticUpdate(optimisticStop(ticketId, "paused"));
  const complete = useMutation(api.slices.complete).withOptimisticUpdate(optimisticStop(ticketId, "completed"));
  const reopen = useMutation(api.slices.reopen);

  const firstOpen = slices.find((s) => s.status !== "completed");
  const selected = slices.find((s) => s._id === selectedId) ?? active ?? firstOpen ?? slices[0];
  const target = targetSeconds(ticket.targetHours ?? 0);

  if (!selected) {
    return <p className="text-sm text-muted-foreground">This plan has no slices. Reset the estimate to plan again.</p>;
  }

  const elapsed = liveElapsed(selected, now);
  const remaining = selected.allocatedSeconds - elapsed;
  const tone = colorState(elapsed, selected.allocatedSeconds);
  const isActive = selected.status === "active";
  const isDone = selected.status === "completed";
  const next = slices.find((s) => s.order > selected.order && s.status !== "completed");
  const allDone = slices.every((s) => s.status === "completed");
  const ticketDone = ticket.karyaStatus === "completed";

  const run = (p: Promise<unknown>, fallback: string) => p.catch((err: unknown) => toast.error(errorMessage(err, fallback)));

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-4">
        <RadialDial slices={slices} targetSecs={target} now={now} selectedId={selected._id} onSelect={setSelectedId}>
          <span className="text-xs tracking-wide text-muted-foreground uppercase">{PHASE_LABEL[selected.phase]}</span>
          <span className="line-clamp-2 text-sm font-medium">{selected.title}</span>
          <span
            className={cn("mt-1 font-mono text-4xl font-semibold tabular-nums", isDone ? "text-done" : isActive ? TONE_TEXT[tone] : "text-foreground")}
            aria-label={remaining < 0 ? `${formatMinutes(-remaining)} over` : `${formatMinutes(remaining)} remaining`}
          >
            {isDone ? formatMinutes(elapsed) : formatClock(remaining)}
          </span>
          <span className="text-xs text-muted-foreground">
            {isDone ? "spent, done" : remaining < 0 ? `overtime on ${formatMinutes(selected.allocatedSeconds)}` : `left of ${formatMinutes(selected.allocatedSeconds)}`}
          </span>
          <div className={cn("mt-2 flex gap-2", ticketDone && "hidden")}>
            {isDone ? (
              <Button size="sm" variant="outline" onClick={() => run(reopen({ sliceId: selected._id }), "Could not reopen.")}>
                <RotateCcw /> Reopen
              </Button>
            ) : (
              <>
                {isActive ? (
                  <Button size="sm" variant="outline" onClick={() => run(pause({ sliceId: selected._id }), "Could not pause.")}>
                    <Pause /> Pause
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => run(start({ sliceId: selected._id }), "Could not start.")}>
                    <Play /> Play
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => run(complete({ sliceId: selected._id }), "Could not complete.")}>
                  <Check /> Done
                </Button>
              </>
            )}
          </div>
          {next && <span className="mt-2 line-clamp-1 text-xs text-muted-foreground">Next: {next.title}</span>}
        </RadialDial>

        {!isDone && isActive && tone === "wrap" && (
          <p className="max-w-sm rounded-lg border border-wrap/40 bg-wrap/10 px-3 py-2 text-center text-sm text-wrap">
            Wrap-up zone — focus on the happy path, park the polish.
          </p>
        )}
        {!ticketDone && !isDone && elapsed > 0 && tone === "over" && <PacingCheck ticket={ticket} slice={selected} />}
        {selected.blockedReason && (
          <p className="flex max-w-sm items-center gap-2 text-sm text-over">
            <Ban className="size-4 shrink-0" /> Blocked: {selected.blockedReason}
          </p>
        )}
        <ScopeCatcher ticket={ticket} slices={slices} stampSliceId={active?._id ?? (isDone ? undefined : selected._id)} />
      </div>

      <div className="space-y-4">
        <BufferShield ticket={ticket} />
        {(allDone || ticketDone) && <Completion ticket={ticket} />}
        <ol className="space-y-1" aria-label="Slices">
          {slices.map((s) => (
            <SliceRow key={s._id} slice={s} now={now} selected={s._id === selected._id} onSelect={() => setSelectedId(s._id)} />
          ))}
        </ol>
      </div>

      {active && <IdleGuard slice={active} now={now} />}
    </div>
  );
}

function SliceRow({ slice, now, selected, onSelect }: { slice: Doc<"slices">; now: number; selected: boolean; onSelect: () => void }) {
  const elapsed = liveElapsed(slice, now);
  const saved = slice.allocatedSeconds - elapsed;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary/60 bg-accent" : "border-transparent",
        )}
      >
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            slice.status === "completed" ? "bg-done" : slice.status === "active" ? "bg-calm animate-pulse" : slice.blockedReason ? "bg-over" : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        <span className={cn("min-w-0 flex-1 truncate", slice.status === "completed" && "text-muted-foreground line-through")}>{slice.title}</span>
        {slice.isBonus && <span className="shrink-0 rounded-full border border-done/50 px-1.5 text-xs text-done">Bonus</span>}
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatMinutes(elapsed)} / {formatMinutes(slice.allocatedSeconds)}
        </span>
        {slice.status === "completed" && Math.round(saved / 60) > 0 && <span className="shrink-0 text-xs text-done">Saved {formatMinutes(saved)}</span>}
        <span className="sr-only">{slice.blockedReason ? "blocked" : slice.status}</span>
      </button>
    </li>
  );
}

/** brief §7f: mark the ticket complete once every slice is done; reopen asks first. */
function Completion({ ticket }: { ticket: Doc<"tickets"> }) {
  const completeTicket = useMutation(api.slices.completeTicket);
  const reopenTicket = useMutation(api.slices.reopenTicket);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(p: Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await p;
      toast.success(ok);
      setConfirmReopen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (ticket.karyaStatus !== "completed") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-done/40 bg-done/10 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-done">
          <CircleCheck className="size-4" /> All slices done.
        </span>
        <Button size="sm" className="ml-auto" disabled={busy} onClick={() => act(completeTicket({ ticketId: ticket._id }), "Ticket complete")}>
          <Flag /> Mark ticket complete
        </Button>
      </div>
    );
  }

  const actual = ticket.actualTotalSeconds ?? 0;
  const target = targetSeconds(ticket.targetHours ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-done/40 bg-done/10 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-done">
        <CircleCheck className="size-4" /> Completed
        {ticket.completedAt && ` ${new Date(ticket.completedAt).toLocaleDateString()}`}
      </span>
      <span className="text-muted-foreground">
        Actual <strong className="text-foreground">{formatMinutes(actual)}</strong> vs target {formatMinutes(target)}
      </span>
      <Button size="sm" variant="outline" className="ml-auto" onClick={() => setConfirmReopen(true)}>
        <RotateCcw /> Reopen
      </Button>
      <Dialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {ticket.jiraKey}?</DialogTitle>
            <DialogDescription>It goes back to in progress and drops out of calibration until you complete it again. Slice time is kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReopen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => act(reopenTicket({ ticketId: ticket._id }), "Ticket reopened")}>
              Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** brief §7e: buffer left vs total; red at zero. */
function BufferShield({ ticket }: { ticket: Doc<"tickets"> }) {
  const total = ticket.bufferShieldSeconds ?? 0;
  const left = Math.max(0, total - ticket.bufferUsedSeconds);
  const pct = total > 0 ? (left / total) * 100 : 0;
  const empty = total > 0 && left === 0;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className={cn("size-4", empty ? "text-over" : "text-calm")} /> Buffer shield
        </span>
        <span className={cn("font-mono text-xs tabular-nums", empty ? "text-over" : "text-muted-foreground")}>
          {empty ? "At risk · " : ""}
          {formatMinutes(left)} / {formatMinutes(total)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Buffer left"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={left}
      >
        <div className={cn("h-full rounded-full transition-[width]", empty ? "bg-over" : pct < 34 ? "bg-wrap" : "bg-calm")} style={{ width: `${empty ? 100 : pct}%` }} />
      </div>
    </div>
  );
}

/** brief §7d: at 90 % of the allocation. */
function PacingCheck({ ticket, slice }: { ticket: Doc<"tickets">; slice: Doc<"slices"> }) {
  const drawBuffer = useMutation(api.slices.drawBuffer);
  const scopeCut = useMutation(api.slices.scopeCut);
  const block = useMutation(api.slices.block);
  const [mode, setMode] = useState<"cut" | "block" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const bufferLeft = (ticket.bufferShieldSeconds ?? 0) - ticket.bufferUsedSeconds;

  async function act(p: Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await p;
      toast.success(ok);
      setMode(null);
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "cut") void act(scopeCut({ sliceId: slice._id, note }), "Slice done, the rest is parked");
    else if (mode === "block") void act(block({ sliceId: slice._id, reason: note }), "Marked blocked");
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-over/40 bg-over/10 p-3">
      <p className="mb-2 text-sm font-medium text-over">Pacing check</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || bufferLeft <= 0} onClick={() => act(drawBuffer({ sliceId: slice._id }), "Moved time from the shield")}>
          <Plus /> {bufferLeft > 0 ? `${formatMinutes(Math.min(900, bufferLeft))} from shield` : "Shield empty"}
        </Button>
        <Button size="sm" variant={mode === "cut" ? "secondary" : "outline"} disabled={busy} onClick={() => setMode(mode === "cut" ? null : "cut")}>
          <Scissors /> Scope cut
        </Button>
        <Button size="sm" variant={mode === "block" ? "secondary" : "outline"} disabled={busy} onClick={() => setMode(mode === "block" ? null : "block")}>
          <Hand /> Blocked
        </Button>
      </div>
      {mode && (
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <Input
            autoFocus
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "cut" ? "What's left, to park for later" : "Blocked on…"}
            aria-label={mode === "cut" ? "Remaining work" : "Blocked reason"}
          />
          <Button size="sm" type="submit" disabled={busy || !note.trim()}>
            Save
          </Button>
        </form>
      )}
    </div>
  );
}

/** brief §7c: a slice running 3h+ without a break asks before counting it all. */
function IdleGuard({ slice, now }: { slice: Doc<"slices">; now: number }) {
  const trim = useMutation(api.slices.trim);
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const [minutes, setMinutes] = useState("");
  const stretch = slice.lastStartedAt === undefined ? 0 : (now - slice.lastStartedAt) / 1000;
  const open = stretch > IDLE_GUARD_SECONDS && dismissedFor !== slice.lastStartedAt;
  const suggested = Math.max(0, Math.round((slice.allocatedSeconds - slice.elapsedSeconds) / 60));

  async function keepOnly(e: FormEvent) {
    e.preventDefault();
    const m = Number(minutes || suggested);
    if (!Number.isFinite(m) || m < 0) return;
    try {
      await trim({ sliceId: slice._id, keepSeconds: Math.round(m * 60) });
      toast.success("Timer paused and trimmed");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setDismissedFor(slice.lastStartedAt ?? null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Still working?</DialogTitle>
          <DialogDescription>
            “{slice.title}” has been running for {formatMinutes(stretch)} without a pause.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={keepOnly} className="flex items-center gap-2 text-sm">
          <span>Count only</span>
          <Input type="number" min="0" step="5" className="w-24" value={minutes} placeholder={String(suggested)} onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes to keep" />
          <span>min of it, then pause</span>
          <Button type="submit" size="sm" variant="outline">
            Trim
          </Button>
        </form>
        <DialogFooter>
          <Button onClick={() => setDismissedFor(slice.lastStartedAt ?? null)}>Keep all {formatMinutes(stretch)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
