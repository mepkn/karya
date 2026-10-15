import type { Doc } from "@convex/_generated/dataModel";

export type InboxTicket = Pick<
  Doc<"tickets">,
  "_id" | "jiraKey" | "summary" | "karyaStatus" | "archivedFromJira" | "bufferShieldSeconds" | "bufferUsedSeconds"
>;

export type Badge = { label: string; tone: "muted" | "ready" | "calm" | "wrap" | "over" | "done" };

/** The sidebar badge for a ticket (brief §5, plus "At risk" from §7e). */
export function ticketBadge(t: InboxTicket): Badge {
  switch (t.karyaStatus) {
    case "unestimated":
      return { label: "Unestimated", tone: "muted" };
    case "estimated":
    case "sliced":
      return { label: "Ready to slice", tone: "ready" };
    case "completed":
      return { label: "Completed", tone: "done" };
    case "in_progress": {
      const shield = t.bufferShieldSeconds ?? 0;
      if (shield > 0 && t.bufferUsedSeconds >= shield) return { label: "At risk", tone: "over" };
      if (t.bufferUsedSeconds > 0) return { label: "In flight – buffer draining", tone: "wrap" };
      return { label: "In flight – on track", tone: "calm" };
    }
  }
}

export const badgeClass: Record<Badge["tone"], string> = {
  muted: "bg-muted text-muted-foreground",
  ready: "bg-sky-500/15 text-sky-300",
  calm: "bg-calm/15 text-calm",
  wrap: "bg-wrap/15 text-wrap",
  over: "bg-over/15 text-over",
  done: "bg-done/15 text-done",
};
