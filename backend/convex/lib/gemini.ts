import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * The one place the Gemini models are named. Flash-Lite answers in ~2s with no
 * thinking; gemini-flash-latest (3.8 Flash in Oct 2026) took ~16s and was often
 * overloaded (503). The fallback is used when the first model is busy or slow.
 */
export const GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_FALLBACK_MODEL = "gemini-3-flash-preview";
const REQUEST_TIMEOUT_MS = 10_000;

export function geminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
}

/** Worth retrying on the fallback model: overloaded, or no answer in time. */
export function isBusyError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 503 || err.status === 504 || err.status === 500;
  return err instanceof Error && /timed? ?out|abort/i.test(err.name + err.message);
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
  readonly available: string[];
  constructor(available: string[]) {
    super(
      `Model ${GEMINI_MODEL} isn't available to this key.` +
        (available.length ? ` Flash models it can use: ${available.slice(0, 6).join(", ")}.` : ""),
    );
    this.available = available;
  }
}
