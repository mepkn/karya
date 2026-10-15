import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { MAX_TITLE_CHARS, validatePlan } from "../../shared/execute";
import { MAX_NOTE_CHARS, actualTotalSeconds } from "../../shared/scope";
import { currentUserId, getOwnedTicket, requireUserId } from "./lib/access";
import { phase } from "./schema";

const BUFFER_DRAW_SECONDS = 15 * 60;

const draft = v.object({ title: v.string(), phase, allocatedSeconds: v.number() });

/** The ticket's slices in plan order. */
export const list = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return [];
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId) return [];
    const rows = await ctx.db
      .query("slices")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

/** The one running slice across all tickets, for the browser tab title. */
export const active = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const slice = await ctx.db
      .query("slices")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();
    if (slice === null) return null;
    const ticket = await ctx.db.get(slice.ticketId);
    return { ...slice, jiraKey: ticket?.jiraKey ?? "" };
  },
});

function assertPlanEditable(ticket: Doc<"tickets">) {
  if (ticket.karyaStatus === "unestimated") throw new ConvexError("Save an estimate first.");
  if (ticket.karyaStatus === "in_progress" || ticket.karyaStatus === "completed") {
    throw new ConvexError("The plan is locked. Reset the estimate to re-plan.");
  }
}

async function replacePlan(ctx: MutationCtx, ticket: Doc<"tickets">, slices: { title: string; phase: Doc<"slices">["phase"]; allocatedSeconds: number }[]) {
  const old = await ctx.db
    .query("slices")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
    .collect();
  for (const s of old) await ctx.db.delete(s._id);
  for (const [i, s] of slices.entries()) {
    await ctx.db.insert("slices", {
      ticketId: ticket._id,
      userId: ticket.userId,
      title: s.title.trim().slice(0, MAX_TITLE_CHARS),
      order: i,
      phase: s.phase,
      allocatedSeconds: Math.round(s.allocatedSeconds),
      elapsedSeconds: 0,
      status: "pending",
      isBonus: false,
    });
  }
}

/**
 * Saves the plan as a draft; with `lock` it must match the target, and the
 * ticket moves to in progress with the first slice running.
 */
export const savePlan = mutation({
  args: { ticketId: v.id("tickets"), slices: v.array(draft), lock: v.boolean() },
  handler: async (ctx, { ticketId, slices, lock }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    assertPlanEditable(ticket);
    const clean = slices.map((s) => ({ ...s, allocatedSeconds: Math.round(s.allocatedSeconds) }));
    if (lock) {
      const problem = validatePlan(clean, ticket.targetHours ?? 0);
      if (problem) throw new ConvexError(problem);
    } else if (clean.some((s) => !s.title.trim())) {
      throw new ConvexError("Every slice needs a title.");
    }
    await replacePlan(ctx, ticket, clean);
    await ctx.db.patch(ticketId, { karyaStatus: clean.length ? (lock ? "in_progress" : "sliced") : "estimated" });
    if (lock) {
      const first = await ctx.db
        .query("slices")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
        .filter((q) => q.eq(q.field("order"), 0))
        .first();
      if (first) await startSlice(ctx, first);
    }
  },
});

// ---- Timer (brief §7c): only state changes are written, never ticks. ----

async function getOwnedSlice(ctx: MutationCtx, id: Id<"slices">): Promise<Doc<"slices">> {
  const userId = await requireUserId(ctx);
  const slice = await ctx.db.get(id);
  if (slice === null || slice.userId !== userId) throw new ConvexError("Slice not found.");
  return slice;
}

async function runningTicket(ctx: MutationCtx, slice: Doc<"slices">): Promise<Doc<"tickets">> {
  const ticket = await ctx.db.get(slice.ticketId);
  if (ticket === null) throw new ConvexError("Ticket not found.");
  if (ticket.karyaStatus !== "in_progress") throw new ConvexError("Lock the plan before starting the timer.");
  return ticket;
}

function log(ctx: MutationCtx, slice: Doc<"slices">, type: Doc<"timerEvents">["type"], extra: { seconds?: number; note?: string } = {}) {
  return ctx.db.insert("timerEvents", { userId: slice.userId, ticketId: slice.ticketId, sliceId: slice._id, type, at: Date.now(), ...extra });
}

