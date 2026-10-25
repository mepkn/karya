import { internalMutation } from "./_generated/server";

/**
 * One-off: AI keys moved to kunji, so remove the old encrypted keys, the
 * preferred provider and the rate-limit rows. Users re-enter keys in kunji.
 * Run once per deployment: `npx convex run migrations:clearAiKeys` (add --prod).
 */
export const clearAiKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    let settings = 0;
    for (const s of await ctx.db.query("userSettings").collect()) {
      if (s.geminiKeyEnc === undefined && s.groqKeyEnc === undefined && s.aiProvider === undefined) continue;
      await ctx.db.patch(s._id, { geminiKeyEnc: undefined, groqKeyEnc: undefined, aiProvider: undefined });
      settings++;
    }
    let calls = 0;
    for (const c of await ctx.db.query("aiCalls").collect()) {
      await ctx.db.delete(c._id);
      calls++;
    }
    return { settings, calls };
  },
});
