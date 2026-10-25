import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { currentUserId, getSettings, requireUserId } from "./lib/access";
import { isAllowedEmail } from "./lib/allowlist";
import { DEFAULT_DAILY_FOCUS_HOURS, ensureUserDefaults } from "./lib/defaults";

/** What the client may know about the signed-in user: never secrets, only flags. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    const settings = await getSettings(ctx, userId);
    return {
      email: user?.email ?? "",
      jiraConnected: settings?.jiraRefreshTokenEnc !== undefined && settings.jiraCloudId !== undefined,
      jiraSiteName: settings?.jiraSiteName ?? null,
      jiraSiteUrl: settings?.jiraSiteUrl ?? null,
      // Non-secret site names, offered when the account has several Jira sites.
      jiraPendingSites: settings?.jiraRefreshTokenEnc !== undefined ? (settings.jiraPendingSites ?? null) : null,
      jiraLastSyncedAt: settings?.jiraLastSyncedAt ?? null,
      dailyFocusHours: settings?.dailyFocusHours ?? DEFAULT_DAILY_FOCUS_HOURS,
    };
  },
});

/** Repairs missing defaults for accounts created before seeding existed. */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureUserDefaults(ctx, await requireUserId(ctx));
  },
});

export const setDailyFocusHours = mutation({
  args: { hours: v.number() },
  handler: async (ctx, { hours }) => {
    const userId = await requireUserId(ctx);
    if (!(hours > 0 && hours <= 16)) throw new Error("Focus hours must be between 0 and 16.");
    await ensureUserDefaults(ctx, userId);
    const settings = await getSettings(ctx, userId);
    await ctx.db.patch(settings!._id, { dailyFocusHours: hours });
  },
});

export const isAllowed = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => isAllowedEmail((await ctx.db.get(userId))?.email),
});

/** The user's email, which kunji uses to find their AI keys. */
export const userEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => (await ctx.db.get(userId))?.email ?? "",
});
