import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { PHASES } from "../../shared/execute";
import { CATEGORIES } from "../../shared/scope";
import { fudgeFactor, MIN_SAMPLES, phaseOverruns, scopeStats, tunePainPoints, type CompletedTicket } from "../../shared/calibration";
import { currentUserId, requireUserId } from "./lib/access";

/** Per slice: its +15m draws, and the allocation it was planned with before them. */
async function slicesWithPlan(ctx: QueryCtx, ticketId: Id<"tickets">) {
  const slices = await ctx.db
    .query("slices")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .collect();
  const events = await ctx.db
    .query("timerEvents")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .collect();
  return slices
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      // A bonus slice's own allocation is a draw too, but it is the plan for that slice.
      const draws = events.filter((e) => e.sliceId === s._id && e.type === "buffer_draw" && e.note !== "Bonus slice");
      const drawn = draws.reduce((n, e) => n + (e.seconds ?? 0), 0);
      return { ...s, plannedSeconds: s.allocatedSeconds - drawn, bufferDraws: draws.length };
    });
}

function toCompleted(t: Doc<"tickets">): CompletedTicket | null {
  if (!t.completedAt || t.actualTotalSeconds === undefined || !t.basePertHrs || !t.targetHours || !t.mostLikelyHrs) return null;
  return {
    completedAt: t.completedAt,
    actualHrs: t.actualTotalSeconds / 3600,
    baseHrs: t.basePertHrs,
    targetHrs: t.targetHours,
    mostLikelyHrs: t.mostLikelyHrs,
    weights: t.painPointWeightsApplied ?? {},
    aiPct: (t.aiFactors ?? []).reduce((n, f) => n + f.impactPct, 0),
  };
}

/** One ticket's estimation receipt; null until it is completed. */
export const receipt = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId || ticket.karyaStatus !== "completed") return null;
    return { slices: await slicesWithPlan(ctx, ticketId) };
  },
});

/** The global view across every completed ticket. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("karyaStatus", "completed"))
      .collect();
    const completed = tickets.flatMap((t) => {
      const c = toCompleted(t);
      return c ? [{ ticket: t, c }] : [];
    });

    const doneSlices = [];
    const items = [];
    for (const { ticket } of completed) {
      for (const s of await slicesWithPlan(ctx, ticket._id)) if (!s.isBonus) doneSlices.push(s);
      items.push(
        ...(await ctx.db
          .query("scopeCreepItems")
          .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
          .collect()),
      );
    }

    const weights = await ctx.db
      .query("painPointWeights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const suggestions = tunePainPoints(completed.map((x) => x.c));
    const byKey = new Map(suggestions.map((s) => [s.key, s]));

    const fudge = fudgeFactor(completed.map((x) => x.c));
    const keyAt = new Map(completed.map((x) => [x.c.completedAt, x.ticket.jiraKey]));
    return {
      ticketCount: completed.length,
      fudge: { ...fudge, trend: fudge.trend.map((r) => ({ ...r, jiraKey: keyAt.get(r.completedAt) ?? "" })) },
      painPoints: weights.map((w) => {
        const s = byKey.get(w.key);
        return {
          key: w.key,
          label: w.label,
          defaultWeightPct: w.defaultWeightPct,
          personalWeightPct: w.personalWeightPct,
          historyPct: s?.historyPct ?? null,
          suggestedPct: s && s.sampleCount >= MIN_SAMPLES ? s.suggestedPct : null,
          sampleCount: s?.sampleCount ?? 0,
        };
      }),
      phases: phaseOverruns(doneSlices, PHASES),
      scope: scopeStats(items, completed.length, CATEGORIES),
    };
  },
});

async function ownedWeight(ctx: QueryCtx, key: string) {
  const userId = await requireUserId(ctx);
  const row = await ctx.db
    .query("painPointWeights")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
    .unique();
  if (row === null) throw new ConvexError("Pain point not found.");
  return row;
}

/** Applies the tuner's suggestion, recomputed here rather than trusted from the client. */
export const applySuggestion = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ownedWeight(ctx, key);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user_status", (q) => q.eq("userId", row.userId).eq("karyaStatus", "completed"))
      .collect();
    const s = tunePainPoints(tickets.flatMap((t) => toCompleted(t) ?? [])).find((x) => x.key === key);
    if (!s || s.sampleCount < MIN_SAMPLES) throw new ConvexError(`Needs ${MIN_SAMPLES} completed tickets with this pain point.`);
    await ctx.db.patch(row._id, { personalWeightPct: s.suggestedPct, sampleCount: s.sampleCount });
  },
});

export const resetWeight = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ownedWeight(ctx, key);
    await ctx.db.patch(row._id, { personalWeightPct: row.defaultWeightPct, sampleCount: 0 });
  },
});
