import { v } from "convex/values";
import { query } from "./_generated/server";
import { currentUserId, getOwnedTicket } from "./lib/access";

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
