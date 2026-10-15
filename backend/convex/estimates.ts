import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { computePert, sumAiFactorPct, sumPainPointPct, validateOMP } from "../../shared/pert";
import { currentUserId, getOwnedTicket } from "./lib/access";
import { ensureUserDefaults } from "./lib/defaults";

/** The user's pain points with their personal weights, boosters last. */
export const painPoints = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("painPointWeights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => Number(a.isBooster) - Number(b.isBooster) || a._creationTime - b._creationTime)
      .map((p) => ({ key: p.key, label: p.label, personalWeightPct: p.personalWeightPct, isBooster: p.isBooster }));
  },
});

async function weightsFor(ctx: QueryCtx, userId: Id<"users">): Promise<Record<string, number>> {
  const rows = await ctx.db
    .query("painPointWeights")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return Object.fromEntries(rows.map((p) => [p.key, p.personalWeightPct]));
}

/** Estimates can change until the timer has started; after that only a reset. */
function assertEditable(ticket: Doc<"tickets">) {
  if (ticket.karyaStatus === "in_progress" || ticket.karyaStatus === "completed") {
    throw new ConvexError("Execution has started. Reset the estimate to change it.");
  }
}

/** Saves the estimate; the receipt is recomputed here from the user's own weights. */
export const save = mutation({
  args: {
    ticketId: v.id("tickets"),
    optimisticHrs: v.number(),
    mostLikelyHrs: v.number(),
    pessimisticHrs: v.number(),
    tickedPainPoints: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await getOwnedTicket(ctx, args.ticketId);
    assertEditable(ticket);
    const invalid = validateOMP(args.optimisticHrs, args.mostLikelyHrs, args.pessimisticHrs);
    if (invalid) throw new ConvexError(invalid);
    if (args.pessimisticHrs > 1000) throw new ConvexError("Pessimistic estimate is over 1000 hours.");

    await ensureUserDefaults(ctx, ticket.userId);
    const weights = await weightsFor(ctx, ticket.userId);
    const ticked = [...new Set(args.tickedPainPoints)].filter((k) => k in weights);
    const painPointPct = sumPainPointPct(ticked, weights);
    const aiPct = sumAiFactorPct(ticket.aiFactors ?? []);
    const r = computePert({
      optimistic: args.optimisticHrs,
      mostLikely: args.mostLikelyHrs,
      pessimistic: args.pessimisticHrs,
      painPointPct,
      aiPct,
    });

    await ctx.db.patch(ticket._id, {
      optimisticHrs: args.optimisticHrs,
      mostLikelyHrs: args.mostLikelyHrs,
      pessimisticHrs: args.pessimisticHrs,
      basePertHrs: r.base,
      sdHrs: r.sd,
      tickedPainPoints: ticked,
      painPointPctApplied: painPointPct,
      painPointWeightsApplied: Object.fromEntries(ticked.map((k) => [k, weights[k]])),
      targetHours: r.target,
      bufferShieldSeconds: Math.round(r.buffer * 3600),
      estimatedAt: Date.now(),
      // A sliced plan stays sliced; the slicer re-fits it to the new target.
      karyaStatus: ticket.karyaStatus === "sliced" ? "sliced" : "estimated",
    });
  },
});

const clearPending = {
  aiCustomText: undefined,
  aiIsValid: undefined,
  aiModifierPct: undefined,
  aiReasoning: undefined,
  aiSuggestedSubtasks: undefined,
};

/** Adds the latest analysis to the ticket's pain points as a custom AI factor. */
export const acceptAi = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    assertEditable(ticket);
    if (!ticket.aiIsValid) throw new ConvexError("There is no valid AI factor to accept.");
    const factor = {
      id: crypto.randomUUID(),
      note: ticket.aiCustomText ?? "",
      impactPct: ticket.aiModifierPct ?? 0,
      reasoning: ticket.aiReasoning ?? "",
      suggestedSubtasks: ticket.aiSuggestedSubtasks ?? [],
    };
    await ctx.db.patch(ticketId, { ...clearPending, aiFactors: [...(ticket.aiFactors ?? []), factor] });
  },
});

/** Drops the latest analysis without adding it. */
export const dismissAi = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    assertEditable(ticket);
    await ctx.db.patch(ticketId, clearPending);
  },
});

export const removeAiFactor = mutation({
  args: { ticketId: v.id("tickets"), factorId: v.string() },
  handler: async (ctx, { ticketId, factorId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    assertEditable(ticket);
    await ctx.db.patch(ticketId, { aiFactors: (ticket.aiFactors ?? []).filter((f) => f.id !== factorId) });
  },
});

/**
 * Throws away the estimate and anything executed against it (slices, timer
 * history, scope-creep notes), so the ticket starts over as unestimated.
 */
export const reset = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    for (const table of ["slices", "scopeCreepItems", "timerEvents"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.patch(ticket._id, {
      karyaStatus: "unestimated",
      basePertHrs: undefined,
      sdHrs: undefined,
      painPointPctApplied: undefined,
      painPointWeightsApplied: undefined,
      targetHours: undefined,
      bufferShieldSeconds: undefined,
      bufferUsedSeconds: 0,
      estimatedAt: undefined,
      completedAt: undefined,
      actualTotalSeconds: undefined,
    });
  },
});

// ---- For the AI action ----

export const analyzerContext = internalQuery({
  args: { userId: v.id("users"), ticketId: v.id("tickets") },
  handler: async (ctx, { userId, ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId) throw new ConvexError("Ticket not found.");
    assertEditable(ticket);
    const labels = await ctx.db
      .query("painPointWeights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      summary: ticket.summary,
      descriptionText: ticket.descriptionText,
      painPointLabels: Object.fromEntries(labels.map((p) => [p.key, p.label])),
      acceptedFactors: (ticket.aiFactors ?? []).map((f) => f.note),
    };
  },
});

export const storeRiskAnalysis = internalMutation({
  args: {
    userId: v.id("users"),
    ticketId: v.id("tickets"),
    customText: v.string(),
    isValidFactor: v.boolean(),
    impactPercentage: v.number(),
    reasoning: v.string(),
    suggestedSubtasks: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    const ticket = await ctx.db.get(a.ticketId);
    if (ticket === null || ticket.userId !== a.userId) throw new ConvexError("Ticket not found.");
    await ctx.db.patch(a.ticketId, {
      aiCustomText: a.customText,
      aiIsValid: a.isValidFactor,
      aiModifierPct: a.impactPercentage,
      aiReasoning: a.reasoning,
      // Pending until the user accepts it; only accepted factors count.
      aiSuggestedSubtasks: a.suggestedSubtasks,
    });
  },
});
