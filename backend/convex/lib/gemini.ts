import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * The one place the Gemini model is named. An alias Google keeps on its current
 * Flash model: new keys can't call gemini-2.5-flash (limited to existing users
 * since Sept 2026). Pin a versioned name here if output drifts after an update.
 */
export const GEMINI_MODEL = "gemini-flash-latest";

export function geminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/** A message the user can act on, for any error the Gemini SDK throws. */
export function geminiErrorMessage(err: unknown): string {
  if (err instanceof GeminiModelUnavailable) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 429) return "Free-tier rate limit hit, try again in a minute.";
    if (err.status === 400 || err.status === 401 || err.status === 403) {
      return /API_KEY_INVALID|API key not valid/i.test(err.message)
        ? "Google rejected this API key."
        : `Gemini refused the request (${err.status}).`;
    }
    if (err.status >= 500) return "Gemini is having trouble right now, try again shortly.";
    return `Gemini error (${err.status}).`;
  }
  return "Could not reach Gemini.";
}

/** Flash models this key can call with generateContent, newest names first. */
export async function listFlashModels(apiKey: string): Promise<string[]> {
  const names: string[] = [];
  const pager = await geminiClient(apiKey).models.list();
  for await (const m of pager) {
    const name = (m.name ?? "").replace(/^models\//, "");
    if (name.includes("flash") && !/tts|omni|image|audio|live/.test(name) && (m.supportedActions ?? []).includes("generateContent")) names.push(name);
  }
  return names.sort().reverse();
}

/**
 * The smallest real call: proves the key works for GEMINI_MODEL. A 404 means
 * the model isn't served to this key (Google limits older models to existing
 * users), so the error names the flash models it can use instead.
 */
export async function pingGemini(apiKey: string): Promise<void> {
  try {
    await geminiClient(apiKey).models.generateContent({
      model: GEMINI_MODEL,
      contents: "Reply with OK.",
      config: { maxOutputTokens: 8 },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const available = await listFlashModels(apiKey).catch(() => []);
      throw new GeminiModelUnavailable(available);
    }
    throw err;
  }
}

export class GeminiModelUnavailable extends Error {
  constructor(readonly available: string[]) {
    super(
      `Model ${GEMINI_MODEL} isn't available to this key.` +
        (available.length ? ` Flash models it can use: ${available.slice(0, 6).join(", ")}.` : ""),
    );
  }
}
