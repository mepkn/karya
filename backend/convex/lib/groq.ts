/**
 * Groq's OpenAI-compatible chat API, called with fetch (no SDK). The one place
 * the Groq model is named; pick another from console.groq.com/docs/models if
 * Groq retires it (the key test lists what the key can use).
 */
export const GROQ_MODEL = "openai/gpt-oss-20b";
const BASE_URL = "https://api.groq.com/openai/v1";
const REQUEST_TIMEOUT_MS = 10_000;

export class GroqError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(apiKey: string, path: string, body?: object): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GroqError(0, err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? res.statusText;
    throw new GroqError(res.status, msg);
  }
  return json;
}

/** One JSON-mode chat completion; returns the raw reply text. */
export async function groqJson(apiKey: string, system: string, user: string): Promise<string> {
  const json = (await call(apiKey, "/chat/completions", {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    reasoning_effort: "low",
  })) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function listGroqModels(apiKey: string): Promise<string[]> {
  const json = (await call(apiKey, "/models")) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id).sort();
}

/** The smallest real call: proves the key works for GROQ_MODEL. */
export async function pingGroq(apiKey: string): Promise<void> {
  try {
    await groqJson(apiKey, "Reply with JSON.", 'Return {"ok": true}.');
  } catch (err) {
    if (err instanceof GroqError && err.status === 404) {
      const available = await listGroqModels(apiKey).catch(() => []);
      throw new GroqError(404, `Model ${GROQ_MODEL} isn't available to this key.` + (available.length ? ` Models it can use: ${available.slice(0, 8).join(", ")}.` : ""));
    }
    throw err;
  }
}

export function groqErrorMessage(err: unknown): string {
  if (!(err instanceof GroqError)) return "Could not reach Groq.";
  if (err.status === 0) return err.message === "timeout" ? "Groq didn't answer in time." : "Could not reach Groq.";
  if (err.status === 401) return "Groq rejected this API key.";
  if (err.status === 404) return err.message;
  if (err.status === 429) return "Groq rate limit hit, try again in a minute.";
  if (err.status >= 500) return "Groq is having trouble right now, try again shortly.";
  return `Groq refused the request (${err.status}).`;
}
