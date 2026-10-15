import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { adfToText } from "../../shared/adf";
import { getSettings, requireUserId } from "./lib/access";
import { requireActionUserId } from "./lib/actionAuth";
import { ensureUserDefaults } from "./lib/defaults";
import { authorizeUrl, JiraError, refreshTokens, searchPage, type TokenSet } from "./lib/jira";
import { decryptSecret, encryptSecret } from "./lib/secrets";

const STATE_TTL_MS = 10 * 60 * 1000;
const AUTO_SYNC_EVERY_MS = 5 * 60 * 1000;
const MAX_PAGES = 20;

const siteValidator = v.object({ id: v.string(), name: v.string(), url: v.string() });
const issueValidator = v.object({
  jiraKey: v.string(),
  jiraUrl: v.string(),
  summary: v.string(),
  descriptionText: v.string(),
  jiraStatus: v.string(),
  issueType: v.string(),
  priority: v.optional(v.string()),
  dueDate: v.optional(v.string()),
  jiraUpdatedAt: v.optional(v.string()),
});

// ---- Connect -------------------------------------------------------------

/** Returns the Atlassian consent URL; the random state is stored for the callback to verify. */
export const startConnect = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const userId = await requireActionUserId(ctx);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.runMutation(internal.jira.storeState, { userId, state });
    return authorizeUrl(state);
  },
});

export const storeState = internalMutation({
  args: { userId: v.id("users"), state: v.string() },
  handler: async (ctx, { userId, state }) => {
    const now = Date.now();
    for (const old of await ctx.db.query("jiraOAuthStates").collect()) {
      if (now - old.createdAt > STATE_TTL_MS) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("jiraOAuthStates", { userId, state, createdAt: now });
  },
});

/** Single use: the state row is deleted whether or not it is still fresh. */
export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }): Promise<Id<"users"> | null> => {
    const row = await ctx.db
      .query("jiraOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();
    if (row === null) return null;
    await ctx.db.delete(row._id);
    return Date.now() - row.createdAt <= STATE_TTL_MS ? row.userId : null;
  },
});

export const storeConnection = internalMutation({
  args: {
    userId: v.id("users"),
    accessTokenEnc: v.string(),
    refreshTokenEnc: v.string(),
    expiresAt: v.number(),
    sites: v.array(siteValidator),
  },
  handler: async (ctx, { userId, accessTokenEnc, refreshTokenEnc, expiresAt, sites }) => {
    await ensureUserDefaults(ctx, userId);
    const settings = (await getSettings(ctx, userId))!;
    const only = sites.length === 1 ? sites[0] : undefined;
    await ctx.db.patch(settings._id, {
      jiraAccessTokenEnc: accessTokenEnc,
      jiraRefreshTokenEnc: refreshTokenEnc,
      jiraExpiresAt: expiresAt,
      jiraCloudId: only?.id,
      jiraSiteName: only?.name,
      jiraSiteUrl: only?.url,
      jiraPendingSites: only ? undefined : sites,
      jiraLastSyncedAt: undefined,
    });
  },
});

/** Picks one of the sites offered after connecting to an account with several. */
export const chooseSite = mutation({
  args: { siteId: v.string() },
  handler: async (ctx, { siteId }) => {
    const settings = await getSettings(ctx, await requireUserId(ctx));
    const site = settings?.jiraPendingSites?.find((s) => s.id === siteId);
    if (!settings || !site) throw new ConvexError("That Jira site is no longer on offer. Connect again.");
    await ctx.db.patch(settings._id, {
      jiraCloudId: site.id,
      jiraSiteName: site.name,
      jiraSiteUrl: site.url,
      jiraPendingSites: undefined,
    });
  },
});

/** Deletes the tokens. Synced tickets and their Karya state stay. */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const settings = await getSettings(ctx, await requireUserId(ctx));
    if (settings) await clearJira(ctx, settings._id);
  },
});

export const clearConnection = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const settings = await getSettings(ctx, userId);
    if (settings) await clearJira(ctx, settings._id);
  },
});

