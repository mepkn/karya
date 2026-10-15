import { useState, type FormEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Status = { ok: true } | { ok: false; error: string } | null;

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return /look like a Gemini/.test(raw) ? "That doesn't look like a Gemini API key." : "Something went wrong. Try again.";
}

/** Paste → Test → Save. The key goes to Convex once and never comes back to the browser. */
export function GeminiKeySection({ hasKey }: { hasKey: boolean }) {
  const testKey = useAction(api.geminiKey.testKey);
  const saveKey = useAction(api.geminiKey.saveKey);
  const removeKey = useMutation(api.settings.removeGeminiKey);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [editing, setEditing] = useState(false);

  async function run(kind: "test" | "save", fn: () => Promise<Status>) {
    setBusy(kind);
    setStatus(null);
    try {
      const result = await fn();
      setStatus(result);
      if (kind === "save" && result?.ok) {
        toast.success("Gemini key saved");
        setKey("");
        setEditing(false);
      }
    } catch (err) {
      setStatus({ ok: false, error: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await removeKey();
      setStatus(null);
      toast.success("Gemini key removed");
    } finally {
      setBusy(null);
    }
  }

  const statusLine = status && (
    <p className={`flex items-center gap-1.5 text-sm ${status.ok ? "text-done" : "text-destructive"}`} role="status">
      {status.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {status.ok ? "Key works." : status.error}
    </p>
  );

  const link = (
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
      aistudio.google.com/apikey
    </a>
  );

  if (hasKey && !editing) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-primary" /> A key is saved (encrypted). It is only used for your own AI calls.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => void run("test", () => testKey({}))}>
            {busy === "test" && <Spinner />} Test saved key
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button variant="destructive" disabled={busy !== null} onClick={() => void remove()}>
            {busy === "remove" && <Spinner />} Remove
          </Button>
        </div>
        {statusLine}
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run("save", () => saveKey({ key }));
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="gemini-key">API key</FieldLabel>
          <Input
            id="gemini-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setStatus(null);
            }}
          />
          <FieldDescription>Get a free key at {link}. It is encrypted before it is stored.</FieldDescription>
        </Field>
        {statusLine}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!key.trim() || busy !== null} onClick={() => void run("test", () => testKey({ key }))}>
            {busy === "test" && <Spinner />} Test key
          </Button>
          <Button type="submit" disabled={!key.trim() || busy !== null}>
            {busy === "save" && <Spinner />} Test &amp; save
          </Button>
          {hasKey && (
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