/** Banks the running stretch (server time), at most `capSeconds` of it. */
async function stop(ctx: MutationCtx, slice: Doc<"slices">, status: "paused" | "completed", capSeconds?: number) {
  const now = Date.now();
  let delta = slice.lastStartedAt === undefined ? 0 : Math.max(0, (now - slice.lastStartedAt) / 1000);
  if (capSeconds !== undefined) delta = Math.min(delta, Math.max(0, capSeconds));
  await ctx.db.patch(slice._id, {
    elapsedSeconds: Math.round(slice.elapsedSeconds + delta),
    lastStartedAt: undefined,
    status,
    completedAt: status === "completed" ? now : undefined,
  });
  return Math.round(delta);
}

async function startSlice(ctx: MutationCtx, slice: Doc<"slices">) {
  // One running slice per user, across all tickets.
  const running = await ctx.db
    .query("slices")
    .withIndex("by_user_status", (q) => q.eq("userId", slice.userId).eq("status", "active"))
    .collect();
  for (const other of running) {
    if (other._id === slice._id) continue;
    const seconds = await stop(ctx, other, "paused");
    await log(ctx, other, "pause", { seconds });
  }
  if (slice.status === "active") return;
  await ctx.db.patch(slice._id, { status: "active", lastStartedAt: Date.now(), blockedReason: undefined });
  await log(ctx, slice, "start");
}

export const start = mutation({
  args: { sliceId: v.id("slices") },
  handler: async (ctx, { sliceId }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    await runningTicket(ctx, slice);
    if (slice.status === "completed") throw new ConvexError("Reopen the slice first.");
    await startSlice(ctx, slice);
  },
});

export const pause = mutation({
  args: { sliceId: v.id("slices") },
  handler: async (ctx, { sliceId }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    if (slice.status !== "active") return;
    const seconds = await stop(ctx, slice, "paused");
    await log(ctx, slice, "pause", { seconds });
  },
});

export const complete = mutation({
  args: { sliceId: v.id("slices") },
  handler: async (ctx, { sliceId }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    await runningTicket(ctx, slice);
    if (slice.status === "completed") return;
    const seconds = await stop(ctx, slice, "completed");
    await log(ctx, slice, "complete", { seconds });
  },
});

/** Puts a done slice back in the queue, keeping its time. */
export const reopen = mutation({
  args: { sliceId: v.id("slices") },
  handler: async (ctx, { sliceId }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    await runningTicket(ctx, slice);
    if (slice.status !== "completed") return;
    await ctx.db.patch(sliceId, { status: "paused", completedAt: undefined });
    await log(ctx, slice, "reopen");
  },
});

/**
 * Idle guard: pauses a slice left running, counting only `keepSeconds` of the
 * running stretch (the rest is dropped).
 */
export const trim = mutation({
  args: { sliceId: v.id("slices"), keepSeconds: v.number() },
  handler: async (ctx, { sliceId, keepSeconds }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    if (slice.status !== "active") return;
    const seconds = await stop(ctx, slice, "paused", keepSeconds);
    await log(ctx, slice, "pause", { seconds, note: "Trimmed after idle" });
  },
});

// ---- Pacing check (brief §7d) ----

/** +15m from the shield: moves buffer time into this slice's allocation. */
export const drawBuffer = mutation({
  args: { sliceId: v.id("slices") },
  handler: async (ctx, { sliceId }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    const ticket = await runningTicket(ctx, slice);
    const left = (ticket.bufferShieldSeconds ?? 0) - ticket.bufferUsedSeconds;
    const seconds = Math.min(BUFFER_DRAW_SECONDS, left);
    if (seconds <= 0) throw new ConvexError("The buffer shield is used up.");
    await ctx.db.patch(sliceId, { allocatedSeconds: slice.allocatedSeconds + seconds });
    await ctx.db.patch(ticket._id, { bufferUsedSeconds: ticket.bufferUsedSeconds + seconds });
    await log(ctx, slice, "buffer_draw", { seconds });
  },
});

