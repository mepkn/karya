import { useOutletContext } from "react-router";
import type { Doc } from "@convex/_generated/dataModel";

type Tab = { path: string; label: string; unlocked: (t: Doc<"tickets">) => boolean; lockedHint: string };

// Tabs unlock in order: Execute needs a saved estimate.
export const TABS: Tab[] = [
  { path: "estimate", label: "Estimate", unlocked: () => true, lockedHint: "" },
  { path: "execute", label: "Execute", unlocked: (t) => t.karyaStatus !== "unestimated", lockedHint: "Save an estimate first" },
  { path: "calibrate", label: "Calibrate", unlocked: () => true, lockedHint: "" },
];

export function useTicket() {
  return useOutletContext<Doc<"tickets">>();
}
