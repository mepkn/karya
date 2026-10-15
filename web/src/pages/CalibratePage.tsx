import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { PHASE_LABEL, type Phase } from "@shared/execute";
import { MIN_SAMPLES } from "@shared/calibration";
import { CATEGORY_LABEL, type Category } from "@shared/scope";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { signedPct } from "@/components/calibrate/format";

type Overview = NonNullable<FunctionReturnType<typeof api.calibration.overview>>;

/** brief §8: what your completed tickets say about your estimates. */
export function CalibratePage() {
  const data = useQuery(api.calibration.overview);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Calibration</h1>
      {data === undefined ? (
        <Skeleton className="h-64" />
      ) : data === null || data.ticketCount === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Calibration appears after you complete a few tickets. Estimate, execute and mark tickets complete; after {MIN_SAMPLES} with the same pain
          point, Karya suggests your personal weight for it.
        </div>
      ) : (
        <>
          <Fudge data={data} />
          <Tuner data={data} />
          <div className="grid gap-4 md:grid-cols-2">
            <Heatmap data={data} />
            <ScopeStats data={data} />
          </div>
        </>
      )}
    </div>
  );
}

const ratio = (r: number | null) => (r === null ? "—" : `${r.toFixed(2)}×`);

function Fudge({ data }: { data: Overview }) {
  const { trend, vsTarget, vsGut } = data.fudge;
  const max = Math.max(1.5, ...trend.map((t) => t.vsTarget));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fudge factor</CardTitle>
        <CardDescription>Actual time over the estimate, averaged across your last 10 completed tickets. 1.00× is spot on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-8">
          <Stat label="Actual / target (E_final)" value={ratio(vsTarget)} tone={vsTarget !== null && vsTarget > 1.1 ? "text-over" : "text-done"} />
          <Stat label="Actual / gut (M) — how wrong your gut is" value={ratio(vsGut)} tone="text-foreground" />
        </div>
        {trend.length > 1 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Actual / target per ticket, oldest first</p>
            <div className="relative flex h-24 items-end gap-1 border-b" role="img" aria-label={trend.map((t) => `${t.jiraKey} ${ratio(t.vsTarget)}`).join(", ")}>
              <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/50" style={{ bottom: `${(1 / max) * 100}%` }} aria-hidden />
              {trend.map((t) => (
                <div
                  key={`${t.jiraKey}-${t.completedAt}`}
                  title={`${t.jiraKey}: ${ratio(t.vsTarget)}`}
                  className={cn("min-w-1 flex-1 rounded-t", t.vsTarget > 1 ? "bg-over/70" : "bg-done/70")}
                  style={{ height: `${(Math.min(t.vsTarget, max) / max) * 100}%` }}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <p className={cn("font-mono text-3xl font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Tuner({ data }: { data: Overview }) {
  const apply = useMutation(api.calibration.applySuggestion);
  const reset = useMutation(api.calibration.resetWeight);
  const run = (p: Promise<unknown>, ok: string) => p.then(() => toast.success(ok), (err: unknown) => toast.error(errorMessage(err)));
  const rows = [...data.painPoints].sort((a, b) => b.sampleCount - a.sampleCount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pain-point auto-tuner</CardTitle>
        <CardDescription>
          Each ticket's overrun against its plain PERT estimate is shared across the pain points you ticked, after taking out your usual overrun and any
          AI factors. A suggestion appears after {MIN_SAMPLES} tickets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {rows.map((p) => {
            const changed = p.personalWeightPct !== p.defaultWeightPct;
            return (
              <li key={p.key} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Default {signedPct(p.defaultWeightPct)}
                    {changed && <> · using {signedPct(p.personalWeightPct)}</>}
                    {p.historyPct !== null && (
                      <>
                        {" "}
                        · your history {signedPct(p.historyPct)} across {p.sampleCount} ticket{p.sampleCount === 1 ? "" : "s"}
                      </>
                    )}
                    {p.sampleCount > 0 && p.sampleCount < MIN_SAMPLES && <> (needs {MIN_SAMPLES})</>}
                  </p>
                </div>
                {p.suggestedPct !== null && p.suggestedPct !== p.personalWeightPct && (
                  <Button size="sm" onClick={() => run(apply({ key: p.key }), `${p.label} set to ${signedPct(p.suggestedPct ?? 0)}`)}>
                    Apply {signedPct(p.suggestedPct)}
                  </Button>
                )}
                {changed && (
                  <Button size="sm" variant="outline" onClick={() => run(reset({ key: p.key }), `${p.label} back to default`)}>
                    Reset to default
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function Heatmap({ data }: { data: Overview }) {
  const worst = Math.max(...data.phases.map((p) => p.overrunPct ?? -Infinity));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where time leaks</CardTitle>
        <CardDescription>Average slice overrun against the plan, and +15m shield draws, by phase.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.phases.map((p) => {
          const o = p.overrunPct;
          const tone = o === null ? "bg-muted/40" : o > 25 ? "bg-over/30" : o > 0 ? "bg-wrap/25" : "bg-done/20";
          return (
            <div key={p.phase} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm", tone, o !== null && o === worst && o > 0 && "ring-1 ring-over")}>
              <span className="w-16 font-medium">{PHASE_LABEL[p.phase as Phase]}</span>
              <span className="flex-1 font-mono tabular-nums">{o === null ? "—" : signedPct(o)}</span>
              <span className="text-xs text-muted-foreground">
                {p.slices} slice{p.slices === 1 ? "" : "s"} · {p.bufferDraws} draw{p.bufferDraws === 1 ? "" : "s"}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ScopeStats({ data }: { data: Overview }) {
  const s = data.scope;
  const top = Math.max(1, ...s.byCategory.map((c) => c.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope creep</CardTitle>
        <CardDescription>What you caught while working on completed tickets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {s.total === 0 ? (
          <p className="text-muted-foreground">Nothing caught yet.</p>
        ) : (
          <>
            <p>
              <strong className="font-mono">{s.perTicket.toFixed(1)}</strong> items per ticket · {Math.round(s.promotedPct)}% promoted ·{" "}
              {Math.round(s.deferredPct)}% deferred · {Math.round(s.dismissedPct)}% dismissed
            </p>
            {s.byCategory.map((c) => (
              <div key={c.category} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2">
                <span className="text-muted-foreground">{CATEGORY_LABEL[c.category as Category]}</span>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-calm" style={{ width: `${(c.count / top) * 100}%` }} />
                </div>
                <span className="text-right font-mono">{c.count}</span>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
