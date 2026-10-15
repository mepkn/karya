import { useMemo, useState } from "react";
import { NavLink } from "react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { badgeClass, ticketBadge } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Left sidebar: synced tickets with a search filter. */
export function Inbox() {
  const tickets = useQuery(api.tickets.list);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!tickets) return [];
    return tickets.filter((t) => !q || t.jiraKey.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q));
  }, [tickets, filter]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar max-md:hidden" aria-label="Jira inbox">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tickets"
            aria-label="Filter tickets"
            className="pl-8"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-1.5">
        {tickets === undefined ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No tickets yet. Connect Jira in Settings, or load demo tickets once milestone 3 lands.
          </p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No tickets match “{filter}”.</p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((t) => {
              const badge = ticketBadge(t);
              return (
                <li key={t._id}>
                  <NavLink
                    to={`/t/${t.jiraKey}`}
                    className={({ isActive }) =>
                      cn(
                        "block rounded-md px-2.5 py-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "bg-accent",
                        t.archivedFromJira && "opacity-60",
                      )
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{t.jiraKey}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", badgeClass[badge.tone])}>{badge.label}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm">{t.summary}</div>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
