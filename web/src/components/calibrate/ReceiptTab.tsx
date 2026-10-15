import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { PHASE_LABEL, formatMinutes } from "@shared/execute";
import { useTicket } from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { hrs } from "./format";

/** brief §8: raw guess vs target vs actual for one completed ticket. */
export function ReceiptTab() {
  const ticket = useTicket();
  const receipt = useQuery(api.calibration.receipt, { ticketId: ticket._id });

  if (ticket.karyaStatus !== "completed") {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        The estimation receipt appears once this ticket is marked complete on the Execute tab.
      </div>
    );
  }
  if (receipt === undefined) return <Skeleton className="mx-auto h-64 max-w-3xl" />;

  const gut = ticket.mostLikelyHrs ?? 0;
  const target = ticket.targetHours ?? 0;
  const shield = (ticket.bufferShieldSeconds ?? 0) / 3600;
  const actual = (ticket.actualTotalSeconds ?? 0) / 3600;
  const shieldUsed = Math.max(0, actual - target);
  const within = actual <= target + shield;
  const scale = Math.max(gut, target + shield, actual) || 1;

  const bars = [
    { label: "Raw guess (M)", value: gut, tone: "bg-muted-foreground/60" },
    { label: "PERT + risk target", value: target, tone: "bg-calm" },
    { label: "Actual tracked", value: actual, tone: within ? "bg-done" : "bg-over" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Estimation receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bars.map((b) => (
            <div key={b.label} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{b.label}</span>
              <div className="relative h-3 rounded-full bg-muted">
                <div className={cn("h-full rounded-full", b.tone)} style={{ width: `${(b.value / scale) * 100}%` }} />
                {/* Safe commit line: target + shield. */}
                <div className="absolute inset-y-[-3px] w-px bg-foreground/50" style={{ left: `${((target + shield) / scale) * 100}%` }} aria-hidden />
              </div>
              <span className="text-right font-mono tabular-nums">{hrs(b.value)}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">The thin line is the safe commit (target + {hrs(shield)} shield).</p>
          <p className={cn("text-sm font-medium", within ? "text-done" : "text-over")}>
            {within
              ? `Used ${hrs(shieldUsed)} of ${hrs(shield)} shield — delivered within safe commit`
              : `Overran the safe commit by ${hrs(actual - target - shield)}`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slices</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-normal">Slice</th>
                <th className="pb-2 font-normal">Phase</th>
                <th className="pb-2 text-right font-normal">Planned</th>
                <th className="pb-2 text-right font-normal">Actual</th>
                <th className="pb-2 text-right font-normal">Diff</th>
              </tr>
            </thead>
            <tbody>
              {receipt?.slices.map((s) => {
                const diff = s.elapsedSeconds - s.plannedSeconds;
                return (
                  <tr key={s._id} className="border-t">
                    <td className="py-2 pr-2">
                      {s.title}
                      {s.isBonus && <span className="ml-2 rounded-full border border-done/50 px-1.5 text-xs text-done">Bonus</span>}
                      {s.bufferDraws > 0 && <span className="ml-2 text-xs text-wrap">+{s.bufferDraws}× shield</span>}
                    </td>
                    <td className="py-2 text-muted-foreground">{PHASE_LABEL[s.phase]}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatMinutes(s.plannedSeconds)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatMinutes(s.elapsedSeconds)}</td>
                    <td className={cn("py-2 text-right font-mono tabular-nums", Math.abs(diff) < 60 ? "text-muted-foreground" : diff > 0 ? "text-over" : "text-done")}>
                      {Math.abs(diff) < 60 ? "—" : `${diff > 0 ? "+" : "−"}${formatMinutes(diff)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
