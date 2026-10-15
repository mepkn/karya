import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export const karyaStatus = v.union(
  v.literal("unestimated"),
  v.literal("estimated"),
  v.literal("sliced"),
  v.literal("in_progress"),
  v.literal("completed"),
);
export const phase = v.union(
  v.literal("setup"),
  v.literal("core"),
  v.literal("ui"),
  v.literal("testing"),
  v.literal("other"),
);

export default defineSchema({
  ...authTables,

  // Secrets (*Enc) are AES-GCM ciphertexts; no query ever returns them.
  userSettings: defineTable({
    userId: v.id("users"),
    jiraCloudId: v.optional(v.string()),
    jiraSiteName: v.optional(v.string()),
    jiraSiteUrl: v.optional(v.string()),
    jiraAccessTokenEnc: v.optional(v.string()),
    jiraRefreshTokenEnc: v.optional(v.string()),
    jiraExpiresAt: v.optional(v.number()),
    jiraLastSyncedAt: v.optional(v.number()),
    // Sites offered after an OAuth callback that found more than one; cleared once picked.
    jiraPendingSites: v.optional(v.array(v.object({ id: v.string(), name: v.string(), url: v.string() }))),
    geminiKeyEnc: v.optional(v.string()),
    dailyFocusHours: v.number(),
  }).index("by_user", ["userId"]),

  // Pending Atlassian OAuth handshakes: the random `state` sent to Atlassian.
  jiraOAuthStates: defineTable({
    userId: v.id("users"),
    state: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  painPointWeights: defineTable({
    userId: v.id("users"),
    key: v.string(),
    label: v.string(),
    category: v.string(),
    defaultWeightPct: v.number(),
    personalWeightPct: v.number(),
    sampleCount: v.number(),
    isBooster: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "key"]),

  tickets: defineTable({
    userId: v.id("users"),
    jiraKey: v.string(),
    jiraUrl: v.string(),
    summary: v.string(),
    descriptionText: v.string(),
    jiraStatus: v.string(),
    issueType: v.string(),
    priority: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    jiraUpdatedAt: v.optional(v.string()),
    isDemo: v.optional(v.boolean()),
    archivedFromJira: v.boolean(),
    karyaStatus,
    // Estimate tab
    optimisticHrs: v.optional(v.number()),
    mostLikelyHrs: v.optional(v.number()),
    pessimisticHrs: v.optional(v.number()),
    basePertHrs: v.optional(v.number()),
    sdHrs: v.optional(v.number()),
    tickedPainPoints: v.array(v.string()),
    painPointPctApplied: v.optional(v.number()),
    // Weights of the ticked pain points at estimate time, for calibration.
    painPointWeightsApplied: v.optional(v.record(v.string(), v.number())),
    aiCustomText: v.optional(v.string()),
    aiIsValid: v.optional(v.boolean()),
    aiModifierPct: v.optional(v.number()),
    aiReasoning: v.optional(v.string()),
    aiAccepted: v.optional(v.boolean()),
    aiSuggestedSubtasks: v.optional(v.array(v.string())),
    targetHours: v.optional(v.number()),
    bufferShieldSeconds: v.optional(v.number()),
    bufferUsedSeconds: v.number(),
    estimatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    actualTotalSeconds: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "karyaStatus"])
    .index("by_user_jiraKey", ["userId", "jiraKey"]),

  slices: defineTable({
    ticketId: v.id("tickets"),
    userId: v.id("users"),
    title: v.string(),
    order: v.number(),
    phase,
    allocatedSeconds: v.number(),
    elapsedSeconds: v.number(),
    lastStartedAt: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("paused"), v.literal("completed")),
    blockedReason: v.optional(v.string()),
    isBonus: v.boolean(),
    completedAt: v.optional(v.number()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_user_status", ["userId", "status"]),

  scopeCreepItems: defineTable({
    ticketId: v.id("tickets"),
    userId: v.id("users"),
    sliceId: v.optional(v.id("slices")),
    note: v.string(),
    category: v.union(v.literal("refactor"), v.literal("edge_case"), v.literal("bug")),
    resolution: v.union(
      v.literal("parked"),
      v.literal("promoted_to_slice"),
      v.literal("deferred_to_backlog"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(),
  }).index("by_ticket", ["ticketId"]),

  timerEvents: defineTable({
    userId: v.id("users"),
    ticketId: v.id("tickets"),
    sliceId: v.id("slices"),
    type: v.union(
      v.literal("start"),
      v.literal("pause"),
      v.literal("complete"),
      v.literal("buffer_draw"),
      v.literal("reopen"),
    ),
    seconds: v.optional(v.number()),
    note: v.optional(v.string()),
    at: v.number(),
  }).index("by_ticket", ["ticketId"]),

  // One row per Gemini call, for the per-user rate limit.
  aiCalls: defineTable({
    userId: v.id("users"),
    at: v.number(),
  }).index("by_user_at", ["userId", "at"]),
});
