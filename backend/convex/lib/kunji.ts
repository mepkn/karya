/**
 * A small client for kunji's AI gateway (kunji SPEC.md → Gateway). karya holds
 * no AI keys: kunji calls the user's own key, picked by their email. Server to
 * server only, with KUNJI_URL (the kunji deployment's .convex.site URL) and
 * KUNJI_SECRET (this app's secret from kunji's registry).
 */
export type KunjiRequest = {
  userEmail: string;
  provider?: "auto" | string;
  model?: "fast" | "smart" | string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  json?: object;
  maxTokens?: number;
  temperature?: number;
};

export type KunjiReply = {
  text: string;
  json?: unknown;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export type KunjiErrorCode = "unauthorized" | "bad_request" | "no_key" | "key_refused" | "rate_limited" | "provider_error";

export class KunjiError extends Error {
  readonly code: KunjiErrorCode;
  constructor(code: KunjiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 120_000;

export async function generate(req: KunjiRequest): Promise<KunjiReply> {
  const url = process.env.KUNJI_URL;
  const secret = process.env.KUNJI_SECRET;
  if (!url || !secret) throw new KunjiError("unauthorized", "KUNJI_URL and KUNJI_SECRET are not set on this deployment.");
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/+$/, "")}/ai/v1/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new KunjiError("provider_error", "Could not reach kunji.");
  }
  const body = (await res.json().catch(() => null)) as (KunjiReply & { error?: { code: KunjiErrorCode; message: string } }) | null;
  if (!res.ok || body === null) {
    throw new KunjiError(body?.error?.code ?? "provider_error", body?.error?.message ?? `kunji error (${res.status}).`);
  }
  return body;
}

/** A message the user can act on, for each error code. */
export function kunjiErrorMessage(err: unknown): string {
  if (!(err instanceof KunjiError)) return "Could not reach kunji.";
  switch (err.code) {
    case "no_key":
      return "Add your AI key at kunji.pknspace.com";
    case "unauthorized":
      console.error("kunji refused karya's secret:", err.message);
      return "Karya isn't connected to kunji right now.";
    default:
      return err.message;
  }
}