async function clearJira(ctx: MutationCtx, id: Id<"userSettings">) {
  await ctx.db.patch(id, {
    jiraAccessTokenEnc: undefined,
    jiraRefreshTokenEnc: undefined,
    jiraExpiresAt: undefined,
    jiraCloudId: undefined,
    jiraSiteName: undefined,
    jiraSiteUrl: undefined,
    jiraPendingSites: undefined,
    jiraLastSyncedAt: undefined,
  });
}

// ---- Tokens --------------------------------------------------------------

export const connection = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const s = await getSettings(ctx, userId);
    if (!s?.jiraRefreshTokenEnc || !s.jiraAccessTokenEnc || !s.jiraCloudId) return null;
    return {
      accessTokenEnc: s.jiraAccessTokenEnc,
      refreshTokenEnc: s.jiraRefreshTokenEnc,
      expiresAt: s.jiraExpiresAt ?? 0,
      cloudId: s.jiraCloudId,
      siteUrl: s.jiraSiteUrl ?? "",
      lastSyncedAt: s.jiraLastSyncedAt ?? null,
    };
  },
});

export const storeTokens = internalMutation({
  args: { userId: v.id("users"), accessTokenEnc: v.string(), refreshTokenEnc: v.string(), expiresAt: v.number() },
  handler: async (ctx, { userId, accessTokenEnc, refreshTokenEnc, expiresAt }) => {
    const settings = await getSettings(ctx, userId);
    if (!settings?.jiraRefreshTokenEnc) return; // disconnected meanwhile
    await ctx.db.patch(settings._id, {
      jiraAccessTokenEnc: accessTokenEnc,
      jiraRefreshTokenEnc: refreshTokenEnc,
      jiraExpiresAt: expiresAt,
    });
  },
});

/** Encrypts a fresh token set; used by the OAuth callback too. */
export async function encryptTokens(t: TokenSet) {
  return {
    accessTokenEnc: await encryptSecret(t.accessToken),
    refreshTokenEnc: await encryptSecret(t.refreshToken),
    expiresAt: t.expiresAt,
  };
}

async function refresh(ctx: ActionCtx, userId: Id<"users">, refreshTokenEnc: string): Promise<string> {
  let tokens: TokenSet;
  try {
    tokens = await refreshTokens(await decryptSecret(refreshTokenEnc));
  } catch (err) {
    if (err instanceof JiraError && (err.status === 400 || err.status === 401 || err.status === 403)) {
      console.error("Jira refresh rejected", err.message);
      await ctx.runMutation(internal.jira.clearConnection, { userId });
      throw new ConvexError("Jira access expired or was revoked. Connect Jira again in Settings.");
    }
    throw err;
  }
  // Rotating refresh tokens: always store the new one.
  await ctx.runMutation(internal.jira.storeTokens, { userId, ...(await encryptTokens(tokens)) });
  return tokens.accessToken;
}

// ---- Sync ----------------------------------------------------------------

type SyncResult = { skipped: true } | { skipped: false; added: number; updated: number; archived: number };

