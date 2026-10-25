import { ConvexError } from "convex/values";

/** The user-facing message of a Convex call failure; server crashes get a generic one. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return fallback;
}

const PROVIDER_LABELS: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", groq: "Groq" };

/** kunji's provider id as a name: "groq" → "Groq", "custom:openrouter" → "openrouter". */
export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id.replace(/^custom:/, "");
}
