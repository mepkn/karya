import { useOutletContext } from "react-router";
import type { Doc } from "@convex/_generated/dataModel";

type Tab = { path: string; label: string; unlocked: (t: Doc<"tickets">) => boolean; lockedHint: string };

// Tabs unlock in order: Execute needs a saved estimate, Calibrate a completed ticket.
export const TABS: Tab[] = [
  { path: "estimate", label: "Estimate", unlocked: () => true, lockedHint: "" },
  { path: "execute", label: "Execute", unlocked: (t) => t.karyaStatus !== "unestimated", lockedHint: "Save an estimate first" },
  { path: "calibrate", label: "Calibrate", unlocked: (t) => t.karyaStatus === "completed", lockedHint: "Complete the ticket first" },
];

export function useTicket() {
  return useOutletContext<Doc<"tickets">>();
}