/** Pulls the user's open assigned issues. `auto` syncs at most once per 5 minutes. */
export const syncMyTickets = action({
  args: { auto: v.optional(v.boolean()) },
  handler: async (ctx, { auto }): Promise<SyncResult> => {
    const userId = await requireActionUserId(ctx);
    const conn = await ctx.runQuery(internal.jira.connection, { userId });
    if (conn === null) {
      if (auto) return { skipped: true };
      throw new ConvexError("Jira is not connected.");
    }
    if (auto && conn.lastSyncedAt !== null && Date.now() - conn.lastSyncedAt < AUTO_SYNC_EVERY_MS) {
      return { skipped: true };
    }

    let accessToken =
      conn.expiresAt - Date.now() > 60_000
        ? await decryptSecret(conn.accessTokenEnc)
        : await refresh(ctx, userId, conn.refreshTokenEnc);

    const issues = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      let result;
      try {
        result = await searchPage(accessToken, conn.cloudId, pageToken);
      } catch (err) {
        if (!(err instanceof JiraError && err.status === 401) || page > 0) throw jiraFailure(err);
        // Token rejected early (revoked or clock skew): refresh once and retry.
        accessToken = await refresh(ctx, userId, conn.refreshTokenEnc);
        result = await searchPage(accessToken, conn.cloudId, pageToken).catch((e: unknown) => {
          throw jiraFailure(e);
        });
      }
      issues.push(...result.issues);
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    const complete = pageToken === undefined;

    const rows = issues.map((i) => ({
      jiraKey: i.key,
      jiraUrl: conn.siteUrl ? `${conn.siteUrl.replace(/\/$/, "")}/browse/${i.key}` : "",
      summary: i.fields.summary ?? i.key,
      descriptionText: adfToText(i.fields.description),
      jiraStatus: i.fields.status?.name ?? "",
      issueType: i.fields.issuetype?.name ?? "",
      priority: i.fields.priority?.name ?? undefined,
      dueDate: i.fields.duedate ?? undefined,
      jiraUpdatedAt: i.fields.updated ?? undefined,
    }));

    let added = 0;
    let updated = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const r = await ctx.runMutation(internal.jira.upsertIssues, { userId, issues: rows.slice(i, i + 100) });
      added += r.added;
      updated += r.updated;
    }
    const { archived } = await ctx.runMutation(internal.jira.finishSync, {
      userId,
      seenKeys: rows.map((r) => r.jiraKey),
      // A truncated result must not archive the tickets it did not reach.
      archiveMissing: complete,
    });
    return { skipped: false, added, updated, archived };
  },
});

function jiraFailure(err: unknown): Error {
  if (err instanceof ConvexError) return err;
  console.error("Jira sync failed", err instanceof Error ? err.message : err);
  if (err instanceof JiraError) {
    if (err.status === 401 || err.status === 403) return new ConvexError("Jira refused access. Check the app's scopes, or reconnect Jira.");
    if (err.status === 429) return new ConvexError("Jira is rate limiting requests. Try again in a minute.");
    if (err.status === 410 || err.status === 404) return new ConvexError("The Jira site was not found. Reconnect Jira.");
  }
  return new ConvexError("Could not reach Jira. Try again shortly.");
}

export const upsertIssues = internalMutation({
  args: { userId: v.id("users"), issues: v.array(issueValidator) },
  handler: async (ctx, { userId, issues }) => {
    let added = 0;
    let updated = 0;
    for (const issue of issues) {
      const existing = await ctx.db
        .query("tickets")
        .withIndex("by_user_jiraKey", (q) => q.eq("userId", userId).eq("jiraKey", issue.jiraKey))
        .unique();
      if (existing === null) {
        await ctx.db.insert("tickets", {
          userId,
          ...issue,
          archivedFromJira: false,
          karyaStatus: "unestimated",
          tickedPainPoints: [],
          bufferUsedSeconds: 0,
        });
        added++;
      } else {
        // Jira fields only: estimates, slices and timers are Karya's and stay.
        await ctx.db.patch(existing._id, { ...issue, archivedFromJira: false, isDemo: undefined });
        updated++;
      }
    }
    return { added, updated };
  },
});

export const finishSync = internalMutation({
  args: { userId: v.id("users"), seenKeys: v.array(v.string()), archiveMissing: v.boolean() },
  handler: async (ctx, { userId, seenKeys, archiveMissing }) => {
    let archived = 0;
    if (archiveMissing) {
      const seen = new Set(seenKeys);
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_user_status", (q) => q.eq("userId", userId))
        .collect();
      for (const t of tickets) {
        if (!t.isDemo && !t.archivedFromJira && !seen.has(t.jiraKey)) {
          await ctx.db.patch(t._id, { archivedFromJira: true });
          archived++;
        }
      }
    }
    const settings = await getSettings(ctx, userId);
    if (settings) await ctx.db.patch(settings._id, { jiraLastSyncedAt: Date.now() });
    return { archived };
  },
});
