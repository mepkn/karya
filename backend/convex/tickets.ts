import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { DEMO_TICKETS } from "./lib/demoTickets";
import { currentUserId, getOwnedTicket, requireUserId } from "./lib/access";

/** The sidebar inbox: the user's tickets, most recently updated in Jira first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return [];
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    return tickets
      .sort((a, b) => (b.jiraUpdatedAt ?? "").localeCompare(a.jiraUpdatedAt ?? ""))
      .map((t) => ({
        _id: t._id,
        jiraKey: t.jiraKey,
        summary: t.summary,
        karyaStatus: t.karyaStatus,
        archivedFromJira: t.archivedFromJira,
        isDemo: t.isDemo ?? false,
        bufferShieldSeconds: t.bufferShieldSeconds,
        bufferUsedSeconds: t.bufferUsedSeconds,
      }));
  },
});

export const get = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, { id }) => await getOwnedTicket(ctx, id),
});

/** A ticket by its Jira key; null when missing or not the user's. */
export const getByKey = query({
  args: { jiraKey: v.string() },
  handler: async (ctx, { jiraKey }) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("tickets")
      .withIndex("by_user_jiraKey", (q) => q.eq("userId", userId).eq("jiraKey", jiraKey))
      .unique();
  },
});

/** Seeds fake tickets so the app can be tried without Jira. Skips keys that exist. */
export const loadDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    let added = 0;
    for (const [i, demo] of DEMO_TICKETS.entries()) {
      const existing = await ctx.db
        .query("tickets")
        .withIndex("by_user_jiraKey", (q) => q.eq("userId", userId).eq("jiraKey", demo.jiraKey))
        .unique();
      if (existing) continue;
      await ctx.db.insert("tickets", {
        userId,
        ...demo,
        jiraUrl: "",
        jiraUpdatedAt: new Date(now - i * 3_600_000).toISOString(),
        isDemo: true,
        archivedFromJira: false,
        karyaStatus: "unestimated",
        tickedPainPoints: [],
        bufferUsedSeconds: 0,
      });
      added++;
    }
    return added;
  },
});

/** Deletes demo tickets and everything Karya stored for them. */
export const removeDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    let removed = 0;
    for (const t of tickets.filter((t) => t.isDemo)) {
      for (const table of ["slices", "scopeCreepItems", "timerEvents"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_ticket", (q) => q.eq("ticketId", t._id))
          .collect();
        for (const r of rows) await ctx.db.delete(r._id);
      }
      await ctx.db.delete(t._id);
      removed++;
    }
    return removed;
  },
});
