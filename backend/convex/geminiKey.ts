import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireActionUserId } from "./lib/actionAuth";
import { geminiErrorMessage, pingGemini } from "./lib/gemini";
import { decryptSecret, encryptSecret } from "./lib/secrets";

type TestResult = { ok: true } | { ok: false; error: string };

async function test(apiKey: string): Promise<TestResult> {
  try {
    await pingGemini(apiKey);
    return { ok: true };
  } catch (err) {
    // Status and Google's message only; the key itself is never logged.
    console.error("Gemini test call failed", err instanceof Error ? err.message.slice(0, 500) : err);
    return { ok: false, error: geminiErrorMessage(err) };
  }
}

function clean(key: string): string {
  const k = key.trim();
  if (k.length < 20 || /\s/.test(k)) throw new Error("That doesn't look like a Gemini API key.");
  return k;
}

/** Tests a pasted key without saving it, or the saved key when none is given. */
export const testKey = action({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, { key }): Promise<TestResult> => {
    const userId = await requireActionUserId(ctx);
    if (key !== undefined) return await test(clean(key));
    const enc = await ctx.runQuery(internal.settings.geminiKeyEnc, { userId });
    if (enc === null) return { ok: false, error: "No key saved." };
    return await test(await decryptSecret(enc));
  },
});

/** Saves the key encrypted, only after a successful test call. */
export const saveKey = action({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<TestResult> => {
    const userId = await requireActionUserId(ctx);
    const apiKey = clean(key);
    const result = await test(apiKey);
    if (!result.ok) return result;
    await ctx.runMutation(internal.settings.storeGeminiKeyEnc, { userId, geminiKeyEnc: await encryptSecret(apiKey) });
    return result;
  },
});