/** Scope cut: the slice is done, and what's left is parked as scope creep. */
export const scopeCut = mutation({
  args: { sliceId: v.id("slices"), note: v.string() },
  handler: async (ctx, { sliceId, note }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    await runningTicket(ctx, slice);
    const text = note.trim();
    if (!text) throw new ConvexError("Say what's left to do.");
    if (text.length > MAX_NOTE_CHARS) throw new ConvexError(`Keep it under ${MAX_NOTE_CHARS} characters.`);
    const seconds = await stop(ctx, slice, "completed");
    await log(ctx, slice, "complete", { seconds, note: "Scope cut" });
    await ctx.db.insert("scopeCreepItems", {
      ticketId: slice.ticketId,
      userId: slice.userId,
      sliceId,
      note: text,
      category: "edge_case",
      resolution: "parked",
      createdAt: Date.now(),
    });
  },
});

/** Blocked: pauses the timer and keeps the reason on the slice. */
export const block = mutation({
  args: { sliceId: v.id("slices"), reason: v.string() },
  handler: async (ctx, { sliceId, reason }) => {
    const slice = await getOwnedSlice(ctx, sliceId);
    const text = reason.trim();
    if (!text) throw new ConvexError("Add a short reason.");
    if (text.length > MAX_NOTE_CHARS) throw new ConvexError(`Keep it under ${MAX_NOTE_CHARS} characters.`);
    const seconds = slice.status === "active" ? await stop(ctx, slice, "paused") : 0;
    if (slice.status === "pending") await ctx.db.patch(sliceId, { status: "paused" });
    await ctx.db.patch(sliceId, { blockedReason: text });
    await log(ctx, slice, "pause", { seconds, note: `Blocked: ${text}` });
  },
});

// ---- Ticket completion (brief §7f) ----

async function ticketSlices(ctx: MutationCtx, ticketId: Id<"tickets">) {
  return await ctx.db
    .query("slices")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .collect();
}

/** Marks the ticket done once every slice (bonus ones too) is done. */
export const completeTicket = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    if (ticket.karyaStatus !== "in_progress") throw new ConvexError("Only a ticket in progress can be completed.");
    const slices = await ticketSlices(ctx, ticketId);
    if (slices.length === 0 || slices.some((s) => s.status !== "completed")) throw new ConvexError("Finish every slice first.");
    await ctx.db.patch(ticketId, { karyaStatus: "completed", completedAt: Date.now(), actualTotalSeconds: actualTotalSeconds(slices) });
  },
});

/** Back to in progress; the slices keep their time. */
export const reopenTicket = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await getOwnedTicket(ctx, ticketId);
    if (ticket.karyaStatus !== "completed") return;
    await ctx.db.patch(ticketId, { karyaStatus: "in_progress", completedAt: undefined, actualTotalSeconds: undefined });
  },
});

// ---- For the AI slicer ----

export const slicerContext = internalQuery({
  args: { userId: v.id("users"), ticketId: v.id("tickets") },
  handler: async (ctx, { userId, ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId) throw new ConvexError("Ticket not found.");
    assertPlanEditable(ticket);
    if (!ticket.targetHours) throw new ConvexError("Save an estimate first.");
    const labels = await ctx.db
      .query("painPointWeights")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const byKey = Object.fromEntries(labels.map((p) => [p.key, p.label]));
    return {
      summary: ticket.summary,
      descriptionText: ticket.descriptionText,
      targetHours: ticket.targetHours,
      painPoints: [...ticket.tickedPainPoints.map((k) => byKey[k]).filter(Boolean), ...(ticket.aiFactors ?? []).map((f) => f.note)],
      suggestedSubtasks: (ticket.aiFactors ?? []).flatMap((f) => f.suggestedSubtasks),
    };
  },
});

export const storeAiPlan = internalMutation({
  args: { userId: v.id("users"), ticketId: v.id("tickets"), slices: v.array(draft) },
  handler: async (ctx, { userId, ticketId, slices }) => {
    const ticket = await ctx.db.get(ticketId);
    if (ticket === null || ticket.userId !== userId) throw new ConvexError("Ticket not found.");
    assertPlanEditable(ticket);
    await replacePlan(ctx, ticket, slices);
    await ctx.db.patch(ticketId, { karyaStatus: "sliced" });
  },
});
