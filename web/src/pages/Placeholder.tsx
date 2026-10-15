/** Stand-in for a screen that a later milestone builds. */
export function Placeholder({ title, milestone }: { title: string; milestone: number }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm">Arrives in milestone {milestone}.</p>
    </div>
  );
}
