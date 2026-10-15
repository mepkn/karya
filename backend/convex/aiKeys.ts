import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireActionUserId } from "./lib/actionAuth";
import { aiProvider, type AiProvider } from "./schema";
import { geminiErrorMessage, pingGemini } from "./lib/gemini";
import { groqErrorMessage, pingGroq } from "./lib/groq";
import { decryptSecret, encryptSecret } from "./lib/secrets";

type TestResult = { ok: true } | { ok: false; error: string };

async function test(provider: AiProvider, apiKey: string): Promise<TestResult> {
  try {
    await (provider === "gemini" ? pingGemini(apiKey) : pingGroq(apiKey));
    return { ok: true };
  } catch (err) {
    // Status and the provider's message only; the key itself is never logged.
    console.error(`${provider} test call failed`, err instanceof Error ? err.message.slice(0, 500) : err);
    return { ok: false, error: provider === "gemini" ? geminiErrorMessage(err) : groqErrorMessage(err) };
  }
}

function clean(provider: AiProvider, key: string): string {
  const k = key.trim();
  if (k.length < 20 || /\s/.test(k)) throw new Error(`That doesn't look like a ${provider === "gemini" ? "Gemini" : "Groq"} API key.`);
  return k;
}

/** Tests a pasted key without saving it, or the saved key when none is given. */
export const testKey = action({
  args: { provider: aiProvider, key: v.optional(v.string()) },
  handler: async (ctx, { provider, key }): Promise<TestResult> => {
    const userId = await requireActionUserId(ctx);
    if (key !== undefined) return await test(provider, clean(provider, key));
    const enc = (await ctx.runQuery(internal.settings.aiKeysEnc, { userId }))[provider];
    if (enc === undefined) return { ok: false, error: "No key saved." };
    return await test(provider, await decryptSecret(enc));
  },
});

/** Saves the key encrypted, only after a successful test call. */
export const saveKey = action({
  args: { provider: aiProvider, key: v.string() },
  handler: async (ctx, { provider, key }): Promise<TestResult> => {
    const userId = await requireActionUserId(ctx);
    const apiKey = clean(provider, key);
    const result = await test(provider, apiKey);
    if (!result.ok) return result;
    await ctx.runMutation(internal.settings.storeAiKeyEnc, { userId, provider, keyEnc: await encryptSecret(apiKey) });
    return result;
  },
});
