/** Scope Creep Catcher (brief §7f): categories and the standup copy. */

export const CATEGORIES = ["refactor", "edge_case", "bug"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  refactor: "Refactor/Polish",
  edge_case: "Edge case",
  bug: "Bug/Tech debt",
};

export const MAX_NOTE_CHARS = 500;
/** Bonus slices: a duration the user picks, in whole minutes. */
export const MIN_BONUS_MINUTES = 5;

/**
 * Markdown list of parked items grouped by category, in category order, for a
 * standup update or follow-up tickets. Empty string when there is nothing.
 */
export function standupMarkdown(jiraKey: string, items: { note: string; category: Category }[]): string {
  if (items.length === 0) return "";
  const lines = [`Follow-ups from ${jiraKey}:`];
  for (const c of CATEGORIES) {
    const group = items.filter((i) => i.category === c);
    if (group.length === 0) continue;
    lines.push("", `**${CATEGORY_LABEL[c]}**`);
    for (const i of group) lines.push(`- ${i.note.replace(/\s+/g, " ").trim()}`);
  }
  return lines.join("\n");
}

/** Seconds actually spent on a ticket: every slice, bonus ones included. */
export function actualTotalSeconds(slices: { elapsedSeconds: number }[]): number {
  return Math.round(slices.reduce((sum, s) => sum + s.elapsedSeconds, 0));
}
