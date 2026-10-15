import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, ClipboardCopy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { formatMinutes } from "@shared/execute";
import { CATEGORIES, CATEGORY_LABEL, MAX_NOTE_CHARS, MIN_BONUS_MINUTES, standupMarkdown, type Category } from "@shared/scope";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RESOLUTION_LABEL: Record<Doc<"scopeCreepItems">["resolution"], string> = {
  parked: "Parked",
  promoted_to_slice: "Bonus slice",
  deferred_to_backlog: "Backlog",
  dismissed: "Dismissed",
};

const CATEGORY_TONE: Record<Category, string> = {
  refactor: "border-calm/50 text-calm",
  edge_case: "border-wrap/50 text-wrap",
  bug: "border-over/50 text-over",
};

/** brief §7f: catch scope creep without leaving the timer. */
export function ScopeCatcher({ ticket, slices, stampSliceId }: { ticket: Doc<"tickets">; slices: Doc<"slices">[]; stampSliceId: Id<"slices"> | undefined }) {
  const items = useQuery(api.scope.list, { ticketId: ticket._id });
  const add = useMutation(api.scope.add);
  const deferParked = useMutation(api.scope.deferParked);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category>("edge_case");
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const open = ticket.karyaStatus === "in_progress";

  // Alt+N from anywhere focuses the catcher; Esc hands focus back.
  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.altKey && e.code === "KeyN") {
        e.preventDefault();
        if (document.activeElement !== inputRef.current) returnTo.current = document.activeElement as HTMLElement | null;
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.blur();
      returnTo.current?.focus();
      returnTo.current = null;
    } else if (note === "" && ["1", "2", "3"].includes(e.key)) {
      // Digits pick the category until the note is started.
      e.preventDefault();
      setCategory(CATEGORIES[Number(e.key) - 1]);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await add({ ticketId: ticket._id, sliceId: stampSliceId, note, category });
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err, "Could not park it."));
    }
  }

  const parked = (items ?? []).filter((i) => i.resolution === "parked");
  const resolved = (items ?? []).filter((i) => i.resolution !== "parked");
  const mainDone = slices.some((s) => !s.isBonus) && slices.filter((s) => !s.isBonus).every((s) => s.status === "completed");
  const bufferLeft = Math.max(0, (ticket.bufferShieldSeconds ?? 0) - ticket.bufferUsedSeconds);
  const sliceTitle = new Map(slices.map((s) => [s._id, s.title]));

  async function copyForStandup() {
    try {
      await navigator.clipboard.writeText(standupMarkdown(ticket.jiraKey, parked));
      await deferParked({ ticketId: ticket._id });
      toast.success("Copied, and moved to the backlog");
    } catch (err) {
      toast.error(errorMessage(err, "Could not copy."));
    }
  }

  return (
    <section aria-label="Scope creep" className="w-full max-w-sm space-y-2">
      {open && (
        <form onSubmit={submit} className="rounded-lg border bg-card p-2">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-calm" aria-hidden>
              &gt;
            </span>
            <input
              ref={inputRef}
              value={note}
              maxLength={MAX_NOTE_CHARS}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Park a thought… (Alt+N)"
              aria-label="Scope creep note. Enter saves, 1 2 3 pick the category while empty, Esc leaves."
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  category === c ? CATEGORY_TONE[c] : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="font-mono opacity-60">{i + 1}</span> {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </form>
      )}

      {open && mainDone && parked.length > 0 && (
        <div className="space-y-2 rounded-lg border border-done/40 bg-done/10 p-3 text-sm">
          {bufferLeft >= MIN_BONUS_MINUTES * 60 ? (
            <p>You finished with {formatMinutes(bufferLeft)} of shield left — promote any parked items to bonus slices?</p>
          ) : (
            <p>The planned slices are done. Take the parked items to standup or follow-up tickets.</p>
          )}
          <Button size="sm" variant="outline" onClick={copyForStandup}>
            <ClipboardCopy /> Copy for standup / follow-up tickets
          </Button>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-1">
          {[...parked, ...resolved].map((item) => (
            <ItemRow
              key={item._id}
              item={item}
              sliceTitle={item.sliceId ? sliceTitle.get(item.sliceId) : undefined}
              canEdit={open}
              promoteLeft={open && mainDone && item.resolution === "parked" && bufferLeft >= MIN_BONUS_MINUTES * 60 ? bufferLeft : 0}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({ item, sliceTitle, canEdit, promoteLeft }: { item: Doc<"scopeCreepItems">; sliceTitle?: string; canEdit: boolean; promoteLeft: number }) {
  const setCategory = useMutation(api.scope.setCategory);
  const dismiss = useMutation(api.scope.dismiss);
  const unpark = useMutation(api.scope.unpark);
  const promote = useMutation(api.scope.promote);
  const [minutes, setMinutes] = useState("");
  const parked = item.resolution === "parked";
  const suggested = Math.min(30, Math.floor(promoteLeft / 60));

  const run = (p: Promise<unknown>, ok?: string) =>
    p.then(
      () => ok && toast.success(ok),
      (err: unknown) => toast.error(errorMessage(err)),
    );

  function nextCategory() {
    const c = CATEGORIES[(CATEGORIES.indexOf(item.category) + 1) % CATEGORIES.length];
    void run(setCategory({ itemId: item._id, category: c }));
  }

  function submitPromote(e: FormEvent) {
    e.preventDefault();
    void run(promote({ itemId: item._id, minutes: Number(minutes || suggested) }), "Added a bonus slice");
  }

  return (
    <li className={cn("rounded-lg border px-3 py-2 text-sm", !parked && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words">{item.note}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={!canEdit}
              onClick={nextCategory}
              title={canEdit ? "Change category" : undefined}
              className={cn("rounded-full border px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", CATEGORY_TONE[item.category])}
            >
              {CATEGORY_LABEL[item.category]}
            </button>
            {sliceTitle && <span className="truncate">during “{sliceTitle}”</span>}
            {!parked && <span>· {RESOLUTION_LABEL[item.resolution]}</span>}
          </p>
        </div>
        {canEdit && parked && (
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => run(dismiss({ itemId: item._id }))}>
            <X />
          </Button>
        )}
        {canEdit && (item.resolution === "dismissed" || item.resolution === "deferred_to_backlog") && (
          <Button variant="ghost" size="icon-sm" aria-label="Park again" onClick={() => run(unpark({ itemId: item._id }))}>
            <RotateCcw />
          </Button>
        )}
      </div>
      {promoteLeft > 0 && (
        <form onSubmit={submitPromote} className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={MIN_BONUS_MINUTES}
            max={Math.floor(promoteLeft / 60)}
            step="5"
            className="h-7 w-20 text-right"
            value={minutes}
            placeholder={String(suggested)}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Bonus slice minutes"
          />
          <span className="text-xs text-muted-foreground">min</span>
          <Button size="sm" variant="outline" type="submit">
            <ArrowUpRight /> Promote to bonus slice
          </Button>
        </form>
      )}
    </li>
  );
}
