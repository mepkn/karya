import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, Copy, ExternalLink, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { computePert, estimateSummary, sumAiFactorPct, sumPainPointPct, validateOMP } from "@shared/pert";
import { useTicket } from "@/lib/ticket-tabs";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";

const hrs = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}h`;
const signedHrs = (n: number) => `${n >= 0 ? "+" : "−"}${hrs(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}%`;
const str = (n: number | undefined) => (n === undefined ? "" : String(n));

export function EstimateTab() {
  const ticket = useTicket();
  // Remount per ticket so the draft starts from that ticket's saved values.
  return <Workbench key={ticket._id} ticket={ticket} />;
}

function Workbench({ ticket }: { ticket: Doc<"tickets"> }) {
  const painPoints = useQuery(api.estimates.painPoints);
  const save = useMutation(api.estimates.save);

  const [o, setO] = useState(str(ticket.optimisticHrs));
  const [m, setM] = useState(str(ticket.mostLikelyHrs));
  const [p, setP] = useState(str(ticket.pessimisticHrs));
  const [ticked, setTicked] = useState<string[]>(ticket.tickedPainPoints);
  const [saving, setSaving] = useState(false);
  const removeAiFactor = useMutation(api.estimates.removeAiFactor);
  const aiFactors = ticket.aiFactors ?? [];

  const locked = ticket.karyaStatus === "in_progress" || ticket.karyaStatus === "completed";
  const weights = useMemo(() => Object.fromEntries((painPoints ?? []).map((pp) => [pp.key, pp.personalWeightPct])), [painPoints]);
  const omp = [Number(o), Number(m), Number(p)] as const;
  const filled = o !== "" && m !== "" && p !== "";
  const ompError = filled ? validateOMP(...omp) : null;
  const aiPct = sumAiFactorPct(aiFactors);
  const result =
    filled && !ompError
      ? computePert({ optimistic: omp[0], mostLikely: omp[1], pessimistic: omp[2], painPointPct: sumPainPointPct(ticked, weights), aiPct })
      : null;

  const dirty =
    o !== str(ticket.optimisticHrs) ||
    m !== str(ticket.mostLikelyHrs) ||
    p !== str(ticket.pessimisticHrs) ||
    [...ticked].sort().join() !== [...ticket.tickedPainPoints].sort().join();
  // The saved target differs from the live one when the AI factor changed since saving.
  const staleTarget = ticket.targetHours !== undefined && result !== null && Math.abs(ticket.targetHours - result.target) > 1e-6;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!result || locked) return;
    setSaving(true);
    try {
      await save({ ticketId: ticket._id, optimisticHrs: omp[0], mostLikelyHrs: omp[1], pessimisticHrs: omp[2], tickedPainPoints: ticked });
      toast.success("Estimate saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
      <JiraContext ticket={ticket} />

      <section aria-label="Estimate inputs" className="space-y-6">
        {locked && <LockedNotice ticket={ticket} />}

        <fieldset disabled={locked} className="space-y-3">
          <legend className="text-sm font-medium">Pure coding effort (hours)</legend>
          <p className="text-sm text-muted-foreground">Assume nothing weird goes wrong — risks go below.</p>
          <div className="grid grid-cols-3 gap-3">
            <HoursField id="o" label="Optimistic" value={o} onChange={setO} />
            <HoursField id="m" label="Most likely" value={m} onChange={setM} />
            <HoursField id="p" label="Pessimistic" value={p} onChange={setP} />
          </div>
          {ompError && <FieldError>{ompError}</FieldError>}
        </fieldset>

        <fieldset disabled={locked} className="space-y-3">
          <legend className="text-sm font-medium">Pain points</legend>
          {painPoints === undefined ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {painPoints.map((pp) => (
                <Toggle
                  key={pp.key}
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  pressed={ticked.includes(pp.key)}
                  onPressedChange={(on) => setTicked((t) => (on ? [...t, pp.key] : t.filter((k) => k !== pp.key)))}
                  className={cn("rounded-full", pp.isBooster && "data-[pressed]:border-emerald-500/60 data-[pressed]:text-emerald-400")}
                >
                  {pp.label}
                </Toggle>
              ))}
              {aiFactors.map((f) => (
                <span
                  key={f.id}
                  title={`${f.note}\n\n${f.reasoning}`}
                  className="inline-flex h-7 max-w-64 items-center gap-1.5 rounded-full border border-primary/60 bg-muted pr-1 pl-2.5 text-sm"
                >
                  <Sparkles className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{f.note}</span>
                  {!locked && (
                    <button
                      type="button"
                      aria-label={`Remove AI factor: ${f.note}`}
                      onClick={() => void removeAiFactor({ ticketId: ticket._id, factorId: f.id }).catch((err: unknown) => toast.error(errorMessage(err)))}
                      className="rounded-full p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </fieldset>

        <RiskAnalyzer ticket={ticket} locked={locked} omp={result ? omp : null} ticked={ticked} />
      </section>

      <section aria-label="Estimate receipt" className="space-y-4">
        <Receipt ticket={ticket} result={result} ticked={ticked} painPoints={painPoints ?? []} />
        {result && result.target > 8 && (
          <Alert>
            <AlertTriangle />
            <AlertDescription>This exceeds a day of work — slicing will break it into smaller pieces.</AlertDescription>
          </Alert>
        )}
        {!locked && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!result || saving || (!dirty && !staleTarget && ticket.karyaStatus !== "unestimated")}>
              {saving ? <Spinner /> : <Check />} Save estimate
            </Button>
            {ticket.karyaStatus !== "unestimated" && (dirty || staleTarget) && <span className="text-sm text-amber-400">Unsaved changes</span>}
            {ticket.karyaStatus !== "unestimated" && !dirty && !staleTarget && <span className="text-sm text-muted-foreground">Saved</span>}
          </div>
        )}
      </section>
    </form>
  );
}

function HoursField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={`omp-${id}`}>{label}</FieldLabel>
      <Input id={`omp-${id}`} type="number" inputMode="decimal" min="0" step="0.25" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function JiraContext({ ticket }: { ticket: Doc<"tickets"> }) {
  return (
    <section aria-label="Jira context" className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{ticket.jiraStatus}</Badge>
        <Badge variant="outline">{ticket.issueType}</Badge>
        {ticket.priority && <Badge variant="outline">{ticket.priority}</Badge>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Due</dt>
        <dd>{ticket.dueDate ? new Date(`${ticket.dueDate}T00:00:00`).toLocaleDateString() : "No due date"}</dd>
      </dl>
      <div>
        <h2 className="mb-1 font-medium">Description</h2>
        {ticket.descriptionText ? (
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-muted-foreground">{ticket.descriptionText}</p>
        ) : (
          <p className="text-muted-foreground italic">No description.</p>
        )}
      </div>
      {ticket.jiraUrl && (
        <a href={ticket.jiraUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Open in Jira <ExternalLink className="size-3" />
        </a>
      )}
    </section>
  );
}

type PainPoint = { key: string; label: string; personalWeightPct: number };

function Receipt({ ticket, result, ticked, painPoints }: { ticket: Doc<"tickets">; result: ReturnType<typeof computePert> | null; ticked: string[]; painPoints: PainPoint[] }) {
  if (!result) {
    return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enter O / M / P hours to see the receipt.</div>;
  }
  const tickedPoints = painPoints.filter((pp) => ticked.includes(pp.key));
  const aiFactors = ticket.aiFactors ?? [];
  const clamped = result.riskPct !== tickedPoints.reduce((s, pp) => s + pp.personalWeightPct, 0) + sumAiFactorPct(aiFactors);

  async function copy() {
    try {
      await navigator.clipboard.writeText(estimateSummary(ticket.jiraKey, result!));
      toast.success("Copied estimate summary");
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="rounded-lg border bg-card font-mono text-sm">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-sans font-medium">Receipt</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} aria-label="Copy estimate summary">
          <Copy /> Copy
        </Button>
      </div>
      <dl className="space-y-1 px-4 py-3">
        <Line label="Base PERT" value={hrs(result.base)} hint={`± ${hrs(result.sd)} SD`} />
        {/* The accepted AI factor is a custom pain point: same buffer, its own row. */}
        <Line label="Pain-point buffer" value={signedHrs(result.painPointHrs + result.aiHrs)} />
        {tickedPoints.map((pp) => (
          <Line key={pp.key} label={pp.label} value={signedPct(pp.personalWeightPct)} sub />
        ))}
        {aiFactors.map((f) => (
          <Line key={f.id} label={`✨ ${f.note}`} value={signedPct(f.impactPct)} sub />
        ))}
        {clamped && <p className="text-xs text-amber-400">Total risk clamped to {signedPct(result.riskPct)}.</p>}
      </dl>
      <dl className="space-y-1 border-t px-4 py-3">
        <Line label="Target" value={hrs(result.target)} strong />
        <Line label="Buffer shield" value={hrs(result.buffer)} />
      </dl>
      <dl className="border-t bg-primary/5 px-4 py-3">
        <Line label="Safe commit" value={hrs(result.safeCommit)} strong />
        <p className="mt-1 font-sans text-xs text-muted-foreground">Tell stakeholders this (~95% confidence).</p>
      </dl>
    </div>
  );
}

function Line({ label, value, hint, sub, strong }: { label: string; value: string; hint?: string; sub?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", sub && "pl-4 text-xs text-muted-foreground", strong && "text-base font-semibold")}>
      <dt className="min-w-0 truncate font-sans" title={label}>
        {label}
        {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function RiskAnalyzer({ ticket, locked, omp, ticked }: { ticket: Doc<"tickets">; locked: boolean; omp: readonly [number, number, number] | null; ticked: string[] }) {
  const analyze = useAction(api.ai.analyzeRisk);
  const acceptAi = useMutation(api.estimates.acceptAi);
  const dismissAi = useMutation(api.estimates.dismissAi);
  const [note, setNote] = useState(ticket.aiCustomText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; needsKey?: boolean } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);

  async function run() {
    if (!omp) return;
    setBusy(true);
    setError(null);
    try {
      const res = await analyze({ ticketId: ticket._id, customText: note, tickedPainPoints: ticked, optimisticHrs: omp[0], mostLikelyHrs: omp[1], pessimisticHrs: omp[2] });
      if (!res.ok) setError({ text: res.error, needsKey: res.needsKey });
      else setProvider(res.provider === "groq" ? "Groq" : "Gemini");
    } catch (err) {
      setError({ text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(accept: boolean) {
    try {
      await (accept ? acceptAi : dismissAi)({ ticketId: ticket._id });
      // Accepting moves the note into a pain-point chip, so the box starts fresh.
      if (accept) setNote("");
      setProvider(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const hasResult = ticket.aiIsValid !== undefined;
  return (
    <fieldset disabled={locked} className="space-y-3">
      <Field>
        <FieldLabel htmlFor="ai-note">Anything else tricky or helpful?</FieldLabel>
        <Textarea id="ai-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The payment webhook has no sandbox, so testing needs a staging account." />
        {!omp && <FieldDescription>Enter valid O / M / P hours first.</FieldDescription>}
      </Field>
      <Button type="button" variant="outline" disabled={!omp || !note.trim() || busy} onClick={() => void run()}>
        {busy ? <Spinner /> : <Sparkles />} Analyze impact
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.text}
            {error.needsKey && (
              <>
                {" "}
                <Link to="/settings" className="underline">Open Settings</Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {hasResult && !locked && (
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={ticket.aiIsValid ? "default" : "secondary"}>{ticket.aiIsValid ? "Valid factor" : "Not a technical factor"}</Badge>
            {ticket.aiIsValid && <span className="font-mono">{signedPct(ticket.aiModifierPct ?? 0)}</span>}
            {provider && <span className="ml-auto text-xs text-muted-foreground">via {provider}</span>}
          </div>
          <p className="text-muted-foreground">{ticket.aiReasoning}</p>
          {(ticket.aiSuggestedSubtasks ?? []).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Suggested subtasks (offered when slicing):</p>
              <ul className="list-inside list-disc">
                {ticket.aiSuggestedSubtasks!.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {ticket.aiIsValid && (
              <Button type="button" size="sm" onClick={() => void resolve(true)}><Check /> Accept {signedPct(ticket.aiModifierPct ?? 0)}</Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => void resolve(false)}><X /> Dismiss</Button>
          </div>
          {ticket.aiCustomText && ticket.aiCustomText !== note.trim() && <p className="text-xs text-amber-400">Note changed since this analysis.</p>}
        </div>
      )}
    </fieldset>
  );
}

function LockedNotice({ ticket }: { ticket: Doc<"tickets"> }) {
  const reset = useMutation(api.estimates.reset);
  return (
    <Alert>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Execution has started, so this estimate is locked.</span>
        <AlertDialog>
          <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <RotateCcw /> Reset estimate
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset the estimate?</AlertDialogTitle>
              <AlertDialogDescription>
                {ticket.jiraKey} goes back to unestimated. Its slices, tracked time and scope-creep notes are deleted. Your O / M / P inputs stay as a starting point.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void reset({ ticketId: ticket._id }).then(
                    () => toast.success("Estimate reset"),
                    (err: unknown) => toast.error(errorMessage(err)),
                  )
                }
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AlertDescription>
    </Alert>
  );
}
