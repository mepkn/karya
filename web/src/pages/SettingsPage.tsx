import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AiKeySection } from "@/components/settings/AiKeySection";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { JiraSection } from "@/components/settings/JiraSection";

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
  const setProvider = useMutation(api.settings.setAiProvider);
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
        <JiraSection
          connected={viewer.jiraConnected}
          siteName={viewer.jiraSiteName}
          siteUrl={viewer.jiraSiteUrl}
          pendingSites={viewer.jiraPendingSites}
          lastSyncedAt={viewer.jiraLastSyncedAt}
        />
      </Section>

      <Section title="Gemini API key">
        <AiKeySection provider="gemini" hasKey={viewer.hasGeminiKey} />
      </Section>

      <Section title="Groq API key">
        <AiKeySection provider="groq" hasKey={viewer.hasGroqKey} />
      </Section>

      {viewer.hasGeminiKey && viewer.hasGroqKey && (
        <Section title="AI provider">
          <p className="mb-3 text-sm text-muted-foreground">Tried first for every AI call. If it fails, Karya uses the other one.</p>
          <ToggleGroup
            variant="outline"
            value={[viewer.aiProvider]}
            onValueChange={(v: string[]) => {
              const next = v[0];
              if (next === "gemini" || next === "groq") {
                setProvider({ provider: next }).catch(() => toast.error("Could not save"));
              }
            }}
          >
            <ToggleGroupItem value="gemini">Gemini first</ToggleGroupItem>
            <ToggleGroupItem value="groq">Groq first</ToggleGroupItem>
          </ToggleGroup>
        </Section>
      )}

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
