import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DEFAULT_PAIN_POINTS } from "../../../shared/painPoints";

export const DEFAULT_DAILY_FOCUS_HOURS = 5.5;

/** Creates the user's settings row and any missing pain-point weights. Idempotent. */
export async function ensureUserDefaults(ctx: MutationCtx, userId: Id<"users">) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (settings === null) {
    await ctx.db.insert("userSettings", { userId, dailyFocusHours: DEFAULT_DAILY_FOCUS_HOURS });
  }
  for (const p of DEFAULT_PAIN_POINTS) {
    const existing = await ctx.db
      .query("painPointWeights")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", p.key))
      .unique();
    if (existing === null) {
      await ctx.db.insert("painPointWeights", {
        userId,
        key: p.key,
        label: p.label,
        category: p.category,
        defaultWeightPct: p.defaultWeightPct,
        personalWeightPct: p.defaultWeightPct,
        sampleCount: 0,
        isBooster: p.isBooster,
      });
    }
  }
}
