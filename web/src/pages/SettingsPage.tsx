import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const viewer = useQuery(api.settings.viewer);
  const setFocus = useMutation(api.settings.setDailyFocusHours);
  const [hours, setHours] = useState<string | null>(null);

  if (!viewer) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  async function saveFocus(e: FormEvent) {
    e.preventDefault();
    try {
      await setFocus({ hours: Number(hours ?? viewer!.dailyFocusHours) });
      setHours(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Section title="Jira">
        <p className="text-sm text-muted-foreground">
          {viewer.jiraConnected ? `Connected to ${viewer.jiraSiteName ?? "Jira"}.` : "Not connected. Read-only Jira connect arrives in milestone 3."}
        </p>
      </Section>

      <Section title="Gemini API key">
        <p className="text-sm text-muted-foreground">
          {viewer.hasGeminiKey ? "A key is saved." : "No key saved. Key save and test arrive in milestone 2."} Get a free key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            aistudio.google.com/apikey
          </a>
          .
        </p>
      </Section>

      <Section title="Focus">
        <form onSubmit={saveFocus}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="focus">Daily focus hours</FieldLabel>
              <Input
                id="focus"
                type="number"
                step="0.5"
                min="0.5"
                max="16"
                className="w-32"
                value={hours ?? String(viewer.dailyFocusHours)}
                onChange={(e) => setHours(e.target.value)}
              />
              <FieldDescription>Hours of real coding you get in a day.</FieldDescription>
            </Field>
            <div>
              <Button type="submit" disabled={hours === null}>
                Save
              </Button>
            </div>
          </FieldGroup>
        </form>
      </Section>
    </div>
  );
}
