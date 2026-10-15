import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { MAX_TITLE_CHARS } from "../../shared/execute";
import { MAX_NOTE_CHARS, MIN_BONUS_MINUTES } from "../../shared/scope";
import { currentUserId, getOwnedTicket, requireUserId } from "./lib/access";


const category = v.union(v.literal("refactor"), v.literal("edge_case"), v.literal("bug"));

/** The ticket's scope-creep items, oldest first. */
export const list = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return [];
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId) return [];
    return await ctx.db
      .query("scopeCreepItems")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .collect();
  },
});

function cleanNote(note: string) {
  const text = note.trim();
  if (!text) throw new ConvexError("Write a short note.");
  if (text.length > MAX_NOTE_CHARS) throw new ConvexError(`Keep it under ${MAX_NOTE_CHARS} characters.`);
  return text;
}

/** Catcher input: parks a note against the ticket and, if given, the slice in hand. */
export const add = mutation({
  args: { ticketId: v.id("tickets"), sliceId: v.optional(v.id("slices")), note: v.string(), category },
  handler: async (ctx, { ticketId, sliceId, note, category }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    if (ticket.karyaStatus !== "in_progress") throw new ConvexError("Scope creep is caught while the ticket is in progress.");
    if (sliceId !== undefined) {
      const slice = await ctx.db.get(sliceId);
      if (slice === null || slice.ticketId !== ticketId) throw new ConvexError("Slice not found.");
    }
    await ctx.db.insert("scopeCreepItems", {
      ticketId,
      userId: ticket.userId,
      sliceId,
      note: cleanNote(note),
      category,
      resolution: "parked",
      createdAt: Date.now(),
    });
  },
});

async function getOwnedItem(ctx: MutationCtx, id: Id<"scopeCreepItems">): Promise<Doc<"scopeCreepItems">> {
  const userId = await requireUserId(ctx);
  const item = await ctx.db.get(id);
  if (item === null || item.userId !== userId) throw new ConvexError("Item not found.");
  return item;
}

export const setCategory = mutation({
  args: { itemId: v.id("scopeCreepItems"), category },
  handler: async (ctx, { itemId, category }) => {
    await getOwnedItem(ctx, itemId);
    await ctx.db.patch(itemId, { category });
  },
});

export const dismiss = mutation({
  args: { itemId: v.id("scopeCreepItems") },
  handler: async (ctx, { itemId }) => {
    const item = await getOwnedItem(ctx, itemId);
    if (item.resolution !== "parked") throw new ConvexError("Only parked items can be dismissed.");
    await ctx.db.patch(itemId, { resolution: "dismissed" });
  },
});

/** Undo for dismiss/defer: back to parked. Promoted items stay, their slice exists. */
export const unpark = mutation({
  args: { itemId: v.id("scopeCreepItems") },
  handler: async (ctx, { itemId }) => {
    const item = await getOwnedItem(ctx, itemId);
    if (item.resolution === "dismissed" || item.resolution === "deferred_to_backlog") await ctx.db.patch(itemId, { resolution: "parked" });
  },
});

/**
 * Once the main slices are done, a parked item becomes a bonus slice whose
 * allocation comes out of the buffer shield.
 */
export const promote = mutation({
  args: { itemId: v.id("scopeCreepItems"), minutes: v.number() },
  handler: async (ctx, { itemId, minutes }) => {
    const item = await getOwnedItem(ctx, itemId);
    if (item.resolution !== "parked") throw new ConvexError("Only parked items can be promoted.");
    const ticket = await ctx.db.get(item.ticketId);
    if (ticket === null) throw new ConvexError("Ticket not found.");
    if (ticket.karyaStatus !== "in_progress") throw new ConvexError("The ticket is not in progress.");
    const slices = await ctx.db
      .query("slices")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
      .collect();
    if (slices.some((s) => !s.isBonus && s.status !== "completed")) throw new ConvexError("Finish the planned slices first.");
    const seconds = Math.round(minutes) * 60;
    if (!Number.isFinite(seconds) || seconds < MIN_BONUS_MINUTES * 60) throw new ConvexError(`Give it at least ${MIN_BONUS_MINUTES} minutes.`);
    const left = (ticket.bufferShieldSeconds ?? 0) - ticket.bufferUsedSeconds;
    if (seconds > left) throw new ConvexError("Not enough left in the buffer shield.");
    const sliceId = await ctx.db.insert("slices", {
      ticketId: ticket._id,
      userId: ticket.userId,
      title: item.note.replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS),
      order: Math.max(-1, ...slices.map((s) => s.order)) + 1,
      phase: "other",
      allocatedSeconds: seconds,
      elapsedSeconds: 0,
      status: "pending",
      isBonus: true,
    });
    await ctx.db.patch(ticket._id, { bufferUsedSeconds: ticket.bufferUsedSeconds + seconds });
    await ctx.db.patch(itemId, { resolution: "promoted_to_slice" });
    await ctx.db.insert("timerEvents", { userId: ticket.userId, ticketId: ticket._id, sliceId, type: "buffer_draw", seconds, note: "Bonus slice", at: Date.now() });
  },
});

/** After "Copy for standup": every parked item goes to the backlog. */
export const deferParked = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    await getOwnedTicket(ctx, ticketId);
    const items = await ctx.db
      .query("scopeCreepItems")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .collect();
    for (const i of items) if (i.resolution === "parked") await ctx.db.patch(i._id, { resolution: "deferred_to_backlog" });
  },
});
